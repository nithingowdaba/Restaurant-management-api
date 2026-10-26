const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, sanitizeUser, USER_ROLES, isRoleAllowed } = require('../src/utils/auth');

test('normalizeEmail trims and lowercases email before storage', () => {
  assert.equal(normalizeEmail('  User.Name+Tag@Example.COM  '), 'user.name+tag@example.com');
});

test('sanitizeUser removes password material and keeps the role metadata', () => {
  const user = sanitizeUser({
    id: 9,
    full_name: 'Ananya Rao',
    email: 'ananya@example.com',
    phone: '9876543210',
    password_hash: 'hash',
    role: USER_ROLES.CUSTOMER,
    created_at: '2026-10-26T10:00:00.000Z',
    updated_at: '2026-10-26T10:00:00.000Z'
  });

  assert.deepEqual(user, {
    id: 9,
    full_name: 'Ananya Rao',
    email: 'ananya@example.com',
    phone: '9876543210',
    role: USER_ROLES.CUSTOMER,
    created_at: '2026-10-26T10:00:00.000Z',
    updated_at: '2026-10-26T10:00:00.000Z'
  });
});

test('isRoleAllowed allows only the configured role ladder', () => {
  assert.equal(isRoleAllowed(USER_ROLES.ADMIN, USER_ROLES.ADMIN), true);
  assert.equal(isRoleAllowed(USER_ROLES.STAFF, USER_ROLES.ADMIN), false);
  assert.equal(isRoleAllowed(USER_ROLES.CUSTOMER, USER_ROLES.STAFF), false);
});
