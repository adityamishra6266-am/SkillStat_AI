// backend/src/services/questionCompetencyMapper.js
// Competency-aware document quizzes.
//
// For every generated document-quiz question decide which EXISTING competency
// (row of `competencies`) it assesses - or decide that it cannot be mapped
// reliably. Nothing is ever assigned at random or "to make the loop work".
//
//   1. If the AI service has an LLM configured it may classify each question
//      into one of the supplied competency codes. Its answer is accepted only
//      if the code exists in the framework and its confidence >= LLM_MIN_CONFIDENCE.
//   2. Otherwise (or for questions the LLM left unmapped/low-confidence) a
//      deterministic keyword matcher scores each competency using
//      whole-word/phrase matches against the question, its options and its
//      explanation (plus a small nudge from the document itself). A competency
//      is assigned only when the score is high enough AND clearly ahead of the
//      runner-up.
//   3. If neither is convincing the question keeps competency_id = NULL.

const { pool } = require('../config/db');
const { classifyQuestionsWithAi } = require('./aiService');
const {
  COMPETENCY_TERMS,
  MIN_TOP_SCORE,
  MIN_CONFIDENCE,
  DOCUMENT_CONTEXT_WEIGHT,
  DOCUMENT_CONTEXT_CAP,
  LLM_MIN_CONFIDENCE,
} = require('../config/documentMappingConfig');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pre-compile one whole-word regex per term. Spaces/hyphens inside a phrase
// match either, a trailing plural "s" is tolerated.
const COMPILED_TERMS = Object.fromEntries(
  Object.entries(COMPETENCY_TERMS).map(([code, terms]) => [
    code,
    terms.map(([term, weight]) => {
      const body = escapeRegExp(term).replace(/\\-|\s+/g, '[\\s-]+');
      return { term, weight, regex: new RegExp(`(?<![a-z0-9])${body}(?:s|es)?(?![a-z0-9])`, 'gi') };
    }),
  ])
);

function scoreText(text, code) {
  const compiled = COMPILED_TERMS[code];
  if (!compiled || !text) return { score: 0, matched: [] };
  let score = 0;
  const matched = [];
  for (const { term, weight, regex } of compiled) {
    regex.lastIndex = 0;
    const hits = (text.match(regex) || []).length;
    if (hits > 0) {
      score += weight * Math.min(hits, 2); // a term repeated many times is not proportionally stronger
      matched.push(term);
    }
  }
  return { score, matched };
}

function questionText(q) {
  return [q.question, ...(q.options || []), q.explanation || ''].join(' \n ');
}

/** Deterministic mapping for ONE question. Exported for tests. */
function keywordMapQuestion(q, competencies, documentContext) {
  const qText = questionText(q);
  const contextText = (documentContext || '').slice(0, 8000);

  const scored = competencies.map((c) => {
    const own = scoreText(qText, c.code);
    const ctx = scoreText(contextText, c.code);
    const contextBoost = Math.min(DOCUMENT_CONTEXT_CAP, ctx.score * DOCUMENT_CONTEXT_WEIGHT);
    // The question itself must carry signal; the document only nudges it.
    const total = own.score > 0 ? own.score + contextBoost : 0;
    return { competency: c, score: total, ownScore: own.score, matched: own.matched };
  });
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1] || { score: 0 };
  if (!top || top.ownScore < MIN_TOP_SCORE) {
    return { competency: null, confidence: 0, method: null, reason: 'No competency-specific terms were found in this question.' };
  }
  const confidence = Math.round((top.score / (top.score + second.score + 3)) * 100) / 100;
  if (confidence < MIN_CONFIDENCE) {
    return {
      competency: null,
      confidence,
      method: null,
      reason: `Ambiguous between competencies (best: ${top.competency.name}); not mapped rather than guessing.`,
    };
  }
  return {
    competency: top.competency,
    confidence,
    method: 'keyword',
    reason: `Matched terms: ${top.matched.slice(0, 5).join(', ')}.`,
  };
}

async function getActiveCompetencies() {
  const [rows] = await pool.query(
    'SELECT id, code, name, description, category FROM competencies WHERE is_active = 1 ORDER BY id'
  );
  return rows;
}

/**
 * Maps every question of a document quiz.
 * @returns {Promise<{mappings: Array, llmUsed: boolean}>} one mapping per input question, in order:
 *   { competencyId|null, competencyName|null, confidence, method: 'llm'|'keyword'|null, reason }
 */
async function mapQuestionsToCompetencies({ questions, topic, documentText }) {
  const competencies = await getActiveCompetencies();
  const byCode = new Map(competencies.map((c) => [c.code, c]));

  // 1) optional LLM classification (never required)
  let llmResults = null;
  try {
    llmResults = await classifyQuestionsWithAi({ questions, competencies, topic });
  } catch (err) {
    console.log('[MAPPING] LLM classification unavailable, using keyword matcher:', err.message);
  }

  let llmUsed = false;
  const mappings = questions.map((q, idx) => {
    const llm = Array.isArray(llmResults) ? llmResults.find((r) => r.index === idx) : null;
    if (llm && llm.competencyCode && byCode.has(llm.competencyCode) && llm.confidence >= LLM_MIN_CONFIDENCE) {
      const c = byCode.get(llm.competencyCode);
      llmUsed = true;
      return {
        competencyId: c.id,
        competencyName: c.name,
        confidence: llm.confidence,
        method: 'llm',
        reason: llm.reason || `Classified by the configured LLM as ${c.name}.`,
      };
    }
    // 2) deterministic fallback
    const kw = keywordMapQuestion(q, competencies, `${topic || ''}\n${documentText || ''}`);
    return {
      competencyId: kw.competency ? kw.competency.id : null,
      competencyName: kw.competency ? kw.competency.name : null,
      confidence: kw.confidence,
      method: kw.method,
      reason: kw.reason,
    };
  });

  return { mappings, llmUsed };
}

module.exports = { mapQuestionsToCompetencies, keywordMapQuestion };
