// backend/scripts/createAdmin.js
// Creates (or promotes) an administrator account. Admin accounts can never be
// created through public registration.
//   npm run create-admin -- "Admin Name" admin@example.com "StrongPassword"
// If the email already exists that account is promoted to admin and its
// password is left unchanged.

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email) {
    console.error('Usage: npm run create-admin -- "Admin Name" admin@example.com "Password"');
    process.exit(1);
  }
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    await pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [existing[0].id]);
    console.log(`Existing account ${email} promoted to administrator.`);
  } else {
    if (!password || password.length < 6) {
      console.error('A password of at least 6 characters is required for a new account.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')", [name, email, hash]);
    await pool.query('INSERT INTO profiles (user_id) VALUES (?)', [result.insertId]);
    console.log(`Administrator ${email} created.`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('create-admin failed:', err.message);
  process.exit(1);
});
