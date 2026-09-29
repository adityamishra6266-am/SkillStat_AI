// backend/src/config/skillGapConfig.js
//
// Configurable priority thresholds for skill gap classification.
// Nothing in the rest of the application should hard-code the
// numbers "30", "20", "10" or the labels 'Critical'/'High'/'Medium'/
// 'Low' for gap classification — everything reads from this array,
// so an admin/developer can change the cutoffs in exactly one place.
//
// Ordered from most severe to least severe. `rank` is used purely
// for sorting results (highest priority first); it is not shown to
// the user.

const PRIORITY_THRESHOLDS = [
  { priority: 'Critical', minGap: 30, rank: 4 },
  { priority: 'High', minGap: 20, rank: 3 },
  { priority: 'Medium', minGap: 10, rank: 2 },
  { priority: 'Low', minGap: 0, rank: 1 },
];

/**
 * Classifies a gap (Required - Current, already floored at 0) into a
 * priority tier by finding the first (most severe) threshold whose
 * minGap the value meets or exceeds. Since the last tier has
 * minGap: 0, every non-negative gap always matches something.
 */
function classifyPriority(gap) {
  for (const tier of PRIORITY_THRESHOLDS) {
    if (gap >= tier.minGap) return tier;
  }
  return PRIORITY_THRESHOLDS[PRIORITY_THRESHOLDS.length - 1];
}

const RANK_BY_PRIORITY = Object.fromEntries(PRIORITY_THRESHOLDS.map((t) => [t.priority, t.rank]));

module.exports = { PRIORITY_THRESHOLDS, RANK_BY_PRIORITY, classifyPriority };
