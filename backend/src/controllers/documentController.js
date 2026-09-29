// backend/src/controllers/documentController.js
// Learning-material upload, as two real steps so the UI can show genuine
// stages instead of a timer:
//
//   POST /api/documents/upload              save file -> extract text (AI service)
//   POST /api/documents/:id/generate-quiz   personalised quiz -> competency mapping -> stored quiz
//
// Competency-aware: every generated question is mapped to the EXISTING
// competency framework (see questionCompetencyMapper) - or left unmapped
// when no reliable mapping exists. A mapped quiz feeds the adaptive loop;
// an unmapped one is assessed for comprehension only.

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { extractText, generateQuiz } = require('../services/aiService');
const { mapQuestionsToCompetencies } = require('../services/questionCompetencyMapper');
const { findApplicableRequirements } = require('../services/competencyMappingService');
const { getQuizProvenance } = require('../services/quizProvenanceService');
const { validateQuestionSet } = require('../utils/questionValidation');
const { EVIDENCE_MIN_CONFIDENCE } = require('../config/documentMappingConfig');

const EXT_TO_TYPE = { '.pdf': 'pdf', '.docx': 'docx', '.pptx': 'pptx', '.txt': 'txt' };

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('[Upload] Could not remove file:', err.message);
  }
}

/** Cheap content sniffing so a renamed/corrupt file is rejected before it reaches the extractor. */
function contentMatchesType(filePath, fileType) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, read);
    if (fileType === 'pdf') return head.subarray(0, 5).toString('latin1') === '%PDF-';
    if (fileType === 'docx' || fileType === 'pptx') return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b;
    if (fileType === 'txt') return !head.includes(0); // plain text never contains NUL bytes
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function aiErrorResponse(res, err, stage) {
  if (err.message === 'AI_SERVICE_UNAVAILABLE') {
    return res.status(503).json({
      success: false,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'The document processing service is not reachable. Make sure the AI service is running on port 8000 and try again.',
    });
  }
  if (err.message === 'AI_SERVICE_TIMEOUT') {
    return res.status(504).json({ success: false, code: 'AI_SERVICE_TIMEOUT', message: `The document processing service timed out while ${stage}. Please try again.` });
  }
  if (err.status === 422 || err.status === 400) {
    return res.status(422).json({ success: false, code: 'DOCUMENT_UNREADABLE', message: err.message });
  }
  console.error(`[AI Service] Failure while ${stage}:`, err.message);
  return res.status(502).json({ success: false, code: 'AI_SERVICE_ERROR', message: `The document processing service failed while ${stage}. Please try again.` });
}

// ---------------------------------------------------------------- step 1
async function uploadDocument(req, res) {
  let savedFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please choose a PDF, DOCX, PPTX or TXT file.' });
    }
    savedFilePath = req.file.path;

    if (req.file.size === 0) {
      safeUnlink(savedFilePath);
      return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileType = EXT_TO_TYPE[ext];
    if (!fileType || !contentMatchesType(savedFilePath, fileType)) {
      safeUnlink(savedFilePath);
      return res.status(400).json({
        success: false,
        message: `This file does not look like a valid ${ext.replace('.', '').toUpperCase()} document. Please check the file and try again.`,
      });
    }

    let extracted;
    try {
      extracted = await extractText({ filePath: savedFilePath, fileType });
    } catch (aiErr) {
      safeUnlink(savedFilePath);
      return aiErrorResponse(res, aiErr, 'reading your document');
    }

    if (!extracted || !extracted.extractedText || extracted.extractedText.trim().length === 0) {
      safeUnlink(savedFilePath);
      return res.status(422).json({ success: false, message: 'Could not extract any text from this document. Try a different file.' });
    }

    const relativePath = path.relative(path.join(__dirname, '..', '..'), savedFilePath);
    const [docResult] = await pool.query(
      `INSERT INTO documents (user_id, original_filename, file_path, file_type, extracted_text)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, req.file.originalname.slice(0, 255), relativePath, fileType, extracted.extractedText]
    );

    return res.status(201).json({
      success: true,
      message: 'Document uploaded and text extracted.',
      document: {
        id: docResult.insertId,
        filename: req.file.originalname,
        fileType,
        topic: extracted.topic || null,
        characters: extracted.extractedText.length,
      },
    });
  } catch (err) {
    safeUnlink(savedFilePath);
    console.error('[UploadDocument Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error while processing the document.' });
  }
}

// ---------------------------------------------------------------- step 2
function buildMappingMessage(provenance, roleCompetencyIds) {
  const { mapping } = provenance;
  if (mapping.mappedQuestions === 0) {
    return 'This learning material was assessed for comprehension but was not mapped to a competency.';
  }
  const inRole = mapping.competencies.filter((c) => roleCompetencyIds.has(c.competencyId));
  if (inRole.length === 0) {
    return `Questions were mapped to ${mapping.competencies.map((c) => c.name).join(', ')}, but none of these competencies has a requirement configured for your designation, so your competency profile will not change.`;
  }
  return `${mapping.mappedQuestions} of ${mapping.totalQuestions} questions are mapped to ${inRole.map((c) => c.name).join(', ')} and will count as competency evidence.`;
}

async function generateDocumentQuiz(req, res) {
  try {
    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid document id.' });
    }

    const [docRows] = await pool.query(
      'SELECT id, original_filename, extracted_text FROM documents WHERE id = ? AND user_id = ?',
      [documentId, req.user.id]
    );
    if (docRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    const doc = docRows[0];

    // Idempotent: a document keeps its first quiz (re-submitting after a page reload must not duplicate it).
    const [existing] = await pool.query('SELECT id FROM quizzes WHERE document_id = ? AND user_id = ? ORDER BY id LIMIT 1', [documentId, req.user.id]);
    if (existing.length > 0) {
      const provenance = await getQuizProvenance(existing[0].id);
      return res.json({ success: true, alreadyGenerated: true, quizId: existing[0].id, provenance });
    }

    if (!doc.extracted_text || doc.extracted_text.trim().length === 0) {
      return res.status(422).json({ success: false, message: 'This document has no extracted text to build a quiz from.' });
    }

    const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
    const profile = profileRows[0] || {};

    let aiResult;
    try {
      aiResult = await generateQuiz({ text: doc.extracted_text, profile });
    } catch (aiErr) {
      return aiErrorResponse(res, aiErr, 'generating your quiz');
    }

    const validation = validateQuestionSet(aiResult && aiResult.questions, { expectedCount: 5 });
    if (!validation.ok) {
      console.error('[GenerateQuiz] AI service returned an invalid quiz:', validation.reason);
      return res.status(502).json({ success: false, message: 'The AI service returned an invalid quiz. Please try again.' });
    }
    const questions = validation.questions;
    const generationMode = aiResult.generationMode === 'llm' ? 'document_llm' : 'document_extractive';
    const sourceType = aiResult.generationMode === 'llm' ? 'llm' : 'extractive';
    const topic = (aiResult.topic || '').toString().slice(0, 150) || null;

    // Competency mapping - LLM if configured, deterministic keywords otherwise, NULL if unsure.
    const { mappings } = await mapQuestionsToCompetencies({ questions, topic, documentText: doc.extracted_text });

    const conn = await pool.getConnection();
    let quizId;
    try {
      await conn.beginTransaction();
      const title = topic ? `Quiz: ${topic}` : `Quiz on ${doc.original_filename}`;
      const [quizResult] = await conn.query(
        `INSERT INTO quizzes (user_id, document_id, quiz_type, generation_mode, title) VALUES (?, ?, 'Standard', ?, ?)`,
        [req.user.id, documentId, generationMode, title.slice(0, 255)]
      );
      quizId = quizResult.insertId;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const m = mappings[i];
        const mapped = m.competencyId && m.confidence >= EVIDENCE_MIN_CONFIDENCE;
        await conn.query(
          `INSERT INTO quiz_questions
             (quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation,
              competency_id, topic, source_type, mapping_confidence, mapping_method, mapping_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quizId, q.question, q.options[0], q.options[1], q.options[2], q.options[3], q.correctAnswer, q.explanation,
            mapped ? m.competencyId : null,
            topic,
            sourceType,
            mapped ? m.confidence : null,
            mapped ? m.method : null,
            (m.reason || '').slice(0, 500) || null,
          ]
        );
      }
      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    const provenance = await getQuizProvenance(quizId);
    const requirements = await findApplicableRequirements(profile);
    const roleCompetencyIds = new Set(requirements.map((r) => r.competency_id));
    provenance.mapping.competencies = provenance.mapping.competencies.map((c) => ({ ...c, inRoleRequirements: roleCompetencyIds.has(c.competencyId) }));
    const message = buildMappingMessage(provenance, roleCompetencyIds);

    console.log(
      `[QUIZ] Document quiz ${quizId} (${generationMode}) - ${provenance.mapping.mappedQuestions}/${provenance.mapping.totalQuestions} questions mapped to a competency.`
    );

    return res.status(201).json({ success: true, quizId, provenance, mappingMessage: message, topic });
  } catch (err) {
    console.error('[GenerateDocumentQuiz Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error while generating the quiz.' });
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

module.exports = { uploadDocument, generateDocumentQuiz, listDocuments, getDocument };
