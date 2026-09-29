// backend/src/services/adminAnalyticsService.js
// Administrator Dashboard & Workforce Competency Analytics.
//
// This module ONLY aggregates. It does not compute a single
// competency score, skill gap, priority, or recommendation itself —
// every number here is read straight out of tables the learner-side
// engines already populate (competencies, user_competencies, skill_gaps,
// quiz_attempts, learning_path_items, recommendations,
// learning_resources). The one piece of shared logic it does reuse
// directly is `RANK_BY_PRIORITY` / the priority labels from
// skillGapConfig.js, so "Critical" here means exactly what it means
// on the learner's own Skill Gaps page — no second definition.
//
// Every query below is a GROUP BY / aggregate query, not a per-user
// loop, to avoid the N+1 pattern the existing design explicitly warns
// against. The one exception (`getOfficialsTable`) still uses a
// small, fixed number of queries (not one per official) and merges
// the results in JS.

const { pool } = require('../config/db');
const { getProviderMetaBySource } = require('../config/providerConfig');

function round2(n) {
  if (n === null || n === undefined) return null;
  return Math.round(Number(n) * 100) / 100;
}

// ------------------------------------------------------------------
// 1. Overview KPIs
// ------------------------------------------------------------------
//
// Total Officials      = COUNT(users) with role = 'user' (learner
//                         accounts only — an admin account is not an
//                         "official" being tracked by the dashboard).
// Assessments Completed = COUNT(quiz_attempts) across all officials.
//                         Each attempt is one completed assessment;
//                         an official who has taken 3 quizzes has
//                         completed 3 assessments. (Officials Assessed,
//                         a distinct-user count, is reported
//                         separately under Assessment Analytics so the
//                         two are never conflated.)
// Average Competency    = AVG(current_level) across every row in
//                         user_competencies for officials — the same
//                         0-100 scale already shown on each learner's
//                         own Competencies page. Null (not 0%) when no
//                         official has any competency data yet.
// Officials With Critical Skill Gaps = COUNT(DISTINCT user_id) from
//                         skill_gaps where priority = 'Critical' —
//                         a headcount, not a count of gap rows, so one
//                         official with 3 critical gaps is counted once.
async function getOverview() {
  const [[totalRow]] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'user'");
  const [[attemptsRow]] = await pool.query('SELECT COUNT(*) AS count FROM quiz_attempts');
  const [[avgRow]] = await pool.query(
    `SELECT AVG(uc.current_level) AS avg_level
     FROM user_competencies uc
     JOIN users u ON u.id = uc.user_id
     WHERE u.role = 'user'`
  );
  const [[criticalRow]] = await pool.query(
    `SELECT COUNT(DISTINCT sg.user_id) AS count
     FROM skill_gaps sg
     JOIN users u ON u.id = sg.user_id
     WHERE u.role = 'user' AND sg.priority = 'Critical'`
  );

  return {
    totalOfficials: totalRow.count,
    assessmentsCompleted: attemptsRow.count,
    averageCompetency: avgRow.avg_level !== null ? round2(avgRow.avg_level) : null,
    officialsWithCriticalGaps: criticalRow.count,
  };
}

// ------------------------------------------------------------------
// 2 & 6. Competency Overview + Gap Visualization
// ------------------------------------------------------------------
//
// Avg Level / Required / Gap per competency, averaged across every
// official who has a skill_gaps row for it. skill_gaps already stores
// each official's OWN required_level (resolved per their designation
// by the skillGapService), so averaging it here — rather than
// picking one universal requirement — is exactly rule 5's "calculate
// the requirement appropriately" for a workforce that may span
// several designations/departments.
async function getCompetencyOverview() {
  const [rows] = await pool.query(
    `SELECT c.id AS competency_id, c.name, c.category,
            AVG(sg.current_level) AS avg_current, AVG(sg.required_level) AS avg_required,
            AVG(sg.gap) AS avg_gap, COUNT(DISTINCT sg.user_id) AS officials_mapped
     FROM skill_gaps sg
     JOIN competencies c ON c.id = sg.competency_id
     JOIN users u ON u.id = sg.user_id
     WHERE u.role = 'user'
     GROUP BY c.id, c.name, c.category
     ORDER BY avg_gap DESC`
  );

  return rows.map((row) => ({
    competencyId: row.competency_id,
    name: row.name,
    category: row.category,
    avgCurrentLevel: round2(row.avg_current),
    avgRequiredLevel: round2(row.avg_required),
    avgGap: round2(row.avg_gap),
    officialsMapped: row.officials_mapped,
  }));
}

// ------------------------------------------------------------------
// 3. Department-wise Analysis
// ------------------------------------------------------------------
//
// Grouped by profiles.department (the project's only existing notion
// of "department" — there is no separate departments table). An
// official with no department set is excluded from this breakdown
// rather than being lumped into a fabricated "Unknown" bucket.
async function getDepartmentAnalysis() {
  const [deptRows] = await pool.query(
    `SELECT p.department, COUNT(DISTINCT p.user_id) AS officials, AVG(uc.current_level) AS avg_competency
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN user_competencies uc ON uc.user_id = p.user_id
     WHERE u.role = 'user' AND p.department IS NOT NULL AND p.department != ''
     GROUP BY p.department
     ORDER BY p.department ASC`
  );

  if (deptRows.length === 0) return [];

  // Major gap per department: the competency with the largest average
  // gap among officials in that department. One query, grouped by
  // (department, competency), then reduced to the top row per
  // department in JS — avoids a query-per-department loop.
  const [gapRows] = await pool.query(
    `SELECT p.department, c.name AS competency_name, AVG(sg.gap) AS avg_gap
     FROM skill_gaps sg
     JOIN profiles p ON p.user_id = sg.user_id
     JOIN users u ON u.id = sg.user_id
     JOIN competencies c ON c.id = sg.competency_id
     WHERE u.role = 'user' AND p.department IS NOT NULL AND p.department != ''
     GROUP BY p.department, c.name
     ORDER BY p.department ASC, avg_gap DESC`
  );

  const majorGapByDept = new Map();
  for (const row of gapRows) {
    if (!majorGapByDept.has(row.department)) {
      majorGapByDept.set(row.department, { name: row.competency_name, avgGap: round2(row.avg_gap) });
    }
  }

  return deptRows.map((row) => ({
    department: row.department,
    officials: row.officials,
    avgCompetency: row.avg_competency !== null ? round2(row.avg_competency) : null,
    majorGap: majorGapByDept.get(row.department) || null,
  }));
}

// ------------------------------------------------------------------
// 8. Training Priorities
// ------------------------------------------------------------------
//
// Ranked by how many officials are affected (a real, gap > 0 skill_gaps
// row), not by a new scoring formula. Ties broken by the average gap
// size. This reuses skill_gaps exactly as calculated by no
// new ranking algorithm is introduced.
async function getTrainingPriorities(limit = 5) {
  const [rows] = await pool.query(
    `SELECT c.id AS competency_id, c.name, COUNT(DISTINCT sg.user_id) AS officials_affected,
            AVG(sg.gap) AS avg_gap
     FROM skill_gaps sg
     JOIN competencies c ON c.id = sg.competency_id
     JOIN users u ON u.id = sg.user_id
     WHERE u.role = 'user' AND sg.gap > 0
     GROUP BY c.id, c.name
     ORDER BY officials_affected DESC, avg_gap DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    competencyId: row.competency_id,
    name: row.name,
    officialsAffected: row.officials_affected,
    avgGap: round2(row.avg_gap),
  }));
}

// ------------------------------------------------------------------
// 9. Training Source Distribution (existing provider data)
// ------------------------------------------------------------------
//
// Counts recommendations by the learning_resources.source they were
// built from, then labels each with the SAME provider display name
// defined in providerConfig.js — never a second,
// dashboard-specific name for the same provider.
async function getProviderDistribution() {
  const [rows] = await pool.query(
    `SELECT lr.source, COUNT(*) AS count
     FROM recommendations r
     JOIN learning_resources lr ON lr.id = r.learning_resource_id
     JOIN users u ON u.id = r.user_id
     WHERE u.role = 'user'
     GROUP BY lr.source
     ORDER BY count DESC`
  );

  return rows.map((row) => {
    const meta = getProviderMetaBySource(row.source);
    return {
      source: row.source,
      provider: meta.displayName,
      // Same "Prototype / Mock" wording as the learner pages — the
      // local catalog has no live/mock distinction (it IS the app's
      // own data), so it is labeled "Prototype" rather than "Mock".
      integrationMode: row.source === 'MOCK_INTEGRATION' ? 'Prototype' : 'Prototype / Mock',
      count: row.count,
    };
  });
}

// ------------------------------------------------------------------
// 10. Assessment Analytics (optionally limited to the last N days)
// ------------------------------------------------------------------
const ALLOWED_RANGES = [7, 30, 90];

/** Accepts 7 / 30 / 90 (anything else = all time). */
function normalizeRangeDays(value) {
  const n = Number(value);
  return ALLOWED_RANGES.includes(n) ? n : null;
}

async function getAssessmentAnalytics(rangeDays = null) {
  const days = normalizeRangeDays(rangeDays);
  const rangeClause = days ? 'AND qa.attempted_at >= (NOW() - INTERVAL ? DAY)' : '';
  const params = days ? [days] : [];

  const [[summaryRow]] = await pool.query(
    `SELECT COUNT(DISTINCT qa.user_id) AS users_assessed, COUNT(*) AS attempts,
            AVG(qa.percentage) AS avg_score
     FROM quiz_attempts qa
     JOIN users u ON u.id = qa.user_id
     WHERE u.role = 'user' ${rangeClause}`,
    params
  );
  const [[avgCompetencyRow]] = await pool.query(
    `SELECT AVG(uc.current_level) AS avg_level
     FROM user_competencies uc
     JOIN users u ON u.id = uc.user_id
     WHERE u.role = 'user'`
  );

  // Assessments Over Time - real attempted_at values only. Granularity follows
  // the selected range: all time = month, 7/30 days = day, 90 days = week
  // (week starting Monday). Buckets with no attempts are simply absent (no
  // fabricated zero points); an empty array renders the "no data" state.
  let bucketExpr = "DATE_FORMAT(qa.attempted_at, '%Y-%m')";
  let granularity = 'month';
  if (days && days <= 30) {
    bucketExpr = "DATE_FORMAT(qa.attempted_at, '%Y-%m-%d')";
    granularity = 'day';
  } else if (days) {
    bucketExpr = "DATE_FORMAT(DATE_SUB(DATE(qa.attempted_at), INTERVAL WEEKDAY(qa.attempted_at) DAY), '%Y-%m-%d')";
    granularity = 'week';
  }
  const [bucketRows] = await pool.query(
    `SELECT ${bucketExpr} AS bucket, COUNT(*) AS count
     FROM quiz_attempts qa
     JOIN users u ON u.id = qa.user_id
     WHERE u.role = 'user' ${rangeClause}
     GROUP BY bucket
     ORDER BY bucket ASC`,
    params
  );

  return {
    rangeDays: days,
    granularity,
    usersAssessed: summaryRow.users_assessed,
    assessmentAttempts: summaryRow.attempts,
    averageScore: summaryRow.avg_score !== null ? round2(summaryRow.avg_score) : null,
    averageCompetency: avgCompetencyRow.avg_level !== null ? round2(avgCompetencyRow.avg_level) : null,
    overTime: bucketRows.map((r) => ({ period: r.bucket, count: r.count })),
  };
}

// ------------------------------------------------------------------
// 11. Diagnostic Assessment Coverage
// ------------------------------------------------------------------
//
// "Eligible" officials, same convention the dashboard card
// already uses (see dashboardController.needsDiagnostic): an official
// with a designation set on their profile, since a designation is
// what the diagnostic assessment needs to pick applicable questions.
// "Assessed" = has at least one completed attempt on a quiz whose
// quiz_type is 'Diagnostic' (the existing quiz_type column, not a new
// classification).
async function getDiagnosticCoverage() {
  const [[eligibleRow]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM users u
     JOIN profiles p ON p.user_id = u.id
     WHERE u.role = 'user' AND p.designation IS NOT NULL AND p.designation != ''`
  );
  const [[assessedRow]] = await pool.query(
    `SELECT COUNT(DISTINCT qa.user_id) AS count
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     JOIN users u ON u.id = qa.user_id
     WHERE u.role = 'user' AND q.quiz_type = 'Diagnostic'`
  );

  const eligible = eligibleRow.count;
  const assessed = assessedRow.count;
  return {
    eligibleOfficials: eligible,
    assessedOfficials: assessed,
    notYetAssessed: Math.max(0, eligible - assessed),
    coveragePercentage: eligible > 0 ? round2((assessed / eligible) * 100) : null,
  };
}

// ------------------------------------------------------------------
// 12. Learning Progress
// ------------------------------------------------------------------
//
// Uses the ACTUAL learning_path_items.status values (Locked,
// Available, In Progress, Completed) — no invented "Started" bucket
// that doesn't exist in the schema.
async function getLearningProgress() {
  const [rows] = await pool.query(
    `SELECT lpi.status, COUNT(*) AS count
     FROM learning_path_items lpi
     JOIN learning_paths lp ON lp.id = lpi.learning_path_id
     JOIN users u ON u.id = lp.user_id
     WHERE u.role = 'user'
     GROUP BY lpi.status`
  );

  const counts = { Locked: 0, Available: 0, 'In Progress': 0, Completed: 0 };
  for (const row of rows) counts[row.status] = row.count;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return { counts, total };
}

// ------------------------------------------------------------------
// 14. Individual Officials Table (privacy-conscious)
// ------------------------------------------------------------------
//
// A handful of fixed aggregate queries (never one query per official)
// merged in JS by user_id. Deliberately selects only the fields the
// the existing design allows — no password, token, or extra profile detail.
async function getOfficialsTable(rangeDays = null) {
  const days = normalizeRangeDays(rangeDays);
  const [users] = await pool.query(
    `SELECT u.id, u.name, p.designation, p.department
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.role = 'user'
     ORDER BY u.name ASC`
  );
  if (users.length === 0) return [];

  const [avgRows] = await pool.query(
    `SELECT user_id, AVG(current_level) AS avg_level
     FROM user_competencies GROUP BY user_id`
  );
  const avgByUser = new Map(avgRows.map((r) => [r.user_id, round2(r.avg_level)]));

  const [attemptRows] = await pool.query(
    `SELECT user_id, COUNT(*) AS attempts, MAX(attempted_at) AS last_at,
            SUM(CASE WHEN ? IS NOT NULL AND attempted_at >= (NOW() - INTERVAL ? DAY) THEN 1 ELSE 0 END) AS in_range
     FROM quiz_attempts GROUP BY user_id`,
    [days, days || 0]
  );
  const attemptsByUser = new Map(attemptRows.map((r) => [r.user_id, r]));

  // All open gaps per user (already sorted largest first); the top one is the
  // "Top Skill Gap" column and the full list powers the competency filter.
  const [gapRows] = await pool.query(
    `SELECT sg.user_id, sg.competency_id, c.name AS competency_name, sg.gap, sg.priority
     FROM skill_gaps sg
     JOIN competencies c ON c.id = sg.competency_id
     WHERE sg.gap > 0
     ORDER BY sg.user_id ASC, sg.gap DESC`
  );
  const gapsByUser = new Map();
  for (const row of gapRows) {
    if (!gapsByUser.has(row.user_id)) gapsByUser.set(row.user_id, []);
    gapsByUser.get(row.user_id).push({ competencyId: row.competency_id, name: row.competency_name, gap: round2(row.gap), priority: row.priority });
  }

  const [progressRows] = await pool.query(
    `SELECT lp.user_id, lpi.status, COUNT(*) AS count
     FROM learning_path_items lpi
     JOIN learning_paths lp ON lp.id = lpi.learning_path_id
     GROUP BY lp.user_id, lpi.status`
  );
  const progressByUser = new Map();
  for (const row of progressRows) {
    if (!progressByUser.has(row.user_id)) progressByUser.set(row.user_id, { total: 0, completed: 0 });
    const entry = progressByUser.get(row.user_id);
    entry.total += row.count;
    if (row.status === 'Completed') entry.completed += row.count;
  }

  return users.map((u) => {
    const progress = progressByUser.get(u.id);
    const attempts = attemptsByUser.get(u.id);
    const gaps = gapsByUser.get(u.id) || [];
    return {
      id: u.id,
      name: u.name,
      designation: u.designation || null,
      department: u.department || null,
      assessmentStatus: attempts ? 'Assessed' : 'Not Yet Assessed',
      assessmentCount: attempts ? Number(attempts.attempts) : 0,
      assessmentsInRange: days && attempts ? Number(attempts.in_range) : null,
      lastAssessmentAt: attempts ? attempts.last_at : null,
      overallCompetency: avgByUser.get(u.id) ?? null,
      topSkillGap: gaps[0] || null,
      gapCompetencyIds: gaps.map((g) => g.competencyId),
      learningProgressPercentage:
        progress && progress.total > 0 ? round2((progress.completed / progress.total) * 100) : null,
    };
  });
}

// ------------------------------------------------------------------
// 15. Single official detail (drawer)
// ------------------------------------------------------------------
//
// Same privacy rule as the table: name, designation, department and
// competency/learning data only. No email, password hash, token or any other
// authentication data is selected. Only learner accounts (role = 'user') can
// be viewed here.
async function getOfficialDetail(userId) {
  const [[user]] = await pool.query(
    `SELECT u.id, u.name, p.designation, p.department, p.skill_level
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = ? AND u.role = 'user'`,
    [userId]
  );
  if (!user) return null;

  const [competencyRows] = await pool.query(
    `SELECT uc.competency_id, c.name, c.category, uc.current_level, uc.confidence, uc.source,
            sg.required_level, sg.gap, sg.priority
     FROM user_competencies uc
     JOIN competencies c ON c.id = uc.competency_id
     LEFT JOIN skill_gaps sg ON sg.user_id = uc.user_id AND sg.competency_id = uc.competency_id
     WHERE uc.user_id = ?
     ORDER BY c.category, c.name`,
    [userId]
  );
  const competencies = competencyRows.map((r) => ({
    competencyId: r.competency_id,
    name: r.name,
    category: r.category,
    currentLevel: round2(r.current_level),
    requiredLevel: r.required_level !== null ? round2(r.required_level) : null,
    gap: r.gap !== null ? round2(r.gap) : null,
    priority: r.gap !== null ? r.priority : null,
    confidence: r.confidence,
    evidenceSource: r.source && r.source.includes('quiz') ? 'Assessment evidence' : 'Profile estimate',
  }));
  const overallCompetency = competencies.length
    ? round2(competencies.reduce((sum, c) => sum + c.currentLevel, 0) / competencies.length)
    : null;

  const majorGaps = competencies
    .filter((c) => c.gap !== null && c.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);

  const [progressRows] = await pool.query(
    `SELECT lpi.status, COUNT(*) AS count, AVG(lpi.progress_percentage) AS avg_progress
     FROM learning_path_items lpi
     JOIN learning_paths lp ON lp.id = lpi.learning_path_id
     WHERE lp.user_id = ? AND lp.status = 'Active'
     GROUP BY lpi.status`,
    [userId]
  );
  const counts = { Locked: 0, Available: 0, 'In Progress': 0, Completed: 0 };
  let weighted = 0;
  for (const r of progressRows) {
    counts[r.status] = r.count;
    weighted += Number(r.avg_progress) * r.count;
  }
  const totalSteps = Object.values(counts).reduce((a, b) => a + b, 0);

  const [attemptRows] = await pool.query(
    `SELECT qa.id, qa.score, qa.total_questions, qa.percentage, qa.attempted_at, q.title, q.quiz_type
     FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
     WHERE qa.user_id = ?
     ORDER BY qa.attempted_at DESC LIMIT 5`,
    [userId]
  );
  const [[attemptCount]] = await pool.query('SELECT COUNT(*) AS count FROM quiz_attempts WHERE user_id = ?', [userId]);

  return {
    id: user.id,
    name: user.name,
    designation: user.designation || null,
    department: user.department || null,
    assessmentStatus: attemptCount.count > 0 ? 'Assessed' : 'Not Yet Assessed',
    assessmentCount: attemptCount.count,
    overallCompetency,
    competencies,
    majorGaps,
    learningProgress: {
      totalSteps,
      counts,
      overallProgress: totalSteps > 0 ? round2(weighted / totalSteps) : null,
    },
    recentAssessments: attemptRows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.quiz_type === 'Diagnostic' ? 'Competency assessment' : 'Learning material quiz',
      score: r.score,
      total: r.total_questions,
      percentage: Number(r.percentage),
      attemptedAt: r.attempted_at,
    })),
  };
}

// ------------------------------------------------------------------
// Consolidated endpoint payload
// ------------------------------------------------------------------
//
// One backend call assembles everything the dashboard needs (rule
// 18's "prefer one consolidated admin dashboard endpoint"). Every
// section is queried independently above and combined here — none of
// this recomputes competencies, gaps, or recommendations; it only
// reads and aggregates what the learner-side engines already stored.
async function getAdminDashboard({ rangeDays = null } = {}) {
  const [overview, competencies, departments, trainingNeeds, providers, assessment, diagnostic, learningProgress, officials] =
    await Promise.all([
      getOverview(),
      getCompetencyOverview(),
      getDepartmentAnalysis(),
      getTrainingPriorities(),
      getProviderDistribution(),
      getAssessmentAnalytics(rangeDays),
      getDiagnosticCoverage(),
      getLearningProgress(),
      getOfficialsTable(rangeDays),
    ]);

  return {
    overview,
    competencies,
    departments,
    trainingNeeds,
    providers,
    assessment,
    diagnostic,
    learningProgress,
    officials,
  };
}

module.exports = {
  getOverview,
  getCompetencyOverview,
  getDepartmentAnalysis,
  getTrainingPriorities,
  getProviderDistribution,
  getAssessmentAnalytics,
  getDiagnosticCoverage,
  getLearningProgress,
  getOfficialsTable,
  getOfficialDetail,
  normalizeRangeDays,
  getAdminDashboard,
};
