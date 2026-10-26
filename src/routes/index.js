const router = require('express').Router();
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { asyncHandler, single, collection, httpError } = require('../utils/http');
const pool = require('../config/db');
const { toPaise, fromPaise } = require('../utils/money');

const idRule = param('id').isInt({ min: 1 }).withMessage('id must be a positive integer');
const pagination = [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })];
const menuFields = [body('name').isString().trim().isLength({ min: 1, max: 120 }), body('description').optional({ nullable: true }).isString(), body('category').isString().trim().isLength({ min: 1, max: 80 }), body('price').isDecimal({ decimal_digits: '0,2' }).custom(v => Number(v) > 0)];
const strictBoolean = field => body(field).custom(value => typeof value === 'boolean').withMessage(`${field} must be a JSON boolean`);

router.get('/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  single(res, { status: 'ok', database: 'connected' });
}));

router.get('/menu-items', [...pagination, query('search').optional().isString(), query('category').optional().isString(), query('available').optional().isIn(['true', 'false']), validate], asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20), offset = (page - 1) * limit;
  const where = [], args = [];
  if (req.query.search) { where.push('(name LIKE ? OR description LIKE ?)'); args.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
  if (req.query.available !== undefined) { where.push('is_available = ?'); args.push(req.query.available === 'true'); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM menu_items ${clause}`, args);
  const [rows] = await pool.query(`SELECT * FROM menu_items ${clause} ORDER BY category, name LIMIT ? OFFSET ?`, [...args, limit, offset]);
  collection(res, rows, page, limit, Number(count.total));
}));

router.get('/menu-items/:id', [idRule, validate], asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  single(res, rows[0]);
}));

router.post('/menu-items', [...menuFields, strictBoolean('is_available').optional(), validate], asyncHandler(async (req, res) => {
  const { name, description = null, category, price, is_available = true } = req.body;
  const [result] = await pool.execute('INSERT INTO menu_items (name, description, category, price, is_available) VALUES (?, ?, ?, ?, ?)', [name, description, category, Number(price).toFixed(2), is_available === undefined ? true : is_available]);
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
  single(res, rows[0], 201);
}));

router.patch('/menu-items/:id', [idRule, body().isObject(), body('name').optional().isString().trim().isLength({ min: 1, max: 120 }), body('description').optional({ nullable: true }).isString(), body('category').optional().isString().trim().isLength({ min: 1, max: 80 }), body('price').optional().isDecimal({ decimal_digits: '0,2' }).custom(v => Number(v) > 0), strictBoolean('is_available').optional(), validate], asyncHandler(async (req, res) => {
  const allowed = ['name', 'description', 'category', 'price', 'is_available'];
  const fields = allowed.filter(k => Object.hasOwn(req.body, k));
  if (!fields.length) throw httpError(400, 'EMPTY_UPDATE', 'Provide at least one menu field to update');
  const values = fields.map(k => k === 'price' ? Number(req.body[k]).toFixed(2) : req.body[k]);
  const [result] = await pool.execute(`UPDATE menu_items SET ${fields.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...values, req.params.id]);
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  single(res, rows[0]);
}));

router.patch('/menu-items/:id/availability', [idRule, strictBoolean('is_available'), validate], asyncHandler(async (req, res) => {
  await pool.execute('UPDATE menu_items SET is_available = ? WHERE id = ?', [req.body.is_available, req.params.id]);
  const [rows] = await pool.execute('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found');
  single(res, rows[0]);
}));

router.post('/orders', [body('customer_name').isString().trim().isLength({ min: 1, max: 120 }), body('phone').isString().trim().isLength({ min: 5, max: 20 }), body('payment_method').isIn(['cash', 'upi', 'card']), body('items').isArray({ min: 1 }), body('items.*.menu_item_id').isInt({ min: 1 }), body('items.*.quantity').isInt({ min: 1, max: 999 }), validate], asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock sorted menu rows until commit so availability/prices cannot change mid-order.
    const quantities = new Map();
    for (const item of req.body.items) quantities.set(Number(item.menu_item_id), (quantities.get(Number(item.menu_item_id)) || 0) + Number(item.quantity));
    const ids = [...quantities.keys()].sort((a, b) => a - b);
    const marks = ids.map(() => '?').join(',');
    const [menu] = await conn.execute(`SELECT id, name, price, is_available FROM menu_items WHERE id IN (${marks}) ORDER BY id FOR UPDATE`, ids);
    if (menu.length !== ids.length) throw httpError(400, 'INVALID_MENU_ITEM', 'One or more menu items do not exist');
    const byId = new Map(menu.map(row => [Number(row.id), row]));
    let totalPaise = 0;
    const lines = ids.map(id => {
      const item = byId.get(id); if (!item.is_available) throw httpError(409, 'ITEM_UNAVAILABLE', `${item.name} is unavailable`);
      const unit = toPaise(item.price); const subtotal = unit * quantities.get(id); totalPaise += subtotal;
      return { id, name: item.name, unit, quantity: quantities.get(id), subtotal };
    });
    const [order] = await conn.execute('INSERT INTO orders (customer_name, phone, payment_method, total_amount) VALUES (?, ?, ?, ?)', [req.body.customer_name, req.body.phone, req.body.payment_method, fromPaise(totalPaise)]);
    for (const line of lines) await conn.execute('INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)', [order.insertId, line.id, line.name, fromPaise(line.unit), line.quantity, fromPaise(line.subtotal)]);
    await conn.commit();
    const [orders] = await pool.execute('SELECT * FROM orders WHERE id = ?', [order.insertId]);
    const [orderItems] = await pool.execute('SELECT * FROM order_items WHERE order_id = ?', [order.insertId]);
    single(res, { ...orders[0], items: orderItems }, 201);
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}));

router.get('/orders', [...pagination, query('status').optional().isIn(['pending','confirmed','preparing','ready','completed','cancelled']), validate], asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20), offset = (page - 1) * limit;
  const where = req.query.status ? 'WHERE status = ?' : '', args = req.query.status ? [req.query.status] : [];
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM orders ${where}`, args);
  const [rows] = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  collection(res, rows, page, limit, Number(count.total));
}));

router.get('/orders/:id', [idRule, validate], asyncHandler(async (req, res) => {
  const [orders] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!orders.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]); single(res, { ...orders[0], items });
}));

router.patch('/orders/:id/status', [idRule, body('status').isIn(['pending','confirmed','preparing','ready','completed']), validate], asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    const transitions = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'completed' };
    if (transitions[rows[0].status] !== req.body.status) throw httpError(409, 'INVALID_STATUS_TRANSITION', `Cannot change order status from ${rows[0].status} to ${req.body.status}`);
    await conn.execute('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    await conn.commit();
    const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]); single(res, updated[0]);
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}));

router.patch('/orders/:id/cancel', [idRule, validate], asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT status FROM orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) throw httpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    if (!['pending', 'confirmed'].includes(rows[0].status)) throw httpError(409, 'CANCELLATION_NOT_ALLOWED', 'Only pending or confirmed orders can be cancelled');
    await conn.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [req.params.id]); await conn.commit();
    const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]); single(res, updated[0]);
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}));

router.get('/reports/daily-sales', [query('date').optional().isISO8601({ strict: true }).matches(/^\\d{4}-\\d{2}-\\d{2}$/), validate], asyncHandler(async (req, res) => {
  const date = req.query.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [[row]] = await pool.execute("SELECT COUNT(*) AS order_count, COALESCE(SUM(total_amount), 0.00) AS total_sales FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)", [date, date]);
  single(res, { date, completed_order_count: Number(row.order_count), total_sales: row.total_sales });
}));

router.get('/reports/top-selling-items', [query('limit').optional().isInt({ min: 1, max: 100 }), query('from').optional().isISO8601({ strict: true }).matches(/^\\d{4}-\\d{2}-\\d{2}$/), query('to').optional().isISO8601({ strict: true }).matches(/^\\d{4}-\\d{2}-\d{2}$/), validate], asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 10), conditions = ["o.status = 'completed'"], args = [];
  if (req.query.from) { conditions.push('o.created_at >= ?'); args.push(req.query.from); }
  if (req.query.to) { conditions.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); args.push(req.query.to); }
  const [rows] = await pool.query(`SELECT oi.menu_item_id, oi.item_name, SUM(oi.quantity) AS quantity_sold FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${conditions.join(' AND ')} GROUP BY oi.menu_item_id, oi.item_name ORDER BY quantity_sold DESC, oi.item_name LIMIT ?`, [...args, limit]);
  collection(res, rows, 1, limit, rows.length);
}));

module.exports = router;
