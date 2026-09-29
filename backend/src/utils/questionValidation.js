// backend/src/utils/questionValidation.js
// Defence in depth: the AI service already validates LLM output, but the
// backend re-validates everything it is about to persist. A malformed
// question set can therefore never reach the database, whatever produced it.

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * @param {unknown} questions
 * @param {{expectedCount?: number}} [opts]
 * @returns {{ok: true, questions: Array} | {ok: false, reason: string}}
 */
function validateQuestionSet(questions, opts = {}) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, reason: 'no questions were returned' };
  }
  if (opts.expectedCount && questions.length !== opts.expectedCount) {
    return { ok: false, reason: `expected ${opts.expectedCount} questions but received ${questions.length}` };
  }

  const cleaned = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const label = `question ${i + 1}`;
    if (!q || typeof q !== 'object') return { ok: false, reason: `${label} is not an object` };
    if (!isNonEmptyString(q.question)) return { ok: false, reason: `${label} has no text` };
    if (!Array.isArray(q.options) || q.options.length !== 4) return { ok: false, reason: `${label} must have exactly four options` };
    if (!q.options.every(isNonEmptyString)) return { ok: false, reason: `${label} has an empty option` };
    const distinct = new Set(q.options.map((o) => o.trim().toLowerCase()));
    if (distinct.size !== 4) return { ok: false, reason: `${label} has duplicate options` };
    if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer > 3) {
      return { ok: false, reason: `${label} has an invalid correctAnswer` };
    }
    if (!isNonEmptyString(q.explanation)) return { ok: false, reason: `${label} has no explanation` };

    cleaned.push({
      question: q.question.trim().slice(0, 1000),
      options: q.options.map((o) => o.trim().slice(0, 500)),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation.trim().slice(0, 4000),
    });
  }
  return { ok: true, questions: cleaned };
}

module.exports = { validateQuestionSet };
