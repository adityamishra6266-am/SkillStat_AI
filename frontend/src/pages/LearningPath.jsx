// frontend/src/pages/LearningPath.jsx
// "My Learning Path": the official's recommendations turned into ONE ordered
// path with start / progress / complete actions. Sequencing, priorities and
// unlock rules all come from the backend; this page only presents them.
import React, { useEffect, useState } from 'react';
import { Route as RouteIcon, RefreshCw, Lock, CheckCircle2, PlayCircle, Circle, Link2 } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { LoadingSkeleton, ErrorState, EmptyState, apiErrorMessage } from '../components/PageState.jsx';
import { ProviderBadges, OpenResourceLink } from '../components/ProviderInfo.jsx';
import api from '../services/api';

const PRIORITY_CLASS = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-indigo', Low: 'badge-teal' };
const STATUS_CLASS = { Locked: 'badge-slate', Available: 'badge-indigo', 'In Progress': 'badge-amber', Completed: 'badge-teal' };

function StatusIcon({ status }) {
  if (status === 'Completed') return <CheckCircle2 size={22} color="#0f8a68" aria-hidden="true" />;
  if (status === 'In Progress') return <PlayCircle size={22} color="#4338ca" aria-hidden="true" />;
  if (status === 'Locked') return <Lock size={22} color="#9aa1bd" aria-hidden="true" />;
  return <Circle size={22} color="#4b52c4" aria-hidden="true" />;
}

export default function LearningPath() {
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyItemId, setBusyItemId] = useState(null);
  const [progressDrafts, setProgressDrafts] = useState({});

  useEffect(() => { fetchPath(); }, []);

  async function fetchPath() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/learning-path');
      setPath(data.path);
      setMessage(data.path ? '' : data.message);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load your learning path.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setActionError('');
    try {
      const { data } = await api.post('/learning-path/refresh');
      setPath(data.path);
      setMessage(data.path ? '' : data.message);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Could not refresh your learning path.'));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAction(itemId, action, body) {
    setBusyItemId(itemId);
    setActionError('');
    try {
      const { data } = action === 'progress'
        ? await api.put(`/learning-path/items/${itemId}/progress`, body)
        : await api.post(`/learning-path/items/${itemId}/${action}`);
      setPath(data.path);
    } catch (err) {
      setActionError(apiErrorMessage(err, 'That action could not be completed.'));
    } finally {
      setBusyItemId(null);
    }
  }

  const header = (
    <div className="page-header">
      <div>
        <h2>My Learning Path</h2>
        <p>One ordered sequence built from your learning recommendations — higher-priority gaps first, prerequisites before the steps that depend on them.</p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing || loading}>
        <RefreshCw size={16} aria-hidden="true" /> {refreshing ? 'Refreshing…' : 'Refresh Path'}
      </button>
    </div>
  );

  if (loading) return <AppShell>{header}<LoadingSkeleton label="Loading your learning path…" blocks={2} /></AppShell>;
  if (error) return <AppShell>{header}<ErrorState message={error} onRetry={fetchPath} /></AppShell>;

  if (!path || path.items.length === 0) {
    return (
      <AppShell>
        {header}
        <div className="card"><EmptyState icon={RouteIcon}>{message || 'No learning path available yet.'}</EmptyState></div>
      </AppShell>
    );
  }

  const titleById = new Map(path.items.map((i) => [i.resource.title, i]));

  return (
    <AppShell>
      {header}
      {actionError && <div className="form-error" role="alert">{actionError}</div>}

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total steps</div><div className="stat-value">{path.summary.total}</div></div>
        <div className="stat-card"><div className="stat-label">Not started</div><div className="stat-value">{path.summary.notStarted}</div>{path.summary.locked > 0 && <div className="stat-note">{path.summary.locked} locked by a prerequisite</div>}</div>
        <div className="stat-card"><div className="stat-label">In progress</div><div className="stat-value">{path.summary.inProgress}</div></div>
        <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value">{path.summary.completed}</div></div>
      </div>

      <div className="card" style={{ padding: '4px 22px' }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {path.items.map((item, idx) => {
            const isBusy = busyItemId === item.id;
            const draft = progressDrafts[item.id] ?? item.progressPercentage;
            const prereqTitle = item.resource.prerequisites;
            const prereqItem = prereqTitle ? titleById.get(prereqTitle) : null;

            return (
              <li key={item.id} className={`path-step ${item.status === 'Locked' ? 'is-locked' : ''}`}>
                <div className="path-rail">
                  <StatusIcon status={item.status} />
                  {idx < path.items.length - 1 && <span className="line" aria-hidden="true" />}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="flex-between">
                    <div style={{ minWidth: 0 }}>
                      <div className="small muted">Step {item.sequence} · {item.competencyName}</div>
                      <div style={{ fontWeight: 600, fontSize: 16, margin: '2px 0 6px', overflowWrap: 'anywhere' }}>{item.resource.title}</div>
                      <ProviderBadges resource={item.resource} />
                    </div>
                    <div className="flex-wrap">
                      <span className={`badge ${PRIORITY_CLASS[item.priority]}`}>{item.priority} priority</span>
                      <span className={`badge ${STATUS_CLASS[item.status]}`}>{item.status}</span>
                    </div>
                  </div>

                  <dl className="path-facts">
                    <div><dt>Difficulty</dt><dd>{item.resource.difficulty}</dd></div>
                    <div><dt>Duration</dt><dd>{item.resource.duration || 'Not specified'}</dd></div>
                    {item.currentLevel !== null && <div><dt>Current level</dt><dd>{item.currentLevel}%</dd></div>}
                    {item.requiredLevel !== null && <div><dt>Required level</dt><dd>{item.requiredLevel}%</dd></div>}
                    {item.gap !== null && <div><dt>Gap</dt><dd>{item.gap}%</dd></div>}
                  </dl>

                  {prereqTitle && (
                    <p className="small" style={{ margin: '0 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Link2 size={14} aria-hidden="true" />
                      Prerequisite: <strong>{prereqTitle}</strong>
                      {prereqItem && <span className="muted">(step {prereqItem.sequence}, {prereqItem.status.toLowerCase()})</span>}
                    </p>
                  )}
                  <p className="small muted" style={{ margin: '0 0 10px' }}><strong>Why this step:</strong> {item.reason}</p>

                  {(item.status === 'In Progress' || item.status === 'Completed') && (
                    <div style={{ margin: '4px 0 12px' }}>
                      <ProgressBar value={item.progressPercentage} color={item.status === 'Completed' ? '#0f8a68' : undefined} label={`Step ${item.sequence} progress ${item.progressPercentage} percent`} />
                      <div className="small muted" style={{ marginTop: 4 }}>{item.progressPercentage}% complete</div>
                    </div>
                  )}

                  <div className="flex-wrap">
                    {item.status === 'Locked' && (
                      <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Lock size={13} aria-hidden="true" /> Locked — complete {prereqItem ? `step ${prereqItem.sequence}` : 'the prerequisite'} first
                      </span>
                    )}
                    {item.status === 'Available' && (
                      <button type="button" className="btn btn-primary btn-auto btn-sm" disabled={isBusy} onClick={() => handleAction(item.id, 'start')}>
                        {isBusy ? 'Starting…' : 'Start Learning'}
                      </button>
                    )}
                    {item.status === 'In Progress' && (
                      <>
                        <label className="small" htmlFor={`progress-${item.id}`}>Progress %</label>
                        <input
                          id={`progress-${item.id}`}
                          type="number" min="0" max="100" value={draft}
                          onChange={(e) => setProgressDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                          style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
                        />
                        <button type="button" className="btn btn-secondary btn-sm" disabled={isBusy} onClick={() => handleAction(item.id, 'progress', { progressPercentage: Number(draft) })}>Update Progress</button>
                        <button type="button" className="btn btn-teal btn-sm" disabled={isBusy} onClick={() => handleAction(item.id, 'complete')}>{isBusy ? 'Saving…' : 'Mark Completed'}</button>
                      </>
                    )}
                    {item.status === 'Completed' && (
                      <span className="small" style={{ color: '#0f8a68', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} aria-hidden="true" /> Completed</span>
                    )}
                    <OpenResourceLink resource={item.resource} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Learning resources shown as “Prototype / Mock” come from the prototype catalogue; they are not live iGOT Karmayogi or NSSTA enrolments, and “Open Resource” appears only when a real link exists.
      </p>
    </AppShell>
  );
}
