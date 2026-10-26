#!/usr/bin/env node
require('dotenv').config();
const prompt = require('node:readline/promises').createInterface({
  input: process.stdin,
  output: process.stdout
});

const pool = require('../src/config/db');
const { hashPassword, normalizeEmail, USER_ROLES } = require('../src/utils/auth');

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@udupi.local');
  const fullName = process.env.ADMIN_NAME || 'Restaurant Admin';
  const phone = process.env.ADMIN_PHONE || '0000000000';
  const password = process.env.ADMIN_PASSWORD || await prompt.question('Enter a secure password for the initial admin account: ');

  if (!password || password.length < 8) {
    throw new Error('Admin password must be at least 8 characters long');
  }

  const [existing] = await pool.execute('SELECT id FROM users WHERE role = ? LIMIT 1', [USER_ROLES.ADMIN]);
  if (existing.length) {
    console.log('An admin account already exists; no new admin was created.');
    return;
  }

  const passwordHash = await hashPassword(password);
  const [result] = await pool.execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [fullName, email, phone, passwordHash, USER_ROLES.ADMIN]
  );

  console.log(`Admin account created with id ${result.insertId} and email ${email}.`);
  console.log('Store this password in a secure secret manager and do not commit it to source control.');
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    prompt.close();
    await pool.end();
  });
