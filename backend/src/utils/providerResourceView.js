// backend/src/utils/providerResourceView.js
// attaches provider display metadata (human-readable
// provider name + integration status) to an already-serialized
// resource object. Shared by recommendationService.js and
// learningPathService.js so a resource's provider labeling is
// computed in exactly one place, no matter which page it's read from
// (Recommendations, Learning Path, or the Dashboard's topRecommendation,
// which is just the first stored recommendation).
//
// The frontend never sees `source` alone — it gets normalized fields
// (`provider`, `integrationMode`, `externalId`) per rule 27 of the
// the existing design ("frontend must not know API details"), so a future
// live adapter changing `source`'s underlying values would not
// require a single frontend change.

const { getProviderMetaBySource } = require('../config/providerConfig');

/**
 * Adds `provider`, `integrationMode`, and `externalId` to a resource
 * object that already has `source` and `isMock` (as produced by
 * recommendationService.serializeResource / learningPathService's
 * resource mapping). Does not mutate the input.
 */
function withProviderView(resource) {
  const meta = getProviderMetaBySource(resource.source);
  return {
    ...resource,
    provider: meta.displayName,
    integrationMode: resource.isMock ? 'Prototype / Mock' : 'Live',
    externalId: resource.externalId ?? null,
  };
}

module.exports = { withProviderView };
