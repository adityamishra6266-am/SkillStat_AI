// frontend/src/components/ProviderInfo.jsx
// One consistent way to show where a learning resource comes from and
// whether that integration is live or a prototype.
import React from 'react';
import { providerBadgeClass, providerName, integrationModeLabel } from '../utils/providerLabel';

export function ProviderBadges({ resource }) {
  const mode = integrationModeLabel(resource);
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className={`badge ${providerBadgeClass(resource.source)}`}>{providerName(resource)}</span>
      {mode !== 'Live' && <span className="badge badge-proto" title="Prototype catalogue data - not a live enrolment">Prototype / Mock</span>}
    </span>
  );
}

/** "Open Resource" is shown ONLY when a genuine URL exists - never invented. */
export function OpenResourceLink({ resource, className = 'btn btn-secondary btn-sm' }) {
  if (!resource || !resource.url) return null;
  return (
    <a href={resource.url} target="_blank" rel="noreferrer noopener" className={className}>
      Open Resource
    </a>
  );
}
