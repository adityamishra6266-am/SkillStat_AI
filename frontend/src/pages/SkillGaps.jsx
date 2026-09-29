// frontend/src/pages/SkillGaps.jsx
// "Skill Gap Analysis": required level vs current level vs gap vs priority for
// every competency mapped to the official's designation. All numbers come from
// the backend (skillGapService); nothing is calculated in the browser.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Info } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import api from '../services/api';

function priorityBadgeClass(priority) {
  if (priority === 'Critical') return 'badge-red';
  if (priority === 'High') return 'badge-amber';
  if (priority === 'Medium') return 'badge-indigo';
  return 'badge-teal';
}

export default function SkillGaps() {
  const [gaps, setGaps] = useState([]);
  const [unmapped, setUnmapped] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchGaps();
  }, []);

  async function fetchGaps() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/skill-gaps');
      setGaps(data.gaps || []);
      setUnmapped(data.unmapped || []);
      setSummary(data.summary || null);
      setMessage(data.gaps.length === 0 && data.unmapped.length === 0 ? data.message : '');
    } catch (err) {
      setError('Could not load your skill gaps.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    try {
      const { data } = await api.post('/skill-gaps/refresh');
      setGaps(data.gaps || []);
      setUnmapped(data.unmapped || []);
      setSummary(data.summary || null);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not recalculate your skill gaps.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppShell>
        <div className="page-header">
          <div>
            <h2>Skill Gap Analysis</h2>
            <p>Where your current competency falls short of what your role requires.</p>
          </div>
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw size={16} style={{ marginRight: 6 }} />
            {refreshing ? 'Recalculating...' : 'Recalculate'}
          </button>
        </div>

        {loading && <div className="page-loading" role="status">Loading your skill gaps…</div>}
        {error && (
          <div className="form-error" role="alert">
            {error}{' '}
            <button type="button" className="btn-link" onClick={fetchGaps}>Retry</button>
          </div>
        )}

        {!loading && !error && gaps.length === 0 && unmapped.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="icon-circle">
                <AlertTriangle size={24} />
              </div>
              <p>{message || 'No skill gaps calculated yet.'}</p>
            </div>
          </div>
        )}

        {!loading && !error && gaps.length > 0 && (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Critical Gaps</div>
                <div className="stat-value">{summary?.counts?.Critical ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">High Priority</div>
                <div className="stat-value">{summary?.counts?.High ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Medium Priority</div>
                <div className="stat-value">{summary?.counts?.Medium ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Tracked</div>
                <div className="stat-value">{summary?.totalGaps ?? 0}</div>
              </div>
            </div>

            {summary?.topGap && summary.topGap.gap > 0 && (
              <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #dc2626' }}>
                <strong>Highest-priority gap: {summary.topGap.name}</strong>
                <p style={{ margin: '6px 0 0', color: 'var(--ink-500)', fontSize: 14 }}>
                  {summary.topGap.explanation}
                </p>
              </div>
            )}

            <div className="card">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Competency</th>
                    <th>Required</th>
                    <th>Current</th>
                    <th>Gap</th>
                    <th>Priority</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g) => (
                    <React.Fragment key={g.competencyId}>
                      <tr>
                        <td>{g.name}</td>
                        <td>{g.requiredLevel}%</td>
                        <td>{g.currentLevel}%</td>
                        <td>{g.gap}</td>
                        <td>
                          <span className={`badge ${priorityBadgeClass(g.priority)}`}>{g.priority}</span>
                        </td>
                        <td>
                          <button
                            className="btn-link"
                            onClick={() => setExpandedId(expandedId === g.competencyId ? null : g.competencyId)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}
                          >
                            <Info size={13} /> {expandedId === g.competencyId ? 'Hide' : 'Why?'}
                          </button>
                        </td>
                      </tr>
                      {expandedId === g.competencyId && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--surface-2)', fontSize: 13.5, color: 'var(--ink-500)' }}>
                            {g.explanation}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && unmapped.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Not yet comparable</h3>
            <p style={{ fontSize: 13.5, color: 'var(--ink-500)', marginBottom: 12 }}>
              These competencies are mapped for you, but your role has no configured requirement for them yet,
              so no gap is shown rather than guessing one.
            </p>
            {unmapped.map((u) => (
              <div key={u.competencyId} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
                <strong>{u.name}</strong> — current {u.currentLevel}%
                <div style={{ color: 'var(--ink-500)', marginTop: 2 }}>{u.reason}</div>
              </div>
            ))}
          </div>
        )}
      </AppShell>
  );
}
