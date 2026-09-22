// backend/src/server.js
// Entry point for the SkillStat AI Express backend.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { testConnection } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const documentRoutes = require('./routes/documentRoutes');
const quizRoutes = require('./routes/quizRoutes');
const resultRoutes = require('./routes/resultRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ---- Middleware ----
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SkillStat AI backend is running.' });
});

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ---- Global error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
});

// ---- Start server ----
async function start() {
  await testConnection(); // Logs a warning if DB isn't reachable, but doesn't block startup
  app.listen(PORT, () => {
    console.log(`\n✅ SkillStat AI backend running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

start();
