// backend/src/providers/learningProvider.js
// the Learning Provider contract.
//
// Every provider adapter (mock iGOT, mock NSSTA, and — later — real
// live adapters) implements this same shape, so the recommendation
// engine never needs to know which provider it's talking to. Swap
// mockIgotProvider.js for a real igotLiveProvider.js later and
// nothing in recommendationService.js, learningPathService.js, the
// controllers, or the frontend has to change.
//
// A provider module exports:
//
//   key            'IGOT' | 'NSSTA' | 'LOCAL'
//   mode           'mock' (this project ships no 'live' adapters)
//   getResourcesForCompetency(competencyCode, context) -> Promise<ProviderResource[]>
//
// `context` carries only what a resource-matching decision actually
// needs — never the user's identity:
//   { currentLevel, requiredLevel, gap, priority, difficulty }
//
// A ProviderResource (the raw shape a provider hands back, BEFORE it
// is normalized/upserted into `learning_resources`) looks like:
//
//   {
//     externalId       string   e.g. 'IGOT-DEMO-001'
//     title            string
//     description      string
//     competencyCode   string   matches `competencies.code`
//     difficulty       'Easy' | 'Medium' | 'Hard'   (project's own scale)
//     durationHours    number
//     resourceType     string   e.g. 'COURSE' | 'TRAINING'
//   }
//
// normalizeToResourceRow() below converts that into the columns
// `learning_resources` already has (see database/schema.sql +
// migrations 002/004/007) — no new concept is introduced at the DB
// layer beyond the `external_id` column added in migration 007.

/**
 * Converts a provider's raw resource shape into the row shape
 * `learning_resources` expects, tagging it with the provider's own
 * `source` value and current mode. Shared by every provider adapter
 * so the mapping only needs to be right in one place.
 */
function normalizeToResourceRow(providerResource, { source, isMock }) {
  return {
    title: providerResource.title,
    competencyCode: providerResource.competencyCode,
    topic: providerResource.resourceType || null,
    difficulty: providerResource.difficulty,
    learning_type: providerResource.resourceType === 'TRAINING' ? 'Practice' : 'Course',
    source,
    external_id: providerResource.externalId,
    description: providerResource.description,
    estimated_duration: providerResource.durationHours ? `${providerResource.durationHours} hours` : null,
    url: null, // prototype providers never fabricate a real external URL — see rule 12/13 of the existing design
    is_mock: isMock ? 1 : 0,
  };
}

module.exports = { normalizeToResourceRow };
