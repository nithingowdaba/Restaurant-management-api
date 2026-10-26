const swaggerJsdoc = require('swagger-jsdoc');

const errorResponse = {
  description: 'Validation, missing resource, conflict, or server error',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      examples: {
        error: {
          value: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: [{ field: 'id', message: 'id must be a positive integer' }]
            }
          }
        }
      }
    }
  }
};
const responses = (successDescription, example, status = '200') => ({ [status]: { description: successDescription, content: { 'application/json': { schema: { $ref: status === '200' ? '#/components/schemas/SingleResponse' : '#/components/schemas/SingleResponse' }, examples: { success: { value: example } } } } }, '400': errorResponse, '404': errorResponse, '409': errorResponse, '500': errorResponse });
const pathId = { in: 'path', name: 'id', required: true, schema: { type: 'integer', minimum: 1 }, example: 1 };
const jsonBody = schema => ({ required: true, content: { 'application/json': { schema, example: schema.example } } });
const menu = { id: 1, name: 'Masala Dosa', description: 'Dosa with spiced potato', category: 'Breakfast', price: '85.00', is_available: true, created_at: '2026-10-26T08:00:00.000Z', updated_at: '2026-10-26T08:00:00.000Z' };
const order = { id: 1, customer_name: 'Ananya Rao', phone: '9876543210', payment_method: 'upi', total_amount: '170.00', status: 'pending', created_at: '2026-10-26T08:00:00.000Z', updated_at: '2026-10-26T08:00:00.000Z' };
const menuCreate = { type: 'object', required: ['name','category','price'], properties: { name: { type: 'string', maxLength: 120 }, description: { type: 'string', nullable: true }, category: { type: 'string', maxLength: 80 }, price: { type: 'number', exclusiveMinimum: 0 }, is_available: { type: 'boolean' } }, example: { name: 'Masala Dosa', description: 'Dosa with spiced potato', category: 'Breakfast', price: 85, is_available: true } };
const orderCreate = { type: 'object', required: ['customer_name','phone','payment_method','items'], properties: { customer_name: { type: 'string', maxLength: 120 }, phone: { type: 'string', minLength: 5, maxLength: 20 }, payment_method: { type: 'string', enum: ['cash','upi','card'] }, items: { type: 'array', minItems: 1, items: { type: 'object', required: ['menu_item_id','quantity'], properties: { menu_item_id: { type: 'integer', minimum: 1 }, quantity: { type: 'integer', minimum: 1, maximum: 999 } } } } }, example: { customer_name: 'Ananya Rao', phone: '9876543210', payment_method: 'upi', items: [{ menu_item_id: 1, quantity: 2 }] } };

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0', info: { title: 'Udupi Hotel API', version: '1.0.0', description: 'Restaurant menu and order management API. Top-selling quantities include completed orders only.' }, servers: [{ url: 'http://localhost:3000' }],
    components: { schemas: {
      Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string', example: 'Request validation failed' }, details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } } } } } },
      SingleResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { type: 'object', additionalProperties: true } } },
      CollectionResponse: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: { type: 'array', items: { type: 'object', additionalProperties: true } }, meta: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } } },
      MenuItem: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string', nullable: true }, category: { type: 'string' }, price: { type: 'string', example: '85.00' }, is_available: { type: 'boolean' }, created_at: { type: 'string', format: 'date-time' }, updated_at: { type: 'string', format: 'date-time' } } },
      Order: { type: 'object', properties: { id: { type: 'integer' }, customer_name: { type: 'string' }, phone: { type: 'string' }, payment_method: { type: 'string', enum: ['cash','upi','card'] }, total_amount: { type: 'string', example: '170.00' }, status: { type: 'string', enum: ['pending','confirmed','preparing','ready','completed','cancelled'] } } }
    } },
    paths: {
      '/api/health': { get: { summary: 'Check application and database connectivity', responses: responses('Database is connected', { success: true, data: { status: 'ok', database: 'connected' } }) } },
      '/api/menu-items': {
        get: { summary: 'List menu items with filters and pagination', parameters: [{ in: 'query', name: 'search', schema: { type: 'string' }, example: 'dosa' }, { in: 'query', name: 'category', schema: { type: 'string' }, example: 'Breakfast' }, { in: 'query', name: 'available', schema: { type: 'boolean' } }, { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 }, example: 1 }, { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 }, example: 20 }], responses: { '200': { description: 'Menu collection', content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionResponse' }, example: { success: true, data: [menu], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } }, '400': errorResponse, '500': errorResponse } },
        post: { summary: 'Create a menu item', requestBody: jsonBody(menuCreate), responses: responses('Menu item created', { success: true, data: menu }, '201') }
      },
      '/api/menu-items/{id}': { parameters: [pathId], get: { summary: 'Retrieve one menu item', responses: responses('Menu item', { success: true, data: menu }) }, patch: { summary: 'Update supplied menu fields', requestBody: jsonBody({ ...menuCreate, required: [], example: { price: 90 } }), responses: responses('Menu item updated', { success: true, data: menu }) } },
      '/api/menu-items/{id}/availability': { parameters: [pathId], patch: { summary: 'Set availability with a JSON boolean', requestBody: jsonBody({ type: 'object', required: ['is_available'], properties: { is_available: { type: 'boolean' } }, example: { is_available: false } }), responses: responses('Availability updated', { success: true, data: menu }) } },
      '/api/orders': {
        get: { summary: 'List orders', parameters: [{ in: 'query', name: 'status', schema: { type: 'string', enum: ['pending','confirmed','preparing','ready','completed','cancelled'] } }, { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } }, { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } }], responses: { '200': { description: 'Order collection', content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionResponse' }, example: { success: true, data: [order], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } }, '400': errorResponse, '500': errorResponse } },
        post: { summary: 'Create order; prices and totals are calculated by the server', requestBody: jsonBody(orderCreate), responses: responses('Order and item snapshots created', { success: true, data: { ...order, items: [{ id: 1, order_id: 1, menu_item_id: 1, item_name: 'Masala Dosa', unit_price: '85.00', quantity: 2, subtotal: '170.00' }] } }, '201') }
      },
      '/api/orders/{id}': { parameters: [pathId], get: { summary: 'Retrieve order and item snapshots', responses: responses('Order with items', { success: true, data: { ...order, items: [{ id: 1, menu_item_id: 1, item_name: 'Masala Dosa', unit_price: '85.00', quantity: 2, subtotal: '170.00' }] } }) } },
      '/api/orders/{id}/status': { parameters: [pathId], patch: { summary: 'Advance status along pending → confirmed → preparing → ready → completed', requestBody: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['pending','confirmed','preparing','ready','completed'] } }, example: { status: 'confirmed' } }), responses: { ...responses('Order status updated', { success: true, data: { ...order, status: 'confirmed' } }), '409': errorResponse } } },
      '/api/orders/{id}/cancel': { parameters: [pathId], patch: { summary: 'Cancel an order only while pending or confirmed', responses: { ...responses('Order cancelled', { success: true, data: { ...order, status: 'cancelled' } }), '409': errorResponse } } },
      '/api/reports/daily-sales': { get: { summary: 'Completed sales for a date (defaults to Asia/Kolkata today)', parameters: [{ in: 'query', name: 'date', schema: { type: 'string', format: 'date' }, example: '2026-10-26' }], responses: responses('Daily sales summary', { success: true, data: { date: '2026-10-26', completed_order_count: 4, total_sales: '620.00' } }) } },
      '/api/reports/top-selling-items': { get: { summary: 'Rank item quantities from completed orders only', parameters: [{ in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } }, { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } }, { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } }], responses: { '200': { description: 'Ranked completed-order items', content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionResponse' }, example: { success: true, data: [{ menu_item_id: 1, item_name: 'Masala Dosa', quantity_sold: '12' }], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } } } } }, '400': errorResponse, '500': errorResponse } } }
    }
  }, apis: []
});
