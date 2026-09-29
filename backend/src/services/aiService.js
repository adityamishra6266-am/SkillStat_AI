// backend/src/services/aiService.js
// Thin client for the Python FastAPI AI service.
//
//   extractText()            file            -> text + topic
//   generateQuiz()           text + profile  -> validated questions + generationMode
//   classifyQuestionsWithAi() questions      -> optional LLM competency classification
//   generateDiagnosticQuestions() competency gaps -> optional LLM gap-fill
//   getAiServiceStatus()     health probe    -> { available, llmConfigured }
//
// Everything except text extraction is optional: when the AI service is down
// or no LLM is configured the callers fall back to deterministic behaviour.

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

function toServiceError(err) {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
    return new Error('AI_SERVICE_UNAVAILABLE');
  }
  if (err.code === 'ECONNABORTED') return new Error('AI_SERVICE_TIMEOUT');
  if (err.response) {
    const detail = err.response.data?.detail;
    const e = new Error(typeof detail === 'string' ? detail : 'AI_SERVICE_ERROR');
    e.status = err.response.status;
    return e;
  }
  return err;
}

async function extractText({ filePath, fileType }) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('file_type', fileType);
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/extract-text`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data; // { extractedText, topic }
  } catch (err) {
    throw toServiceError(err);
  }
}

async function generateQuiz({ text, profile }) {
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/generate-quiz`,
      {
        text,
        profile: {
          designation: profile.designation || '',
          department: profile.department || '',
          qualification: profile.qualification || '',
          experience: profile.experience || '',
          interests: profile.interests || '',
          skill_level: profile.skill_level || 'Beginner',
        },
      },
      { timeout: 90000 }
    );
    return response.data; // { topic, questions, generationMode: 'llm' | 'extractive' }
  } catch (err) {
    throw toServiceError(err);
  }
}

/**
 * Optional LLM classification of questions into the competency framework.
 * Resolves to an array of { index, competencyCode, confidence, reason } or
 * null when no LLM is configured / the service is unreachable.
 */
async function classifyQuestionsWithAi({ questions, competencies, topic }) {
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/classify-questions`,
      {
        questions: questions.map((q) => ({ question: q.question, options: q.options })),
        competencies: competencies.map((c) => ({
          code: c.code,
          name: c.name,
          description: c.description || '',
          category: c.category || 'General',
        })),
        topic: topic || '',
      },
      { timeout: 35000 }
    );
    return response.data?.results || null;
  } catch (err) {
    return null;
  }
}

/**
 * Best-effort call asking the AI service to generate a handful of extra
 * diagnostic questions for competencies where the curated bank came up short.
 * NEVER required: any failure resolves to an empty result set.
 */
async function generateDiagnosticQuestions(gaps, skillLevel) {
  if (!gaps || gaps.length === 0) {
    return { llmConfigured: false, results: [] };
  }
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/generate-diagnostic-questions`,
      { gaps, skillLevel: skillLevel || 'Beginner' },
      { timeout: 20000 }
    );
    return response.data;
  } catch (err) {
    console.log('[AI SERVICE] Diagnostic question gap-fill unavailable — continuing with the question bank only:', err.message);
    return { llmConfigured: false, results: [] };
  }
}

/** Cheap health probe used to describe the assessment mode honestly. */
async function getAiServiceStatus() {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 2500 });
    return { available: true, llmConfigured: !!response.data?.llm_configured };
  } catch (err) {
    return { available: false, llmConfigured: false };
  }
}

module.exports = {
  extractText,
  generateQuiz,
  classifyQuestionsWithAi,
  generateDiagnosticQuestions,
  getAiServiceStatus,
};
