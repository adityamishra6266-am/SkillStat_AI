// backend/src/config/diagnosticAssessmentConfig.js
// tunable rules for how the diagnostic assessment is built.
// Nothing in diagnosticAssessmentService should hard-code these
// numbers, so they can be tuned in one place without touching logic.

module.exports = {
  // A diagnostic assessment stays "short" (per the phase brief:
  // 5-10 questions, never a 50-question exam).
  MIN_QUESTIONS: 5,
  MAX_QUESTIONS: 10,

  // At most this many questions are drawn per competency on the
  // first pass, so a single competency with a large bank doesn't
  // crowd out the others. A user whose role has very few applicable
  // competencies can still reach MIN_QUESTIONS via the top-up pass
  // (see diagnosticAssessmentService.buildQuestionSet).
  MAX_QUESTIONS_PER_COMPETENCY: 2,

  // How many of a role's applicable competencies to draw from at
  // most — keeps the assessment "manageable" even for a designation
  // mapped to many competencies (e.g. Statistical Officer -> 12).
  // Competencies are prioritized by requirement weight (already used
  // elsewhere in the app to mean "relative importance for this
  // role"), so the most important ones are covered first.
  MAX_COMPETENCIES_COVERED: 6,
};
