// backend/src/controllers/documentController.js
// Handles document upload, and orchestrates calling the AI service to
// extract text + generate a personalized 5-question quiz in one flow.

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { extractAndGenerateQuiz } = require('../services/aiService');

const EXT_TO_TYPE = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.txt': 'txt',
};

async function uploadDocument(req, res) {
  let savedFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please choose a PDF, DOCX, PPTX or TXT file.' });
    }

    savedFilePath = req.file.path;

    if (req.file.size === 0) {
      fs.unlinkSync(savedFilePath);
      return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileType = EXT_TO_TYPE[ext];

    const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
    const profile = profileRows[0] || {};

    let aiResult;
    try {
      aiResult = await extractAndGenerateQuiz({
        filePath: savedFilePath,
        fileType,
        profile,
      });
    } catch (aiErr) {
      if (aiErr.message === 'AI_SERVICE_UNAVAILABLE') {
        return res.status(503).json({
          success: false,
          message: 'The AI service is currently unavailable. Please make sure it is running on port 8000 and try again.',
        });
      }
      return res.status(502).json({ success: false, message: `AI processing failed: ${aiErr.message}` });
    }

    if (!aiResult || !aiResult.extractedText || aiResult.extractedText.trim().length === 0) {
      return res.status(422).json({ success: false, message: 'Could not extract any text from this document. Try a different file.' });
    }

    if (!aiResult.questions || aiResult.questions.length !== 5) {
      return res.status(502).json({ success: false, message: 'The AI service returned an invalid quiz. Please try again.' });
    }

    const relativePath = path.relative(path.join(__dirname, '..', '..'), savedFilePath);
    const [docResult] = await pool.query(
      `INSERT INTO documents (user_id, original_filename, file_path, file_type, extracted_text)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, req.file.originalname, relativePath, fileType, aiResult.extractedText]
    );
    const documentId = docResult.insertId;

    const quizTitle = aiResult.topic ? `Quiz: ${aiResult.topic}` : `Quiz on ${req.file.originalname}`;
    const [quizResult] = await pool.query(
      'INSERT INTO quizzes (user_id, document_id, title) VALUES (?, ?, ?)',
      [req.user.id, documentId, quizTitle]
    );
    const quizId = quizResult.insertId;

    for (const q of aiResult.questions) {
      await pool.query(
        `INSERT INTO quiz_questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [quizId, q.question, q.options[0], q.options[1], q.options[2], q.options[3], q.correctAnswer, q.explanation]
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Document processed and quiz generated successfully.',
      document: { id: documentId, filename: req.file.originalname, topic: aiResult.topic || null },
      quizId,
    });
  } catch (err) {
    console.error('[UploadDocument Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error while processing the document.' });
  }
}

async function listDocuments(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.original_filename, d.file_type, d.uploaded_at,
              q.id AS quiz_id, q.title AS quiz_title,
              (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS attempt_count
       FROM documents d
       LEFT JOIN quizzes q ON q.document_id = d.id
       WHERE d.user_id = ?
       ORDER BY d.uploaded_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, documents: rows });
  } catch (err) {
    console.error('[ListDocuments Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching documents.' });
  }
}

async function getDocument(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, original_filename, file_type, extracted_text, uploaded_at
       FROM documents WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    return res.json({ success: true, document: rows[0] });
  } catch (err) {
    console.error('[GetDocument Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching document.' });
  }
}

module.exports = { uploadDocument, listDocuments, getDocument };
