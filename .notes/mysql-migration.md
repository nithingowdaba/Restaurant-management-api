# MySQL migration note

- MySQL versions in this environment do not accept `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or `ADD CONSTRAINT IF NOT EXISTS` syntax.
- Use `INFORMATION_SCHEMA` checks and prepared dynamic SQL when migrating an existing database.
- Apply `database/auth-migration.sql` before enabling customer-scoped order access.
