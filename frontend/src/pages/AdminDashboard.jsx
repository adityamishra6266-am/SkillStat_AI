// frontend/src/pages/AdminDashboard.jsx
// Administrator Dashboard - workforce competency analytics.
//
// Everything comes from GET /api/admin/dashboard (one consolidated, read-only
// payload) plus GET /api/admin/officials/:id for the detail drawer. Nothing is
// computed here except client-side filtering of the already-fetched officials
// list, which is fine at prototype scale. The date range is sent to the
// server (it changes the assessment analytics), the other filters are local.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, ClipboardCheck, TrendingUp, AlertTriangle, RefreshCw, Building2, Search,
  GraduationCap, X, Eye, FilterX,
} from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import ProgressBar, { levelColor } from '../components/ProgressBar.jsx';
import { LoadingSkeleton, ErrorState, EmptyState, InlineLoading, apiErrorMessage } from '../components/PageState.jsx';
import api from '../services/api';

const PRIORITY_CLASS = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-indigo', Low: 'badge-teal' };
const TABS = [
  ['overview', 'Overview'],
  ['officials', 'Officials'],
  ['competencies', 'Competencies'],
  ['training', 'Training Needs'],
  ['assessments', 'Assessments'],
];
const RANGES = [
  ['all', 'All time'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
];

function providerBadgeClass(source) {
  if (source === 'IGOT') return 'badge-violet';
  if (source === 'NSSTA') return 'badge-cyan';
  return 'badge-slate';
}
function gapBarColor(gap) {
  if (gap >= 30) return 'var(--red-600)';
  if (gap >= 20) return 'var(--amber-600)';
  if (gap >= 10) return 'var(--indigo-500)';
  return 'var(--teal-500)';
}
function gapBadge(gap) {
  return gap >= 20 ? 'badge-red' : gap >= 10 ? 'badge-amber' : 'badge-teal';
}
const dash = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

function Kpi({ icon: Icon, label, value, empty, note }) {
  return (
    <div className="stat-card">
      <div className="stat-label"><Icon size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-hidden="true" />{label}</div>
      {empty ? <div className="stat-value is-empty">No data available yet</div> : <div className="stat-value">{value}</div>}
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

/** Lightweight SVG line chart - real points only, no fabricated buckets. */
function TimeChart({ points, granularity }) {
  if (points.length === 0) return null;
  const W = 640, H = 240, padL = 40, padR = 16, padT = 16, padB = 46;
  const max = Math.max(...points.map((p) => p.count));
  const yMax = Math.max(1, Math.ceil(max * 1.15));
  const x = (i) => (points.length === 1 ? (padL + (W - padR)) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (1 - v / yMax) * (H - padT - padB);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.count)}`).join(' ');
  const ticks = [0, Math.round(yMax / 2), yMax];
  const label = (p) => {
    if (granularity === 'month') return new Date(`${p}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    return new Date(`${p}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  const step = Math.ceil(points.length / 7);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-chart" style={{ width: '100%', height: 'auto' }} role="img"
        aria-label={`Assessments over time by ${granularity}. ${points.map((p) => `${label(p.period)}: ${p.count}`).join('; ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-500)">{t}</text>
          </g>
        ))}
        {points.length > 1 && <path d={line} fill="none" stroke="var(--indigo-600)" strokeWidth="2.5" />}
        {points.map((p, i) => (
          <g key={p.period}>
            <circle cx={x(i)} cy={y(p.count)} r="4.5" fill="var(--indigo-600)"><title>{`${label(p.period)}: ${p.count} assessment${p.count === 1 ? '' : 's'}`}</title></circle>
            <text x={x(i)} y={y(p.count) - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--indigo-900)">{p.count}</text>
            {(i % step === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - padB + 20} textAnchor="middle" fontSize="11" fill="var(--ink-500)">{label(p.period)}</text>
            )}
          </g>
        ))}
      </svg>
      <p className="small muted" style={{ margin: '6px 0 0' }}>Assessment attempts per {granularity}. Periods without attempts are omitted.</p>
    </div>
  );
}

function OfficialDrawer({ officialId, onClose }) {
  const [official, setOfficial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const closeRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/admin/officials/${officialId}`);
      setOfficial(data.official);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this official.'));
    } finally {
      setLoading(false);
    }
  }, [officialId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="official-drawer-title">
        <div className="drawer-header">
          <div style={{ minWidth: 0 }}>
            <h3 id="official-drawer-title" style={{ marginBottom: 2 }}>{official ? official.name : 'Official details'}</h3>
            {official && <div className="small muted">{official.designation || 'No designation'}{official.department ? ` · ${official.department}` : ''}</div>}
          </div>
          <button type="button" ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close official details"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="drawer-body">
          {loading && <InlineLoading label="Loading official details…" />}
          {error && <ErrorState message={error} onRetry={load} />}
          {official && !loading && (
            <>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
                <div className="stat-card"><div className="stat-label">Assessment status</div><div style={{ marginTop: 4 }}><span className={`badge ${official.assessmentStatus === 'Assessed' ? 'badge-teal' : 'badge-slate'}`}>{official.assessmentStatus}</span></div><div className="stat-note">{official.assessmentCount} attempt{official.assessmentCount === 1 ? '' : 's'}</div></div>
                <div className="stat-card"><div className="stat-label">Overall competency</div>{official.overallCompetency === null ? <div className="stat-value is-empty">No data yet</div> : <div className="stat-value">{official.overallCompetency}%</div>}</div>
              </div>

              <h4 style={{ fontSize: 15 }}>Competency breakdown</h4>
              {official.competencies.length === 0 ? (
                <p className="small muted">No competency data available yet.</p>
              ) : (
                official.competencies.map((c) => (
                  <div key={c.competencyId} style={{ marginBottom: 14 }}>
                    <div className="flex-between small" style={{ marginBottom: 4 }}>
                      <strong>{c.name}</strong>
                      <span className="muted">{c.currentLevel}%{c.requiredLevel !== null ? ` of ${c.requiredLevel}% required` : ''}</span>
                    </div>
                    <ProgressBar value={c.currentLevel} required={c.requiredLevel} color={levelColor(c.currentLevel, c.requiredLevel)} label={`${c.name}: ${c.currentLevel} percent`} />
                    <div className="small muted" style={{ marginTop: 3 }}>{c.confidence} confidence · {c.evidenceSource}</div>
                  </div>
                ))
              )}

              <h4 style={{ fontSize: 15, marginTop: 22 }}>Major skill gaps</h4>
              {official.majorGaps.length === 0 ? (
                <p className="small muted">No open skill gaps.</p>
              ) : (
                <div className="table-scroll">
                  <table className="results-table" style={{ minWidth: 380 }}>
                    <thead><tr><th>Competency</th><th>Gap</th><th>Priority</th></tr></thead>
                    <tbody>
                      {official.majorGaps.map((g) => (
                        <tr key={g.competencyId}><td>{g.name}</td><td>{g.gap}%</td><td><span className={`badge ${PRIORITY_CLASS[g.priority]}`}>{g.priority}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h4 style={{ fontSize: 15, marginTop: 22 }}>Learning progress</h4>
              {official.learningProgress.totalSteps === 0 ? (
                <p className="small muted">No learning path yet.</p>
              ) : (
                <>
                  <ProgressBar value={official.learningProgress.overallProgress} label={`Learning progress ${official.learningProgress.overallProgress} percent`} />
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    {official.learningProgress.counts.Completed} completed · {official.learningProgress.counts['In Progress']} in progress · {official.learningProgress.counts.Available} not started · {official.learningProgress.counts.Locked} locked ({official.learningProgress.totalSteps} steps)
                  </p>
                </>
              )}

              <h4 style={{ fontSize: 15, marginTop: 22 }}>Recent assessments</h4>
              {official.recentAssessments.length === 0 ? (
                <p className="small muted">No assessments completed yet.</p>
              ) : (
                official.recentAssessments.map((a) => (
                  <div key={a.id} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="small" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{a.title}</div>
                      <div className="small muted">{a.type} · {new Date(a.attemptedAt).toLocaleDateString()}</div>
                    </div>
                    <span className={`badge ${a.percentage >= 70 ? 'badge-teal' : a.percentage >= 50 ? 'badge-amber' : 'badge-red'}`}>{a.score}/{a.total} · {a.percentage}%</span>
                  </div>
                ))
              )}
              <p className="small muted" style={{ marginTop: 18 }}>Privacy: contact details and authentication data are never shown to administrators.</p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [designationFilter, setDesignationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [competencyFilter, setCompetencyFilter] = useState('All');

  const fetchDashboard = useCallback(async (mode = 'load') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/dashboard', { params: range === 'all' ? {} : { range } });
      setDashboard(data.dashboard);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load the administrator dashboard right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => { fetchDashboard(dashboard ? 'refresh' : 'load'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  const officials = dashboard?.officials || [];
  const competencyOptions = dashboard?.competencies || [];
  const departmentOptions = useMemo(() => ['All', ...new Set(officials.map((o) => o.department).filter(Boolean))], [officials]);
  const designationOptions = useMemo(() => ['All', ...new Set(officials.map((o) => o.designation).filter(Boolean))], [officials]);

  const filtered = useMemo(() => officials.filter((o) => {
    if (departmentFilter !== 'All' && o.department !== departmentFilter) return false;
    if (designationFilter !== 'All' && o.designation !== designationFilter) return false;
    if (statusFilter !== 'All' && o.assessmentStatus !== statusFilter) return false;
    if (competencyFilter !== 'All' && !o.gapCompetencyIds.includes(Number(competencyFilter))) return false;
    if (search.trim() && !o.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }), [officials, departmentFilter, designationFilter, statusFilter, competencyFilter, search]);

  const filtersActive = search || departmentFilter !== 'All' || designationFilter !== 'All' || statusFilter !== 'All' || competencyFilter !== 'All';
  function resetFilters() {
    setSearch(''); setDepartmentFilter('All'); setDesignationFilter('All'); setStatusFilter('All'); setCompetencyFilter('All');
  }

  const header = (
    <div className="page-header">
      <div>
        <h2>Administrator Dashboard</h2>
        <p>Workforce competency analytics, training needs and assessment activity across all officials.</p>
      </div>
      <div className="flex-wrap">
        <label className="small" htmlFor="admin-range">Assessment period</label>
        <select id="admin-range" value={range} onChange={(e) => setRange(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff' }}>
          {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" className="btn btn-secondary" onClick={() => fetchDashboard('refresh')} disabled={refreshing || loading}>
          <RefreshCw size={16} aria-hidden="true" /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );

  if (loading && !dashboard) return <AppShell>{header}<LoadingSkeleton label="Loading administrator dashboard…" /></AppShell>;
  if (error && !dashboard) return <AppShell>{header}<ErrorState message={error} onRetry={() => fetchDashboard()} /></AppShell>;

  const { overview, competencies, departments, trainingNeeds, providers, assessment, diagnostic, learningProgress } = dashboard;
  const maxGap = Math.max(1, ...competencies.map((c) => c.avgGap));
  const noOfficials = overview.totalOfficials === 0;

  return (
    <AppShell>
      {header}
      {error && <div className="form-error" role="alert">{error} <button type="button" className="btn-link" onClick={() => fetchDashboard('refresh')}>Retry</button></div>}

      <div className="tab-bar" role="tablist" aria-label="Dashboard sections">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {/* ------------------------------------------------ OVERVIEW */}
        {tab === 'overview' && (
          <>
            <div className="stat-grid">
              <Kpi icon={Users} label="Total Officials" value={overview.totalOfficials} empty={noOfficials} />
              <Kpi icon={ClipboardCheck} label="Assessments Completed" value={overview.assessmentsCompleted} note="All time" />
              <Kpi icon={TrendingUp} label="Average Competency" value={dash(overview.averageCompetency, '%')} empty={overview.averageCompetency === null} />
              <Kpi icon={AlertTriangle} label="Officials With Critical Gaps" value={overview.officialsWithCriticalGaps} empty={noOfficials} />
            </div>

            <div className="two-col">
              <div className="card">
                <h3 className="section-heading">Largest competency gaps</h3>
                <p className="section-subtext">Average gap between required and current level across the workforce.</p>
                {competencies.length === 0 ? (
                  <EmptyState icon={TrendingUp}>No data available yet. Competency analytics appear after officials complete their profile or an assessment.</EmptyState>
                ) : competencies.slice(0, 6).map((c) => (
                  <div className="gap-bar-row" key={c.competencyId}>
                    <div className="gap-bar-label">{c.name}</div>
                    <div className="gap-bar-track" role="img" aria-label={`${c.name}: average gap ${c.avgGap} percent`}>
                      <div className="gap-bar-fill" style={{ width: `${Math.max(3, (c.avgGap / maxGap) * 100)}%`, background: gapBarColor(c.avgGap) }} />
                    </div>
                    <div className="gap-bar-value">{c.avgGap}%</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 className="section-heading">Learning progress</h3>
                <p className="section-subtext">Status of every learning-path step across all officials.</p>
                {learningProgress.total === 0 ? (
                  <EmptyState icon={GraduationCap}>No learning activity recorded yet.</EmptyState>
                ) : (
                  <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 0 }}>
                    <div className="stat-card"><div className="stat-label">Not started</div><div className="stat-value">{learningProgress.counts.Available}</div></div>
                    <div className="stat-card"><div className="stat-label">In progress</div><div className="stat-value">{learningProgress.counts['In Progress']}</div></div>
                    <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value">{learningProgress.counts.Completed}</div></div>
                    <div className="stat-card"><div className="stat-label">Locked</div><div className="stat-value">{learningProgress.counts.Locked}</div></div>
                  </div>
                )}
              </div>
            </div>

            <div className="two-col">
              <div className="card">
                <h3 className="section-heading">Department analysis</h3>
                <p className="section-subtext">Officials, average competency and the largest gap per department.</p>
                {departments.length === 0 ? (
                  <EmptyState icon={Building2}>No department data available yet.</EmptyState>
                ) : (
                  <div className="table-scroll">
                    <table className="results-table">
                      <thead><tr><th>Department</th><th>Officials</th><th>Avg competency</th><th>Major gap</th></tr></thead>
                      <tbody>
                        {departments.map((d) => (
                          <tr key={d.department}><td>{d.department}</td><td>{d.officials}</td><td>{dash(d.avgCompetency, '%')}</td><td>{d.majorGap ? d.majorGap.name : '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <h3 className="section-heading">Training providers</h3>
                <p className="section-subtext">Where recommended learning comes from. Provider data is prototype / mock — no live iGOT or NSSTA connection is configured.</p>
                {providers.length === 0 ? (
                  <EmptyState>No recommendations generated yet.</EmptyState>
                ) : providers.map((p) => (
                  <div className="provider-dist-row" key={p.source}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.provider}</div>
                      <span className={`badge ${providerBadgeClass(p.source)}`} style={{ marginTop: 4 }}>{p.integrationMode}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--indigo-900)' }}>{p.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ------------------------------------------------ OFFICIALS */}
        {tab === 'officials' && (
          <div className="card">
            <h3 className="section-heading">Officials</h3>
            <p className="section-subtext">Privacy-conscious per-official view — no passwords, tokens or contact details.</p>

            {officials.length === 0 ? (
              <EmptyState icon={Users}>No officials have registered yet.</EmptyState>
            ) : (
              <>
                <div className="admin-filter-bar" role="search">
                  <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-300)' }} aria-hidden="true" />
                    <input type="search" aria-label="Search officials by name" placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
                  </div>
                  <select aria-label="Filter by department" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                    {departmentOptions.map((d) => <option key={d} value={d}>{d === 'All' ? 'All departments' : d}</option>)}
                  </select>
                  <select aria-label="Filter by designation" value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)}>
                    {designationOptions.map((d) => <option key={d} value={d}>{d === 'All' ? 'All designations' : d}</option>)}
                  </select>
                  <select aria-label="Filter by assessment status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="All">All assessment statuses</option>
                    <option value="Assessed">Assessed</option>
                    <option value="Not Yet Assessed">Not yet assessed</option>
                  </select>
                  <select aria-label="Filter by competency with an open gap" value={competencyFilter} onChange={(e) => setCompetencyFilter(e.target.value)}>
                    <option value="All">All competencies</option>
                    {competencyOptions.map((c) => <option key={c.competencyId} value={c.competencyId}>Gap in: {c.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters} disabled={!filtersActive}><FilterX size={14} aria-hidden="true" /> Reset Filters</button>
                </div>
                <p className="small muted" role="status" aria-live="polite" style={{ margin: '0 0 12px' }}>
                  Showing {filtered.length} of {officials.length} officials
                  {competencyFilter !== 'All' && ' with an open gap in the selected competency'}.
                </p>

                {filtered.length === 0 ? (
                  <EmptyState icon={Search} action={<button type="button" className="btn btn-secondary btn-auto" style={{ marginTop: 8 }} onClick={resetFilters}>Reset Filters</button>}>No officials match the current filters.</EmptyState>
                ) : (
                  <div className="table-scroll">
                    <table className="results-table" style={{ minWidth: 900 }}>
                      <thead>
                        <tr><th>Official</th><th>Designation</th><th>Department</th><th>Assessment</th><th>Overall competency</th><th>Top skill gap</th><th>Learning progress</th><th><span className="sr-only">Action</span></th></tr>
                      </thead>
                      <tbody>
                        {filtered.map((o) => (
                          <tr key={o.id}>
                            <td style={{ fontWeight: 600 }}>{o.name}</td>
                            <td>{o.designation || '—'}</td>
                            <td>{o.department || '—'}</td>
                            <td>
                              <span className={`badge ${o.assessmentStatus === 'Assessed' ? 'badge-teal' : 'badge-slate'}`}>{o.assessmentStatus}</span>
                              {range !== 'all' && o.assessmentsInRange !== null && <div className="small muted">{o.assessmentsInRange} in period</div>}
                            </td>
                            <td>{o.overallCompetency !== null ? `${o.overallCompetency}%` : 'No data'}</td>
                            <td>{o.topSkillGap ? <span className={`badge ${PRIORITY_CLASS[o.topSkillGap.priority]}`}>{o.topSkillGap.name} ({o.topSkillGap.gap}%)</span> : '—'}</td>
                            <td>{o.learningProgressPercentage !== null ? `${o.learningProgressPercentage}%` : 'No path yet'}</td>
                            <td>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedId(o.id)} aria-label={`View details for ${o.name}`}>
                                <Eye size={14} aria-hidden="true" /> View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------ COMPETENCIES */}
        {tab === 'competencies' && (
          <div className="card">
            <h3 className="section-heading">Competency analysis</h3>
            <p className="section-subtext">Average current level vs average required level, across every official mapped to each competency.</p>
            {competencies.length === 0 ? (
              <EmptyState icon={TrendingUp}>No data available yet. Competency analytics appear after officials complete their profile or an assessment.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="results-table">
                  <thead><tr><th>Competency</th><th>Category</th><th>Officials</th><th>Avg level</th><th>Avg required</th><th>Avg gap</th></tr></thead>
                  <tbody>
                    {competencies.map((c) => (
                      <tr key={c.competencyId}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.category}</td><td>{c.officialsMapped}</td>
                        <td>{c.avgCurrentLevel}%</td><td>{c.avgRequiredLevel}%</td>
                        <td><span className={`badge ${gapBadge(c.avgGap)}`}>{c.avgGap}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------ TRAINING NEEDS */}
        {tab === 'training' && (
          <div className="card">
            <h3 className="section-heading">Top training needs</h3>
            <p className="section-subtext">Competencies ranked by how many officials currently have an open gap (ties broken by average gap).</p>
            {trainingNeeds.length === 0 ? (
              <EmptyState icon={AlertTriangle}>No open skill gaps recorded yet.</EmptyState>
            ) : (
              <ol className="training-priority-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {trainingNeeds.map((t, idx) => (
                  <li className="training-priority-item" key={t.competencyId}>
                    <div className="training-priority-rank">{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div className="small muted">Average gap: {t.avgGap} points</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--indigo-900)' }}>{t.officialsAffected}</div>
                      <div className="small muted">officials affected</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* ------------------------------------------------ ASSESSMENTS */}
        {tab === 'assessments' && (
          <>
            <div className="stat-grid">
              <Kpi icon={Users} label="Officials Assessed" value={assessment.usersAssessed} empty={assessment.assessmentAttempts === 0} note={RANGES.find(([v]) => v === range)[1]} />
              <Kpi icon={ClipboardCheck} label="Assessment Attempts" value={assessment.assessmentAttempts} note={RANGES.find(([v]) => v === range)[1]} />
              <Kpi icon={TrendingUp} label="Average Score" value={dash(assessment.averageScore, '%')} empty={assessment.averageScore === null} />
              <Kpi icon={TrendingUp} label="Average Competency" value={dash(assessment.averageCompetency, '%')} empty={assessment.averageCompetency === null} />
            </div>

            <div className="card mb-20">
              <h3 className="section-heading">Assessments over time</h3>
              <p className="section-subtext">{RANGES.find(([v]) => v === range)[1]} — grouped by {assessment.granularity}. Change the period at the top of the page.</p>
              {assessment.overTime.length === 0 ? (
                <EmptyState icon={ClipboardCheck}>No assessment data available for this period.</EmptyState>
              ) : (
                <TimeChart points={assessment.overTime} granularity={assessment.granularity} />
              )}
            </div>

            <div className="card">
              <h3 className="section-heading">Competency assessment coverage</h3>
              {diagnostic.eligibleOfficials === 0 ? (
                <p className="section-subtext">No officials with a designation yet — coverage appears once official profiles are completed.</p>
              ) : (
                <>
                  <p className="section-subtext">
                    {diagnostic.assessedOfficials} of {diagnostic.eligibleOfficials} eligible officials have completed a competency assessment
                    {diagnostic.notYetAssessed > 0 && ` — ${diagnostic.notYetAssessed} not yet assessed`}.
                  </p>
                  <ProgressBar value={diagnostic.coveragePercentage} label={`Assessment coverage ${diagnostic.coveragePercentage} percent`} />
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: 'var(--indigo-900)' }}>{diagnostic.coveragePercentage}% coverage</div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {selectedId !== null && <OfficialDrawer officialId={selectedId} onClose={() => setSelectedId(null)} />}
    </AppShell>
  );
}
