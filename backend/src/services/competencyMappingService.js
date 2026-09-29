// backend/src/services/competencyMappingService.js
// AI Competency Mapping.
//
// Turns a user's profile (designation, department, qualification,
// experience, interests, skill level) plus the existing competency
// framework (competencies + competency_requirements) into an initial,
// explainable competency profile stored in `user_competencies`.
//
// The profile estimate is a deterministic, rule-based baseline (no LLM).
// Assessment evidence - answers to competency-tagged questions from the
// diagnostic assessment and from competency-mapped document quizzes - is
// then blended in (see `getQuizEvidence` / `applyQuizEvidence`). The
// blending is kept separate from the profile estimate so either can be
// replaced without touching callers (competencyMappingController, routes).
//
// Nothing here hard-codes competency names: everything is looked up
// from the `competencies` / `competency_requirements` tables. Only
// the *heuristics* (which keywords lend affinity to which competency
// codes) live in one config file, competencyMappingConfig.js.

const { pool } = require('../config/db');
const {
  WEIGHTS,
  EVIDENCE_WEIGHT_PER_QUESTION,
  DOCUMENT_EVIDENCE_WEIGHT_PER_QUESTION,
  EVIDENCE_WEIGHT_CAP,
  HIGH_CONFIDENCE_EVIDENCE_WEIGHT,
  QUALIFICATION_AFFINITY,
  INTEREST_KEYWORDS,
} = require('../config/competencyMappingConfig');
const { EVIDENCE_MIN_CONFIDENCE } = require('../config/documentMappingConfig');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Parses free-text experience strings like "1 year", "5 years",
 * "10+ years", "6 months" into a rough number of years. Returns 0 if
 * nothing usable is found — this is a best-effort heuristic on
 * free-text input, not a guarantee.
 */
function parseExperienceYears(experience) {
  if (!experience) return 0;
  const text = String(experience).toLowerCase();

  const yearsMatch = text.match(/(\d+(\.\d+)?)\s*\+?\s*(year|yr)/);
  if (yearsMatch) return parseFloat(yearsMatch[1]);

  const monthsMatch = text.match(/(\d+(\.\d+)?)\s*\+?\s*(month|mo)/);
  if (monthsMatch) return parseFloat(monthsMatch[1]) / 12;

  const bareNumber = text.match(/(\d+(\.\d+)?)/);
  if (bareNumber) return parseFloat(bareNumber[1]);

  return 0;
}

/**
 * Returns true if any qualification-affinity keyword found in the
 * profile's free-text `qualification` maps to this competency code.
 */
function qualificationMatches(qualification, competencyCode) {
  if (!qualification) return false;
  const text = String(qualification).toLowerCase();
  return Object.entries(QUALIFICATION_AFFINITY).some(
    ([keyword, codes]) => text.includes(keyword) && codes.includes(competencyCode)
  );
}

/**
 * Returns true if the profile's free-text `interests` mentions this
 * competency by name or one of its configured keyword synonyms.
 */
function interestMatches(interests, competency) {
  if (!interests) return false;
  const text = String(interests).toLowerCase();
  // Whole-word matching: a short keyword such as "ai" or "ml" must not match
  // inside unrelated words ("maintain", "html").
  const containsWord = (kw) =>
    new RegExp(`(?<![a-z0-9])${String(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(text);
  if (containsWord(competency.name.toLowerCase())) return true;
  const keywords = INTEREST_KEYWORDS[competency.code] || [];
  return keywords.some(containsWord);
}

/**
 * Builds the rule-based profile estimate (0-100) for one competency,
 * plus a breakdown of which factors contributed, so the result stays
 * explainable rather than being a single opaque number.
 */
function buildProfileEstimate(profile, competency) {
  const factors = [];

  const experienceYears = parseExperienceYears(profile.experience);
  const experiencePoints = clamp(
    Math.round(experienceYears * WEIGHTS.POINTS_PER_YEAR),
    0,
    WEIGHTS.MAX_EXPERIENCE_POINTS
  );
  if (experiencePoints > 0) {
    factors.push({
      label: `${experienceYears} year(s) of stated experience`,
      points: experiencePoints,
    });
  }

  const skillLevel = profile.skill_level || 'Beginner';
  const skillPoints = WEIGHTS.SKILL_LEVEL_POINTS[skillLevel] ?? WEIGHTS.SKILL_LEVEL_POINTS.Beginner;
  factors.push({ label: `self-reported skill level '${skillLevel}'`, points: skillPoints });

  let qualificationPoints = 0;
  if (qualificationMatches(profile.qualification, competency.code)) {
    qualificationPoints = WEIGHTS.QUALIFICATION_MATCH_POINTS;
    factors.push({
      label: `qualification '${profile.qualification}' is relevant to this competency`,
      points: qualificationPoints,
    });
  }

  let interestPoints = 0;
  if (interestMatches(profile.interests, competency)) {
    interestPoints = WEIGHTS.INTEREST_MATCH_POINTS;
    factors.push({
      label: `stated interest in '${profile.interests}' overlaps with this competency`,
      points: interestPoints,
    });
  }

  const rawTotal = experiencePoints + skillPoints + qualificationPoints + interestPoints;
  const estimate = clamp(rawTotal, 0, 100);

  return { estimate, factors };
}

/**
 * Pulls the assessment evidence a user has for one competency: every
 * competency-tagged quiz question they answered, taken from their LATEST
 * attempt of each quiz (retaking a quiz replaces its earlier evidence
 * instead of stacking it, so repeated attempts cannot inflate a score).
 *
 * Two kinds of evidence exist and they are NOT weighted equally:
 *   - Diagnostic assessment questions (curated competency bank, mapping is
 *     exact): full weight per question (EVIDENCE_WEIGHT_PER_QUESTION).
 *   - Document-quiz questions: they test comprehension of one uploaded
 *     document, so each counts for less (DOCUMENT_EVIDENCE_WEIGHT_PER_QUESTION)
 *     scaled by how confident the competency mapping was, and only questions
 *     mapped with confidence >= EVIDENCE_MIN_CONFIDENCE count at all.
 *     Legacy document questions without a recorded mapping confidence are
 *     ignored because their mapping cannot be verified.
 */
async function getQuizEvidence(userId, competencyId) {
  const [rows] = await pool.query(
    `SELECT qq.id AS question_id, qq.correct_answer, qq.mapping_confidence, qz.quiz_type, qa.answers_json
     FROM quiz_questions qq
     JOIN quizzes qz ON qz.id = qq.quiz_id
     JOIN quiz_attempts qa ON qa.quiz_id = qz.id AND qa.user_id = ?
     WHERE qq.competency_id = ? AND qz.user_id = ?
       AND qa.id = (SELECT MAX(qa2.id) FROM quiz_attempts qa2 WHERE qa2.quiz_id = qz.id AND qa2.user_id = qa.user_id)
       AND (qz.quiz_type = 'Diagnostic' OR qq.mapping_confidence >= ?)`,
    [userId, competencyId, userId, EVIDENCE_MIN_CONFIDENCE]
  );

  const empty = { attemptedCount: 0, correctCount: 0, avgPercentage: null, weightSum: 0, diagnosticCount: 0, documentCount: 0 };
  if (rows.length === 0) return empty;

  let attemptedCount = 0;
  let correctCount = 0;
  let weightSum = 0;
  let weightedCorrect = 0;
  let diagnosticCount = 0;
  let documentCount = 0;

  for (const row of rows) {
    let answers = row.answers_json;
    if (typeof answers === 'string') {
      try {
        answers = JSON.parse(answers);
      } catch {
        answers = null;
      }
    }
    if (!answers || answers[row.question_id] === undefined || answers[row.question_id] === null) continue;

    const isDiagnostic = row.quiz_type === 'Diagnostic';
    const weight = isDiagnostic
      ? EVIDENCE_WEIGHT_PER_QUESTION
      : DOCUMENT_EVIDENCE_WEIGHT_PER_QUESTION * Number(row.mapping_confidence);
    const correct = Number(answers[row.question_id]) === row.correct_answer;

    attemptedCount += 1;
    if (correct) correctCount += 1;
    weightSum += weight;
    if (correct) weightedCorrect += weight;
    if (isDiagnostic) diagnosticCount += 1;
    else documentCount += 1;
  }

  if (attemptedCount === 0) return empty;

  return {
    attemptedCount,
    correctCount,
    avgPercentage: (weightedCorrect / weightSum) * 100,
    weightSum,
    diagnosticCount,
    documentCount,
  };
}

/**
 * Blends a profile-based estimate with quiz evidence (if any). More
 * answered questions shift more weight onto the real evidence.
 */
function applyQuizEvidence(profileEstimate, evidence) {
  if (!evidence || evidence.attemptedCount === 0) {
    return { finalLevel: profileEstimate, evidenceWeight: 0 };
  }
  const evidenceWeight = clamp(evidence.weightSum, 0, EVIDENCE_WEIGHT_CAP);
  const finalLevel = profileEstimate * (1 - evidenceWeight) + evidence.avgPercentage * evidenceWeight;
  return { finalLevel, evidenceWeight };
}

function buildReason({ competency, factors, evidence, evidenceWeight }) {
  const parts = [];

  if (factors.length > 0) {
    const factorText = factors.map((f) => `${f.label} (+${f.points})`).join('; ');
    parts.push(`Profile-based estimate from: ${factorText}.`);
  } else {
    parts.push('No profile signals (experience, qualification, or interests) matched this competency, so a low baseline was used.');
  }

  if (evidence && evidence.attemptedCount > 0) {
    const kinds = [];
    if (evidence.diagnosticCount > 0) kinds.push(`${evidence.diagnosticCount} from the competency assessment`);
    if (evidence.documentCount > 0) kinds.push(`${evidence.documentCount} from competency-mapped learning material quizzes`);
    parts.push(
      `Blended with assessment evidence: ${evidence.correctCount}/${evidence.attemptedCount} correct on questions mapped to '${competency.name}' ` +
        `(${kinds.join(', ')}; weighted ${Math.round(evidenceWeight * 100)}% toward actual performance).`
    );
  } else {
    parts.push('No assessment questions mapped to this competency have been answered yet — this is a profile-based estimate only.');
  }

  return parts.join(' ');
}

function computeConfidence({ factors, evidenceWeight }) {
  if (evidenceWeight >= HIGH_CONFIDENCE_EVIDENCE_WEIGHT) return 'High';
  if (evidenceWeight > 0 || factors.length > 0) return 'Medium';
  return 'Low';
}

/**
 * Finds the competency requirements that apply to this user's
 * designation. Designation is free text on the profile (not a fixed
 * enum), so matching is done case-insensitively, first exact, then
 * falling back to a "contains" match against the seeded designations
 * (e.g. a profile designation of "Statistical Officer, Delhi Zone"
 * still matches the seeded "Statistical Officer" requirements).
 * department is matched the same way; requirements seeded with an
 * empty department apply regardless of the user's department.
 */
async function findApplicableRequirements(profile) {
  const designation = (profile.designation || '').trim();
  if (!designation) return [];

  const [exact] = await pool.query(
    `SELECT cr.*, c.code, c.name, c.description, c.category
     FROM competency_requirements cr
     JOIN competencies c ON c.id = cr.competency_id
     WHERE LOWER(cr.designation) = LOWER(?)
       AND (cr.department = '' OR LOWER(cr.department) = LOWER(?))`,
    [designation, (profile.department || '').trim()]
  );
  if (exact.length > 0) return exact;

  // Fallback: contains-match, for free-text designations that don't
  // exactly equal one of the seeded role names.
  const [fuzzy] = await pool.query(
    `SELECT cr.*, c.code, c.name, c.description, c.category
     FROM competency_requirements cr
     JOIN competencies c ON c.id = cr.competency_id
     WHERE LOWER(?) LIKE CONCAT('%', LOWER(cr.designation), '%')
       AND (cr.department = '' OR LOWER(?) LIKE CONCAT('%', LOWER(cr.department), '%'))`,
    [designation, (profile.department || '').trim()]
  );
  return fuzzy;
}

/**
 * Main entry point: (re)computes and stores the competency mapping
 * for one user. Returns the mapped rows (with requirement + reason)
 * so the caller can respond immediately without a second read.
 */
async function mapUserCompetencies(userId) {
  const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [userId]);
  const profile = profileRows[0];

  if (!profile || !profile.designation || !profile.designation.trim()) {
    return { mapped: [], message: 'Add a designation to your profile to generate a competency mapping.' };
  }

  const requirements = await findApplicableRequirements(profile);
  if (requirements.length === 0) {
    return {
      mapped: [],
      message: `No competency requirements are configured yet for designation '${profile.designation}'. An admin can add them to the competency framework.`,
    };
  }

  const results = [];

  for (const req of requirements) {
    const competency = { id: req.competency_id, code: req.code, name: req.name, category: req.category };

    const { estimate, factors } = buildProfileEstimate(profile, competency);
    const evidence = await getQuizEvidence(userId, competency.id);
    const { finalLevel, evidenceWeight } = applyQuizEvidence(estimate, evidence);
    const currentLevel = Math.round(clamp(finalLevel, 0, 100) * 100) / 100;

    const confidence = computeConfidence({ factors, evidenceWeight });
    const reason = buildReason({ competency, factors, evidence, evidenceWeight });
    const source = evidence.attemptedCount > 0 ? 'mapping+quiz' : 'mapping';
    const hasEvidence = evidence.attemptedCount > 0;

    await pool.query(
      `INSERT INTO user_competencies (user_id, competency_id, current_level, source, reason, confidence, last_evidence_at)
       VALUES (?, ?, ?, ?, ?, ?, ${hasEvidence ? 'NOW()' : 'NULL'})
       ON DUPLICATE KEY UPDATE
         current_level = VALUES(current_level),
         source = VALUES(source),
         reason = VALUES(reason),
         confidence = VALUES(confidence)
         ${hasEvidence ? ', last_evidence_at = NOW()' : ''}`,
      [userId, competency.id, currentLevel, source, reason, confidence]
    );

    results.push({
      competencyId: competency.id,
      code: competency.code,
      name: competency.name,
      category: competency.category,
      currentLevel,
      requiredLevel: Number(req.required_level),
      weight: Number(req.weight),
      source,
      confidence,
      reason,
    });
  }

  return { mapped: results, message: null };
}

/**
 * Reads the user's already-stored mapping (no recomputation), joined
 * with the requirement that applies to their current designation so
 * the frontend can show current vs required side by side.
 */
async function getStoredMapping(userId) {
  const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [userId]);
  const profile = profileRows[0];

  const [rows] = await pool.query(
    `SELECT uc.competency_id, uc.current_level, uc.source, uc.reason, uc.confidence, uc.last_evidence_at, uc.updated_at,
            c.code, c.name, c.category
     FROM user_competencies uc
     JOIN competencies c ON c.id = uc.competency_id
     WHERE uc.user_id = ?
     ORDER BY c.category, c.name`,
    [userId]
  );

  if (rows.length === 0) {
    return { mapped: [], profile };
  }

  const requirements = await findApplicableRequirements(profile || {});
  const requirementByCompetency = new Map(requirements.map((r) => [r.competency_id, r]));

  const mapped = rows.map((row) => {
    const req = requirementByCompetency.get(row.competency_id);
    return {
      competencyId: row.competency_id,
      code: row.code,
      name: row.name,
      category: row.category,
      currentLevel: Number(row.current_level),
      requiredLevel: req ? Number(req.required_level) : null,
      weight: req ? Number(req.weight) : null,
      source: row.source,
      confidence: row.confidence,
      reason: row.reason,
      lastEvidenceAt: row.last_evidence_at,
      updatedAt: row.updated_at,
    };
  });

  return { mapped, profile };
}

module.exports = {
  mapUserCompetencies,
  getStoredMapping,
  // The diagnostic assessment needs the exact same
  // "which competencies apply to this profile's designation" lookup
  // used to build the mapping, so it can select relevant questions
  // rather than a hard-coded/duplicated list.
  findApplicableRequirements,
  // exported for targeted unit testing
  parseExperienceYears,
  buildProfileEstimate,
  applyQuizEvidence,
};
