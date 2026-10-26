const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/db');
const { hashPassword, USER_ROLES } = require('../src/utils/auth');

const base = () => {
  const server = app.listen(0);
  return new Promise((resolve) => {
    server.on('listening', () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api` });
    });
  });
};

async function request(baseUrl, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function login(baseUrl, email, password) {
  const response = await request(baseUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert.equal(response.status, 200, 'Login should succeed');
  assert.ok(response.data?.data?.token, 'JWT token must be present on successful login');
  return response.data.data.token;
}

async function seedUser({ fullName, email, phone, password, role }) {
  const passwordHash = await hashPassword(password);
  const [result] = await pool.execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [fullName, email, phone, passwordHash, role]
  );
  return result.insertId;
}

test('customer, staff and admin auth plus status transitions follow the expected workflow', async (t) => {
  const { server, baseUrl } = await base();
  t.after(async () => {
    await pool.end();
    server.close();
  });

  const customerEmail = `customer${Date.now()}@example.com`;
  const customerPassword = 'StrongPass123!';
  const customerId = await seedUser({
    fullName: 'Flow Customer',
    email: customerEmail,
    phone: '1111111111',
    password: customerPassword,
    role: USER_ROLES.CUSTOMER
  });

  const staffEmail = `staff${Date.now()}@example.com`;
  const staffPassword = 'StaffPass123!';
  const staffId = await seedUser({
    fullName: 'Flow Staff',
    email: staffEmail,
    phone: '2222222222',
    password: staffPassword,
    role: USER_ROLES.STAFF
  });

  const adminEmail = `admin${Date.now()}@example.com`;
  const adminPassword = 'AdminPass123!';
  const adminId = await seedUser({
    fullName: 'Flow Admin',
    email: adminEmail,
    phone: '3333333333',
    password: adminPassword,
    role: USER_ROLES.ADMIN
  });

  const customerToken = await login(baseUrl, customerEmail, customerPassword);
  const adminToken = await login(baseUrl, adminEmail, adminPassword);
  const staffToken = await login(baseUrl, staffEmail, staffPassword);

  const menuList = await request(baseUrl, '/menu-items');
  assert.equal(menuList.status, 200, 'Menu listing should succeed');
  assert.ok(Array.isArray(menuList.data?.data), 'Menu data should be an array');
  const menuItem = menuList.data.data[0];
  assert.ok(menuItem?.id, 'At least one menu item should be available for test orders');

  const newOrder = await request(baseUrl, '/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ payment_method: 'upi', items: [{ menu_item_id: menuItem.id, quantity: 1 }] })
  });
  assert.equal(newOrder.status, 201, 'Customer should be able to place an order');
  const orderId = newOrder.data.data.id;

  const customerStatusAttempt = await request(baseUrl, `/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(customerStatusAttempt.status, 403, 'Customer should not be able to advance order status');

  const invalidTokenStatus = await request(baseUrl, `/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer invalidtoken' },
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(invalidTokenStatus.status, 401, 'Invalid token should be rejected');

  const missingTokenStatus = await request(baseUrl, `/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(missingTokenStatus.status, 401, 'Missing token should be rejected');

  const expiredToken = jwt.sign({ sub: String(adminId) }, process.env.JWT_SECRET, { expiresIn: '-1s', issuer: 'udupi-hotel-api' });
  const expiredTokenStatus = await request(baseUrl, `/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${expiredToken}` },
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(expiredTokenStatus.status, 401, 'Expired token should be rejected');

  const validTransitions = ['confirmed', 'preparing', 'ready', 'completed'];
  for (const nextStatus of validTransitions) {
    const update = await request(baseUrl, `/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ status: nextStatus })
    });
    assert.equal(update.status, 200, `Staff should be able to advance to ${nextStatus}`);
    assert.equal(update.data.data.status, nextStatus, 'Persisted status should match API response');
  }

  const invalidTransition = await request(baseUrl, `/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ status: 'ready' })
  });
  assert.equal(invalidTransition.status, 409, 'Invalid transition after completed should be rejected');

  const secondOrder = await request(baseUrl, '/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ payment_method: 'cash', items: [{ menu_item_id: menuItem.id, quantity: 1 }] })
  });
  assert.equal(secondOrder.status, 201, 'Customer should be able to create a second order');
  const secondOrderId = secondOrder.data.data.id;

  const secondOrderCustomerCancel = await request(baseUrl, `/orders/${secondOrderId}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  assert.equal(secondOrderCustomerCancel.status, 200, 'Customer should be able to cancel a pending order');
  assert.equal(secondOrderCustomerCancel.data.data.status, 'cancelled', 'Cancelled order should be persisted');

  const adminCancelAttempt = await request(baseUrl, `/orders/${orderId}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminCancelAttempt.status, 409, 'Completed order should not be cancelable');

  const otherCustomerEmail = `other${Date.now()}@example.com`;
  const otherCustomerPassword = 'StrongPass123!';
  const otherCustomerId = await seedUser({
    fullName: 'Other Customer',
    email: otherCustomerEmail,
    phone: '4444444444',
    password: otherCustomerPassword,
    role: USER_ROLES.CUSTOMER
  });
  const otherCustomerToken = await login(baseUrl, otherCustomerEmail, otherCustomerPassword);

  const otherCustomerOrderAccess = await request(baseUrl, `/orders/${orderId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${otherCustomerToken}` }
  });
  assert.equal(otherCustomerOrderAccess.status, 404, 'Customer must not access another customer order');

  const adminEligibleOrder = await request(baseUrl, '/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ payment_method: 'card', items: [{ menu_item_id: menuItem.id, quantity: 2 }] })
  });
  const adminEligibleOrderId = adminEligibleOrder.data.data.id;

  const adminCanUpdate = await request(baseUrl, `/orders/${adminEligibleOrderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(adminCanUpdate.status, 200, 'Admin should be able to update an eligible order');

  const staffCanUpdate = await request(baseUrl, `/orders/${adminEligibleOrderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({ status: 'preparing' })
  });
  assert.equal(staffCanUpdate.status, 200, 'Staff should be able to update an eligible order');

  assert.ok(Number.isInteger(customerId));
  assert.ok(Number.isInteger(staffId));
  assert.ok(Number.isInteger(adminId));
  assert.ok(Number.isInteger(otherCustomerId));
});
