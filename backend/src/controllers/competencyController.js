// backend/src/controllers/competencyController.js
// Read-only access to the competency framework.
// Competencies are never hard-coded in application code — they live
// in the `competencies` table and are editable there.

const { pool } = require('../config/db');

async function listCompetencies(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, description, category, is_active, created_at, updated_at
       FROM competencies
       WHERE is_active = 1
       ORDER BY category, name`
    );
    return res.json({ success: true, competencies: rows });
  } catch (err) {
    console.error('[ListCompetencies Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching competencies.' });
  }
}

async function getCompetency(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, description, category, is_active, created_at, updated_at
       FROM competencies WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Competency not found.' });
    }

    const [requirementRows] = await pool.query(
      `SELECT id, designation, department, required_level, weight
       FROM competency_requirements WHERE competency_id = ?
       ORDER BY designation`,
      [req.params.id]
    );

    return res.json({
      success: true,
      competency: { ...rows[0], requirements: requirementRows },
    });
  } catch (err) {
    console.error('[GetCompetency Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching competency.' });
  }
}

module.exports = { listCompetencies, getCompetency };
