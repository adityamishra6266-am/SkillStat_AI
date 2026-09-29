// backend/src/config/db.js
// MySQL connection pool using mysql2/promise. Reads credentials from .env
// so nothing is hard-coded in source. Works with any local MySQL / MariaDB
// installation (including XAMPP) - set DB_HOST / DB_PORT / DB_USER / DB_PASSWORD.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'skillstat_ai',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[DB] MySQL connection successful.');
    return true;
  } catch (err) {
    console.error('[DB] MySQL connection failed:', err.message);
    console.error(
      '[DB] Make sure MySQL is running on DB_HOST:DB_PORT and the skillstat_ai database exists (run `npm run db:setup` in backend/, or import database/final_setup.sql).'
    );
    return false;
  }
}

module.exports = { pool, testConnection };
