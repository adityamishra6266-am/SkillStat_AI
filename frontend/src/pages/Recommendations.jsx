// frontend/src/pages/Recommendations.jsx
// "Learning Recommendations": groups personalized learning resources under
// the skill gap they address. Ranking and the "why" text come from the
// backend (recommendationService) and are built from the stored competency,
// required level, gap, priority and resource difficulty - nothing is invented
// here. Progress tracking lives on the Learning Path page.
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Info, ExternalLink, BookOpen } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import api from '../services/api';
import { providerBadgeClass, providerName, integrationModeLabel } from '../utils/providerLabel';

// Official platform landing pages, used only for iGOT Karmayogi and
// NSSTA / TPAC resources. Course-level URLs are not available for these
// prototype resources, so the link opens the relevant official platform.
// A genuine resource.url, if one is ever stored, always takes precedence.
const OFFICIAL_PLATFORM_LINKS = {
  IGOT: { url: 'https://igotkarmayogi.gov.in/', label: 'View on iGOT \u2192' },
  NSSTA: { url: 'https://nssta.gov.in/', label: 'View on NSSTA / TPAC \u2192' },
};

function priorityBadgeClass(priority) {
  if (priority === 'Critical') return 'badge-red';
  if (priority === 'High') return 'badge-amber';
  if (priority === 'Medium') return 'badge-indigo';
  return 'badge-teal';
}

// Every provider a recommendation might come from. 'All'
// plus one entry per provider currently in use; kept as a plain list
// rather than derived from data so the filter buttons don't jump
// around as recommendations change.
const PROVIDER_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'IGOT', label: 'iGOT Karmayogi' },
  { value: 'NSSTA', label: 'NSSTA / TPAC' },
  { value: 'MOCK_INTEGRATION', label: 'Prototype Catalog' },
];

export default function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedKey, setExpandedKey] = useState(null);
  const [providerFilter, setProviderFilter] = useState('ALL');

  useEffect(() => {
    fetchRecommendations();
  }, []);

  async function fetchRecommendations() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/recommendations');
      setRecommendations(data.recommendations || []);
      setUnavailable(data.unavailable || []);
      setMessage(data.recommendations.length === 0 ? data.message : '');
    } catch (err) {
      setError('Could not load your recommendations.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    try {
      const { data } = await api.post('/recommendations/refresh');
      setRecommendations(data.recommendations || []);
      setUnavailable(data.unavailable || []);
      setMessage(data.recommendations.length === 0 ? data.message : '');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not refresh your recommendations.');
    } finally {
      setRefreshing(false);
    }
  }

  // Provider filter applies to individual recommended
  // resources (each has its own resource.source), not whole
  // competency groups, so a group can still appear with fewer items
  // once filtered rather than disappearing entirely.
  const filteredRecommendations = useMemo(() => {
    if (providerFilter === 'ALL') return recommendations;
    return recommendations.filter((rec) => rec.resource?.source === providerFilter);
  }, [recommendations, providerFilter]);

  // Group flat recommendation rows by the skill gap (competency) they
  // address, in the order the backend already ranked them (priority
  // desc, then gap desc).
  const groups = useMemo(() => {
    const byCompetency = [];
    const seen = new Map();
    for (const rec of filteredRecommendations) {
      if (!seen.has(rec.competencyId)) {
        const group = {
          competencyId: rec.competencyId,
          name: rec.competencyName,
          category: rec.category,
          currentLevel: rec.currentLevel,
          requiredLevel: rec.requiredLevel,
          gap: rec.gap,
          priority: rec.priority,
          items: [],
        };
        seen.set(rec.competencyId, group);
        byCompetency.push(group);
      }
      seen.get(rec.competencyId).items.push(rec);
    }
    return byCompetency;
  }, [filteredRecommendations]);

  return (
    <AppShell>
        <div className="page-header">
          <div>
            <h2>Learning Recommendations</h2>
            <p>Personalized learning resources chosen to close your highest-priority skill gaps first. Each one explains why it was selected.</p>
          </div>
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            {refreshing ? 'Refreshing...' : 'Refresh Recommendations'}
          </button>
        </div>

        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink-500)',
            background: 'var(--surface-2)',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 16,
            display: 'inline-block',
          }}
        >
          Recommendations can draw on iGOT Karmayogi, NSSTA / TPAC, and the SkillStat AI catalog —
          all three are currently <strong>prototype / mock integrations</strong>, not live government
          platform connections.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {PROVIDER_FILTERS.map((f) => (
            <button
              key={f.value}
              className={f.value === providerFilter ? 'btn btn-secondary' : 'btn-link'}
              onClick={() => setProviderFilter(f.value)}
              style={{
                fontSize: 13,
                padding: '5px 12px',
                borderRadius: 999,
                border: f.value === providerFilter ? undefined : '1px solid var(--border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <div className="page-loading" role="status">Loading your recommendations…</div>}
        {error && (
          <div className="form-error" role="alert">
            {error}{' '}
            <button type="button" className="btn-link" onClick={fetchRecommendations}>Retry</button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && unavailable.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="icon-circle">
                <Sparkles size={24} />
              </div>
              <p>{message || 'No recommendations available yet.'}</p>
            </div>
          </div>
        )}

        {!loading &&
          !error &&
          groups.map((group) => (
            <div className="card" key={group.competencyId} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Skill Gap
                  </div>
                  <h3 style={{ fontSize: 17, margin: '2px 0 6px' }}>{group.name}</h3>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-500)' }}>
                    Current: <strong>{group.currentLevel}%</strong> &nbsp;·&nbsp; Required:{' '}
                    <strong>{group.requiredLevel}%</strong> &nbsp;·&nbsp; Gap: <strong>{group.gap}</strong>
                  </div>
                </div>
                <span className={`badge ${priorityBadgeClass(group.priority)}`}>{group.priority} priority</span>
              </div>

              {group.items.map((rec) => {
                const key = `${rec.competencyId}-${rec.resource?.id}`;
                const isExpanded = expandedKey === key;
                return (
                  <div
                    key={key}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '14px 16px',
                      marginBottom: 12,
                    }}
                  >
                    {rec.resource ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <BookOpen size={15} />
                              <strong>{rec.resource.title}</strong>
                              <span className={`badge ${providerBadgeClass(rec.resource.source)}`}>
                                {providerName(rec.resource)}
                              </span>
                            </div>
                            <p style={{ margin: '6px 0 8px', fontSize: 13.5, color: 'var(--ink-500)' }}>
                              {rec.resource.description}
                            </p>
                            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                              Level: <strong>{rec.resource.difficulty}</strong> &nbsp;·&nbsp; Type:{' '}
                              {rec.resource.learningType} &nbsp;·&nbsp; Duration:{' '}
                              {rec.resource.duration || 'Not specified'}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--ink-300, #9aa1bd)', marginTop: 4 }}>
                              Integration: {integrationModeLabel(rec.resource)}
                              
                              {rec.resource.prerequisites && <> &nbsp;·&nbsp; Prerequisite: {rec.resource.prerequisites}</>}
                            </div>
                          </div>

                          {OFFICIAL_PLATFORM_LINKS[rec.resource.source] ? (
                            <a
                              className="btn btn-secondary"
                              href={rec.resource.url || OFFICIAL_PLATFORM_LINKS[rec.resource.source].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                            >
                              {OFFICIAL_PLATFORM_LINKS[rec.resource.source].label}
                            </a>
                          ) : rec.resource.url ? (
                            <a
                              className="btn btn-secondary"
                              href={rec.resource.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                            >
                              Open Resource <ExternalLink size={14} />
                            </a>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--ink-300, #9aa1bd)', whiteSpace: 'nowrap', textAlign: 'right', maxWidth: 160 }}>
                              Prototype resource (no external link) — start it from your Learning Path.
                            </span>
                          )}
                        </div>

                        <button
                          className="btn-link"
                          onClick={() => setExpandedKey(isExpanded ? null : key)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginTop: 10 }}
                        >
                          <Info size={13} /> {isExpanded ? 'Hide details' : 'Why recommended? / Details'}
                        </button>

                        {isExpanded && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 13.5,
                              color: 'var(--ink-500)',
                              background: 'var(--surface-2)',
                              borderRadius: 8,
                              padding: '10px 12px',
                            }}
                          >
                            <div style={{ marginBottom: 8 }}>{rec.reason}</div>
                            <div style={{ fontSize: 12.5 }}>
                              Provider: <strong>{providerName(rec.resource)}</strong> &nbsp;·&nbsp; Integration status:{' '}
                              <strong>{integrationModeLabel(rec.resource)}</strong>
                              {rec.resource.externalId && (
                                <>
                                  {' '}
                                  &nbsp;·&nbsp; Prototype catalogue code: <strong>{rec.resource.externalId}</strong> (not an enrolment ID)
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: 0 }}>{rec.reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

        {!loading && !error && unavailable.length > 0 && (
          <div className="card" style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Not yet recommendable</h3>
            <p style={{ fontSize: 13.5, color: 'var(--ink-500)', marginBottom: 12 }}>
              These competencies have an open skill gap, but the prototype learning catalogue has no resources
              for them yet, so nothing is recommended rather than guessing one.
            </p>
            {unavailable.map((u) => (
              <div key={u.competencyId} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{u.competencyName}</strong>
                  <span className={`badge ${priorityBadgeClass(u.priority)}`}>{u.priority}</span>
                </div>
                <div style={{ color: 'var(--ink-500)', marginTop: 2 }}>
                  Current {u.currentLevel}% / Required {u.requiredLevel}% (gap {u.gap}) — {u.reason}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppShell>
  );
}
