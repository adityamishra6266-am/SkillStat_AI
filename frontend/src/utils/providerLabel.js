// frontend/src/utils/providerLabel.js
// Shared provider display logic for Recommendations,
// Learning Path, and Dashboard. Every page shows a resource's
// provider and integration status the SAME way, so this is the one
// place that maps a resource to a badge label/class — no page
// hard-codes 'IGOT' / 'NSSTA' / 'MOCK_INTEGRATION' comparisons of its
// own.
//
// The backend already normalizes `provider` (human name) and
// `integrationMode` ('Prototype / Mock' | 'Live') onto every resource
// (see backend/src/utils/providerResourceView.js) — this just adds a
// consistent badge CSS class per provider for the UI.

export function providerBadgeClass(source) {
  if (source === 'IGOT') return 'badge-violet';
  if (source === 'NSSTA') return 'badge-cyan';
  return 'badge-slate'; // local prototype catalog / unknown
}

// Falls back gracefully if a resource somehow lacks the backend's
// normalized `provider` field (e.g. older cached data).
export function providerName(resource) {
  if (resource.provider) return resource.provider;
  if (resource.source === 'IGOT') return 'iGOT Karmayogi';
  if (resource.source === 'NSSTA') return 'NSSTA / TPAC';
  return 'Prototype Catalog';
}

export function integrationModeLabel(resource) {
  return resource.integrationMode || (resource.isMock ? 'Prototype / Mock' : 'Live');
}
