// backend/src/server.js
// Entry point for the SkillStat AI Express backend.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { testConnection } = require('./config/db');
const { syncProviderCatalog } = require('./providers/providerResolver');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const documentRoutes = require('./routes/documentRoutes');
const quizRoutes = require('./routes/quizRoutes');
const resultRoutes = require('./routes/resultRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const competencyRoutes = require('./routes/competencyRoutes');
const skillGapRoutes = require('./routes/skillGapRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const learningPathRoutes = require('./routes/learningPathRoutes');
const diagnosticRoutes = require('./routes/diagnosticRoutes');
const providerRoutes = require('./routes/providerRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ---- Middleware ----
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
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
app.use('/api/competencies', competencyRoutes);
app.use('/api/skill-gaps', skillGapRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/learning-path', learningPathRoutes);
app.use('/api/diagnostic', diagnosticRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/admin', adminRoutes);

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ---- Global error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed JSON bodies are the client's fault, not a server error.
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ success: false, message: 'Malformed request body.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large.' });
  }
  // Full detail goes to the server log only - never to the client.
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
});

// ---- Start server ----
async function start() {
  await testConnection(); // Logs a warning if DB isn't reachable, but doesn't block startup
  // Sync the prototype iGOT/NSSTA provider catalogues into `learning_resources`.
  // Never blocks startup (see providerResolver.js); logs and continues if the
  // DB isn't reachable yet.
  await syncProviderCatalog();
  app.listen(PORT, () => {
    console.log(`\n✅ SkillStat AI backend running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

start();
