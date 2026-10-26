# Udupi Hotel Ordering API

A small Express + MySQL REST API for menu management, restaurant orders, and basic sales reports. It uses CommonJS and `mysql2/promise`; order totals are always computed by the server.

## Folder guide

- `src/server.js` starts the HTTP server; `src/app.js` wires middleware and routes.
- `src/config/db.js` creates the shared MySQL connection pool. `swagger.js` defines the OpenAPI page.
- `src/routes/index.js` contains the endpoint handlers and their SQL. The `asyncHandler` helper forwards failures to the central error handler.
- `src/middleware` holds request validation and consistent errors. `src/utils/money.js` converts currency to integer paise.
- `database/schema.sql` creates the tables safely and inserts starter dishes. `test/` has the pure unit test.

## Setup

Requirements: Node.js 18+ and MySQL 8.0.

1. Create the schema and sample menu rows. From a MySQL client, run `SOURCE /absolute/path/to/udupi-hotel-api/database/schema.sql;`. The script uses `CREATE DATABASE/TABLE IF NOT EXISTS` and does not drop existing data. Starter rows are inserted only if that name/category pair is not already present.
2. Copy `.env.example` to `.env`, then set the local MySQL username and password. Set `DB_NAME=udupi_hotel` unless you changed the schema database name.
3. Run `npm install`, then `npm run dev` for development or `npm start` normally.
4. Check `GET http://localhost:3000/api/health`. Interactive API docs are at `http://localhost:3000/api-docs`.
5. Import `postman/Udupi-Hotel-API.postman_collection.json` into Postman. It defines a `baseUrl` variable; requests use example menu/order IDs, so update those IDs to match your returned data.

## API contract

Success: `{ "success": true, "data": resource }`. Collection responses include `meta` with `page`, `limit`, `total`, and `totalPages`. Errors use `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | App and DB check |
| `GET /api/menu-items?search=&category=&available=true&page=1&limit=20` | Filter/paginate menu |
| `GET /api/menu-items/:id` | One item |
| `POST /api/menu-items` | Add item: name, category, positive price; optional description and availability |
| `PATCH /api/menu-items/:id` | Update supplied menu fields |
| `PATCH /api/menu-items/:id/availability` | Set `{ "is_available": false }` |
| `POST /api/orders` | Create customer order |
| `GET /api/orders?status=pending&page=1&limit=20` | Paginated order history |
| `GET /api/orders/:id` | Order with item snapshots |
| `PATCH /api/orders/:id/status` | Set pending/confirmed/preparing/ready/completed |
| `PATCH /api/orders/:id/cancel` | Cancel pending/confirmed order |
| `GET /api/reports/daily-sales?date=2026-10-26` | Completed sales for a date; date defaults to today |
| `GET /api/reports/top-selling-items?limit=10&from=2026-10-01&to=2026-10-26` | Quantities ranked; dates optional |

Example order body (replace IDs with available menu item IDs):

```json
{
  "customer_name": "Ananya Rao",
  "phone": "9876543210",
  "payment_method": "upi",
  "items": [{ "menu_item_id": 1, "quantity": 2 }, { "menu_item_id": 5, "quantity": 1 }]
}
```

The API intentionally does not accept prices or totals from clients. A transaction locks the selected menu rows, checks availability, calculates integer paise, inserts the order and its historical item snapshots, then commits. A failure rolls the whole operation back. Status updates follow pending → confirmed → preparing → ready → completed; cancellation is available only for pending or confirmed orders. Daily sales defaults to the current Asia/Kolkata date. Top-selling quantities count completed orders only. The menu foreign key uses `RESTRICT`; menu rows with order history cannot be deleted. No delete endpoint is exposed.

## Testing and demo

- Run `npm test` for the money calculation test.
- In Postman: health → list menu → create an order → fetch that order → mark it completed → check daily sales and top sellers. Try an unavailable item to demonstrate a clean `409` response and a missing ID to demonstrate `404`.
- Run `git status` and commit the working API and a sanitized `.env.example`; never commit `.env`.

## Two-day plan

**Day 1:** Install packages, initialize MySQL, check health/menu endpoints, import Postman collection, create orders, and walk through transaction and snapshot behavior. Fix any local connection/configuration issues.

**Day 2:** Test validation, pagination, cancellation rules, and reports in Postman. Have your teammate review the documented request/response shapes, agree on IDs and status behavior, then rehearse a short demo: menu → order → status update → report. Commit a stable version before presenting.
