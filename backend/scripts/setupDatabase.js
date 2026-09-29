// backend/scripts/setupDatabase.js
// Runs database/final_setup.sql against the MySQL server configured in .env,
// so the mysql command-line client is NOT required.
//   npm run db:setup
// Safe to re-run (see the header of final_setup.sql).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sqlPath = path.join(__dirname, '..', '..', 'database', 'final_setup.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    const [[c]] = await conn.query('SELECT COUNT(*) AS n FROM skillstat_ai.competencies');
    const [[q]] = await conn.query('SELECT COUNT(*) AS n FROM skillstat_ai.diagnostic_questions');
    const [[r]] = await conn.query('SELECT COUNT(*) AS n FROM skillstat_ai.learning_resources');
    console.log(`Database ready: ${c.n} competencies, ${q.n} curated assessment questions, ${r.n} prototype learning resources.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Database setup failed:', err.message);
  console.error('Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD in backend/.env and that MySQL is running.');
  process.exit(1);
});
