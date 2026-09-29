// frontend/src/pages/Competencies.jsx
// "Competency Profile": the official's current level vs required level per
// competency, with a plain-language explanation of how each score was derived
// (profile estimate and/or assessment evidence) and how confident it is.
// Read-only display plus a "Refresh" action.
import React, { useEffect, useState } from 'react';
import { Target, RefreshCw, Info } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import api from '../services/api';

function confidenceBadgeClass(confidence) {
  if (confidence === 'High') return 'badge-teal';
  if (confidence === 'Medium') return 'badge-amber';
  return 'badge-red';
}

function levelBarColor(current, required) {
  if (required == null) return 'var(--indigo-700, #4338ca)';
  if (current >= required) return '#0f9d78';
  if (current >= required * 0.7) return '#d97706';
  return '#dc2626';
}

export default function Competencies() {
  const [mapped, setMapped] = useState([]);
  const [profileDesignation, setProfileDesignation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchMapping();
  }, []);

  async function fetchMapping() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/competencies/mapping');
      setMapped(data.mapped || []);
      setProfileDesignation(data.profileDesignation || null);
      setMessage(data.mapped.length === 0 ? data.message : '');
    } catch (err) {
      setError('Could not load your competency mapping.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    try {
      const { data } = await api.post('/competencies/mapping');
      setMapped(data.mapped || []);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not refresh your competency mapping.');
    } finally {
      setRefreshing(false);
    }
  }

  const grouped = mapped.reduce((acc, item) => {
    const key = item.category || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <AppShell>
        <div className="page-header">
          <div>
            <h2>Competency Profile</h2>
            <p>
              {profileDesignation
                ? `Mapped for ${profileDesignation} from your official profile and any assessment evidence collected so far.`
                : 'Your official competency profile.'}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            {refreshing ? 'Refreshing...' : 'Refresh Mapping'}
          </button>
        </div>

        {loading && <div className="page-loading" role="status">Loading your competency profile…</div>}
        {error && (
          <div className="form-error" role="alert">
            {error}{' '}
            <button type="button" className="btn-link" onClick={fetchMapping}>Retry</button>
          </div>
        )}

        {!loading && !error && mapped.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="icon-circle">
                <Target size={24} />
              </div>
              <p>{message || 'No competency mapping yet.'}</p>
            </div>
          </div>
        )}

        {!loading &&
          !error &&
          Object.entries(grouped).map(([category, items]) => (
            <div className="card" key={category} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, marginBottom: 16 }}>{category}</h3>

              {items.map((item) => {
                const gapKnown = item.requiredLevel !== null && item.requiredLevel !== undefined;
                const barColor = levelBarColor(item.currentLevel, item.requiredLevel);
                const isExpanded = expandedId === item.competencyId;

                return (
                  <div
                    key={item.competencyId}
                    style={{
                      padding: '14px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 200 }}>
                        <strong>{item.name}</strong>
                        <div style={{ marginTop: 4 }}>
                          <span className={`badge ${confidenceBadgeClass(item.confidence)}`}>{item.confidence} confidence</span>
                          {item.source === 'mapping+quiz' && (
                            <span className="badge badge-indigo" style={{ marginLeft: 6 }}>
                              Includes quiz evidence
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: 'var(--ink-500)' }}>
                            Current: <strong>{item.currentLevel}%</strong>
                          </span>
                          <span style={{ color: 'var(--ink-500)' }}>
                            {gapKnown ? (
                              <>
                                Required: <strong>{item.requiredLevel}%</strong>
                              </>
                            ) : (
                              'No requirement configured for your role'
                            )}
                          </span>
                        </div>
                        <div className="progress-bar" style={{ position: 'relative' }}>
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${Math.min(item.currentLevel, 100)}%`, background: barColor }}
                          />
                          {gapKnown && (
                            <div
                              title={`Required level: ${item.requiredLevel}%`}
                              style={{
                                position: 'absolute',
                                left: `${Math.min(item.requiredLevel, 100)}%`,
                                top: -2,
                                bottom: -2,
                                width: 2,
                                background: 'var(--ink-900, #111)',
                              }}
                            />
                          )}
                        </div>
                      </div>

                      <button
                        className="btn-link"
                        onClick={() => setExpandedId(isExpanded ? null : item.competencyId)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Info size={14} /> {isExpanded ? 'Hide reason' : 'Why this score?'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 13.5,
                          color: 'var(--ink-500)',
                          background: 'var(--surface-2, #f7f7fb)',
                          borderRadius: 8,
                          padding: '10px 12px',
                        }}
                      >
                        {item.reason}
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          Last updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </AppShell>
  );
}
