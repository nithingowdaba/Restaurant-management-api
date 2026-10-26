# Udupi Hotel Ordering API

A small Express + MySQL REST API for menu management, restaurant orders, and sales reporting. It uses CommonJS, mysql2/promise, JWT-based authentication, and explicit roles for customers, staff, and admins.

## Folder guide

- `src/server.js` starts the HTTP server; `src/app.js` wires middleware and routes.
- `src/config/db.js` creates the shared MySQL connection pool; `src/config/swagger.js` defines the OpenAPI page.
- `src/routes/index.js` contains the endpoint handlers together with SQL, validation, and auth checks.
- `src/middleware` holds request validation, JWT authentication, authorization, and central error handling.
- `src/utils/auth.js` centralizes password hashing, JWT creation, sanitization, and role logic.
- `database/schema.sql` creates the tables for fresh installs and is safe for new projects.
- `database/auth-migration.sql` is the non-destructive migration for an existing installation and should only be run on a live schema after review.
- `scripts/create-admin.js` creates the initial admin account with a bcrypt-hashed password.
- `test/` contains the unit tests for the auth utilities and money conversion.

## Setup

Requirements: Node.js 18+ and MySQL 8.0.

1. Before changing a live database, review the migration impact. The migration adds a `users` table and a nullable `orders.user_id` foreign key. It does not drop or truncate existing menu or order records. Existing orders without an associated user remain visible to staff/admin only.
2. For a fresh install, run `SOURCE /absolute/path/to/udupi-hotel-api/database/schema.sql;` from a MySQL client. This creates the database and the tables with the authentication model included.
3. For an existing installation, run `SOURCE /absolute/path/to/udupi-hotel-api/database/auth-migration.sql;` only after confirming the schema and sample data are already in an expected state. This is the safe, non-destructive migration path for an active database.
4. Copy `.env.example` to `.env`, then set the MySQL credentials and a strong `JWT_SECRET` value. Keep `.env` out of Git.
5. Run `npm install`, then `npm run dev` or `npm start`.
6. Check `GET http://localhost:3000/api/health` and open `http://localhost:3000/api-docs` for the Swagger UI.
7. Import `postman/Udupi-Hotel-API.postman_collection.json` into Postman. It includes auth requests and a `token` variable.

## Environment variables

Create a `.env` file from `.env.example` with values such as:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=udupi_app
DB_PASSWORD=replace_with_your_local_password
DB_NAME=udupi_hotel
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars
ADMIN_EMAIL=admin@udupi.local
ADMIN_NAME=Restaurant Admin
ADMIN_PHONE=0000000000
ADMIN_PASSWORD=replace_with_a_strong_password_at_least_8_chars
```

The JWT secret is required and must not be committed to source control.

## Creating the initial admin

Run the one-time helper:

```bash
npm run create-admin
```

This script creates the first `ADMIN` user in the `users` table using a bcrypt-hashed password. It does not expose a public admin-registration endpoint and should be used only in a trusted local environment.

## Authentication model

Roles:

- `CUSTOMER`: register, log in, view the public menu, place orders, and view only their own orders.
- `STAFF`: view all orders and reports, update valid order status, and cancel eligible orders.
- `ADMIN`: has staff privileges plus menu management, staff-account creation, and all-order access.

All authorization checks are performed on the server side using the authenticated user record retrieved from MySQL.

## API contract

Success responses: `{ "success": true, "data": resource }`. Collection responses include `meta` with `page`, `limit`, `total`, and `totalPages`. Errors use `{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`.

### Public endpoints

- `GET /api/health`
- `GET /api/menu-items`
- `GET /api/menu-items/:id`
- `POST /api/auth/register`
- `POST /api/auth/login`

### Authenticated customer endpoints

- `GET /api/auth/me`
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/cancel`

### Staff/admin-only endpoints

- `POST /api/auth/staff`
- `POST /api/menu-items`
- `PATCH /api/menu-items/:id`
- `PATCH /api/menu-items/:id/availability`
- `PATCH /api/orders/:id/status`
- `GET /api/reports/daily-sales`
- `GET /api/reports/top-selling-items`

## Example auth requests

### Register a customer

```http
POST /api/auth/register
Content-Type: application/json

{
  "full_name": "Ananya Rao",
  "email": "ananya@example.com",
  "phone": "9876543210",
  "password": "StrongPass123!"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "ananya@example.com",
  "password": "StrongPass123!"
}
```

### Authenticated order creation

```http
POST /api/orders
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "payment_method": "upi",
  "items": [{ "menu_item_id": 1, "quantity": 2 }, { "menu_item_id": 5, "quantity": 1 }]
}
```

The server stores the authenticated user's `full_name` and `phone` from the database for each new order. Clients should not send customer identity fields when creating orders.

## Order status and cancellation rules

- Status transitions remain `pending → confirmed → preparing → ready → completed`.
- Cancellation is permitted only while the status is `pending` or `confirmed`.
- Customers can cancel only their own eligible orders.
- Staff/admin users may cancel any eligible order.
- Daily sales and top-selling summaries count only completed orders.

## Testing and demo

- Run `npm test` for the automated unit tests.
- For a manual verification, register a customer, log in, create an order, fetch only that order, and confirm a customer cannot access another user's order or change order status.
- Then create and log in as an admin, create a staff account, manage a menu item, and verify the sales reports work.

## Migration notes

- For a fresh database, run the full schema file.
- For an existing installation, run the migration file only after reviewing the live schema and application state.
- The migration is non-destructive: it adds a `users` table and a nullable `orders.user_id` column, and it keeps existing orders accessible to staff/admin when there is no associated user.
