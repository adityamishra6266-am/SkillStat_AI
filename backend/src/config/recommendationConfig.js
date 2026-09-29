// backend/src/config/recommendationConfig.js
//
// Configurable rules for the recommendation engine. Nothing in the
// recommendation service should hard-code a difficulty band or a
// "top N resources" limit — everything reads from here so the
// behavior can be tuned in one place.

// Used to compare how close a resource's difficulty is to the
// difficulty band recommended for the user's current competency
// level (see CURRENT_LEVEL_DIFFICULTY_BANDS below).
const DIFFICULTY_RANK = { Easy: 1, Medium: 2, Hard: 3 };

// Which resource difficulty best suits a learner at a given current
// competency level. Ordered ascending by maxLevel; the first band
// whose maxLevel the learner's current_level is <= wins.
const CURRENT_LEVEL_DIFFICULTY_BANDS = [
  { maxLevel: 40, preferredDifficulty: 'Easy' },
  { maxLevel: 70, preferredDifficulty: 'Medium' },
  { maxLevel: Infinity, preferredDifficulty: 'Hard' },
];

function getPreferredDifficulty(currentLevel) {
  for (const band of CURRENT_LEVEL_DIFFICULTY_BANDS) {
    if (currentLevel <= band.maxLevel) return band.preferredDifficulty;
  }
  return 'Hard';
}

// How many ranked resources to keep (and persist) per open skill gap.
const MAX_RESOURCES_PER_COMPETENCY = 3;

module.exports = {
  DIFFICULTY_RANK,
  CURRENT_LEVEL_DIFFICULTY_BANDS,
  MAX_RESOURCES_PER_COMPETENCY,
  getPreferredDifficulty,
};
