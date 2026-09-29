// frontend/src/pages/Dashboard.jsx
// Central control panel for the adaptive learning loop. Reads everything from
// GET /api/dashboard; no scores, gaps or priorities are computed here - the
// backend services own that. Where there is no data the page says so
// ("No data available yet") instead of showing a misleading 0%.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, AlertTriangle, Sparkles, Route as RouteIcon, FileText,
  CheckCircle2, PlayCircle, Lock, Circle, ArrowRight, ClipboardCheck,
} from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import ProgressBar, { levelColor } from '../components/ProgressBar.jsx';
import { LoadingSkeleton, ErrorState, EmptyState, apiErrorMessage } from '../components/PageState.jsx';
import { AdaptiveLoopStrip, HowItWorks } from '../components/AdaptiveLoop.jsx';
import { ProviderBadges, OpenResourceLink } from '../components/ProviderInfo.jsx';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';

const PRIORITY_CLASS = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-indigo', Low: 'badge-teal' };
const CONFIDENCE_CLASS = { High: 'badge-teal', Medium: 'badge-amber', Low: 'badge-red' };

function StatusIcon({ status }) {
  if (status === 'Completed') return <CheckCircle2 size={16} color="#0f8a68" aria-hidden="true" />;
  if (status === 'In Progress') return <PlayCircle size={16} color="#4338ca" aria-hidden="true" />;
  if (status === 'Locked') return <Lock size={16} color="#9aa1bd" aria-hidden="true" />;
  return <Circle size={16} color="#9aa1bd" aria-hidden="true" />;
}

function Stat({ label, value, note, empty }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      {empty ? <div className="stat-value is-empty">No data available yet</div> : <div className="stat-value">{value}</div>}
      {note && !empty && <div className="stat-note">{note}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchDashboard(); }, []);

  async function fetchDashboard() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/dashboard');
      setDashboard(data.dashboard);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to load your dashboard right now.'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <AppShell><LoadingSkeleton label="Loading your dashboard…" /></AppShell>;
  if (error || !dashboard) return <AppShell><ErrorState message={error} onRetry={fetchDashboard} /></AppShell>;

  const { profile, profileCompletion, stats, competencies, skillGaps, skillGapSummary, topRecommendation, learningPath, recentResults, currentLearningArea, needsDiagnostic } = dashboard;
  const firstName = user?.name?.split(' ')[0] || 'there';
  const hasCompetencies = competencies.length > 0;

  const items = learningPath?.items || [];
  const currentStep = items.find((i) => i.status === 'In Progress') || items.find((i) => i.status === 'Available') || null;
  const completedSteps = items.filter((i) => i.status === 'Completed').length;
  const pathTotal = learningPath?.summary?.total ?? 0;

  // Which stage of the cycle the official is at, from real state.
  let activeStage = 'Assess';
  if (hasCompetencies && !needsDiagnostic) activeStage = skillGaps.length > 0 ? 'Learn' : 'Reassess';
  if (needsDiagnostic) activeStage = 'Assess';

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h2>Welcome, {firstName}</h2>
          <p>
            {profile.designation || 'Complete your official profile to personalize this dashboard'}
            {profile.department ? ` · ${profile.department}` : ''}
          </p>
        </div>
        <div style={{ minWidth: 220 }}>
          <div className="flex-between small" style={{ marginBottom: 6 }}>
            <span className="muted">Profile completion</span>
            <strong>{profileCompletion}%</strong>
          </div>
          <ProgressBar value={profileCompletion} label={`Profile completion ${profileCompletion} percent`} />
        </div>
      </div>

      <AdaptiveLoopStrip active={activeStage} />

      {needsDiagnostic && (
        <div className="card mb-20 flex-between" style={{ border: '1px solid #c7d2fe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="icon-circle" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--indigo-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardCheck size={22} aria-hidden="true" />
            </div>
            <div>
              <strong>Your competency profile is based on your profile details only.</strong>
              <p className="small muted" style={{ margin: '4px 0 0' }}>A short competency assessment replaces this estimate with assessment evidence. Estimated time: 5–10 minutes.</p>
            </div>
          </div>
          <Link to="/diagnostic-assessment" className="btn btn-primary btn-auto">Start Competency Assessment</Link>
        </div>
      )}

      {/* Overview */}
      <div className="stat-grid">
        <Stat label="Overall Competency" value={`${stats.overallCompetency}%`} empty={stats.overallCompetency === null} note={hasCompetencies ? `${competencies.length} competencies mapped` : null} />
        <Stat label="Critical Skill Gaps" value={stats.criticalGaps} empty={!hasCompetencies} note={skillGapSummary ? `${skillGapSummary.totalGaps} open gap${skillGapSummary.totalGaps === 1 ? '' : 's'} in total` : null} />
        <Stat label="Learning Progress" value={`${stats.learningProgress}%`} empty={stats.learningProgress === null} note={pathTotal ? `${completedSteps} of ${pathTotal} steps completed` : null} />
        <Stat label="Assessments Completed" value={stats.assessmentsCompleted} note={stats.assessmentsCompleted === 0 ? 'None yet' : null} />
      </div>

      {/* Competency profile */}
      <section className="card mb-20" aria-labelledby="profile-heading">
        <h3 id="profile-heading" className="card-title"><Target size={18} aria-hidden="true" /> My Competency Profile</h3>
        {!hasCompetencies ? (
          <EmptyState
            icon={Target}
            action={
              <div className="flex-wrap" style={{ justifyContent: 'center', marginTop: 10 }}>
                <Link to="/profile" className="btn btn-secondary">Complete Official Profile</Link>
                <Link to="/diagnostic-assessment" className="btn btn-primary btn-auto">Start Competency Assessment</Link>
              </div>
            }
          >
            No data available yet. Complete your official profile or take the competency assessment to build your competency profile.
          </EmptyState>
        ) : (
          competencies.map((c) => {
            const known = c.requiredLevel !== null && c.requiredLevel !== undefined;
            const gap = known ? Math.max(0, Math.round((c.requiredLevel - c.currentLevel) * 100) / 100) : null;
            const fromEvidence = c.source && c.source.includes('quiz');
            return (
              <div key={c.competencyId} style={{ marginBottom: 18 }}>
                <div className="flex-between small" style={{ marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{c.name}</strong>
                  <span className="muted" style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>Current <strong>{c.currentLevel}%</strong></span>
                    {known && <><span>Required <strong>{c.requiredLevel}%</strong></span><span>Gap <strong>{gap}%</strong></span></>}
                    <span className={`badge ${CONFIDENCE_CLASS[c.confidence] || 'badge-slate'}`}>{c.confidence} confidence</span>
                    <span className="badge badge-outline">{fromEvidence ? 'Assessment evidence' : 'Profile estimate'}</span>
                  </span>
                </div>
                <ProgressBar value={c.currentLevel} required={known ? c.requiredLevel : null} color={levelColor(c.currentLevel, c.requiredLevel)} label={`${c.name}: current ${c.currentLevel} percent${known ? `, required ${c.requiredLevel} percent` : ''}`} />
              </div>
            );
          })
        )}
        {hasCompetencies && <p className="small muted" style={{ margin: 0 }}>The dark marker on each bar is the level required for your designation.</p>}
      </section>

      <div className="two-col">
        {/* Priority gaps */}
        <section className="card" aria-labelledby="gaps-heading">
          <h3 id="gaps-heading" className="card-title"><AlertTriangle size={18} aria-hidden="true" /> Priority Skill Gaps</h3>
          {skillGaps.length === 0 ? (
            <EmptyState icon={AlertTriangle}>
              {hasCompetencies ? 'No open skill gaps — your level meets the requirement for every mapped competency.' : 'No data available yet. Complete your profile or take the assessment first.'}
            </EmptyState>
          ) : (
            <>
              <div className="table-scroll">
                <table className="results-table" style={{ minWidth: 420 }}>
                  <thead><tr><th>Competency</th><th>Current</th><th>Required</th><th>Gap</th><th>Priority</th></tr></thead>
                  <tbody>
                    {skillGaps.map((g) => (
                      <tr key={g.competencyId}>
                        <td>{g.name}</td>
                        <td>{g.currentLevel}%</td>
                        <td>{g.requiredLevel}%</td>
                        <td>{g.gap}%</td>
                        <td><span className={`badge ${PRIORITY_CLASS[g.priority]}`}>{g.priority}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link to="/skill-gaps" className="btn-link small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
                All skill gaps <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </>
          )}
        </section>

        {/* Personalised recommendation */}
        <section className="card" aria-labelledby="rec-heading" style={{ background: 'linear-gradient(160deg, var(--indigo-900), var(--indigo-700))', color: '#fff' }}>
          <h3 id="rec-heading" className="card-title" style={{ color: '#fff' }}><Sparkles size={18} aria-hidden="true" /> Personalized Learning Recommendation</h3>
          {!topRecommendation ? (
            <>
              <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 18 }}>No recommendation yet. Recommendations appear once your skill gaps have been identified.</p>
              <Link to="/diagnostic-assessment" className="btn btn-teal">Start Competency Assessment</Link>
            </>
          ) : (
            <>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{topRecommendation.resource.title}</div>
              <div style={{ margin: '8px 0 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>{topRecommendation.resource.provider}</span>
                {topRecommendation.resource.integrationMode !== 'Live' && <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px dashed rgba(255,255,255,0.5)' }}>Prototype / Mock</span>}
              </div>
              <dl style={{ margin: '0 0 12px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 13.5, color: 'rgba(255,255,255,0.85)' }}>
                <dt style={{ opacity: 0.7 }}>Competency</dt><dd style={{ margin: 0 }}>{topRecommendation.competencyName}</dd>
                <dt style={{ opacity: 0.7 }}>Difficulty</dt><dd style={{ margin: 0 }}>{topRecommendation.resource.difficulty}</dd>
                <dt style={{ opacity: 0.7 }}>Duration</dt><dd style={{ margin: 0 }}>{topRecommendation.resource.duration || 'Not specified'}</dd>
                <dt style={{ opacity: 0.7 }}>Integration</dt><dd style={{ margin: 0 }}>{topRecommendation.resource.integrationMode}</dd>
              </dl>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.6)' }}>Why this is recommended</div>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13.5, margin: '0 0 16px' }}>{topRecommendation.reason}</p>
              <div className="flex-wrap">
                <Link to="/learning-path" className="btn btn-teal">Start Learning</Link>
                <OpenResourceLink resource={topRecommendation.resource} className="btn btn-sm" />
              </div>
            </>
          )}
        </section>
      </div>

      <div className="two-col">
        {/* Learning path */}
        <section className="card" aria-labelledby="path-heading">
          <h3 id="path-heading" className="card-title"><RouteIcon size={18} aria-hidden="true" /> My Learning Path</h3>
          {items.length === 0 ? (
            <EmptyState icon={RouteIcon}>No learning path yet. It is generated once skill gaps with matching learning resources exist.</EmptyState>
          ) : (
            <>
              <div className="flex-between small" style={{ marginBottom: 6 }}>
                <span className="muted">{completedSteps} of {pathTotal} steps completed</span>
                <strong>{learningPath.summary.overallProgress}%</strong>
              </div>
              <ProgressBar value={learningPath.summary.overallProgress} label={`Learning path progress ${learningPath.summary.overallProgress} percent`} />
              {currentStep && (
                <div className="notice notice-info" style={{ margin: '14px 0 8px' }}>
                  <PlayCircle size={18} aria-hidden="true" />
                  <div>
                    <strong>{currentStep.status === 'In Progress' ? 'Current step' : 'Next action'}: </strong>
                    Step {currentStep.sequence} — {currentStep.resource.title}
                    <div className="small muted">{currentStep.competencyName} · {currentStep.status === 'In Progress' ? `${currentStep.progressPercentage}% complete` : 'Ready to start'}</div>
                  </div>
                </div>
              )}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((item) => (
                  <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: item.status === 'Locked' ? 0.65 : 1 }}>
                    <StatusIcon status={item.status} />
                    <span className="small" style={{ flex: 1 }}>{item.resource.title}</span>
                    <span className="small muted">{item.status}</span>
                  </li>
                ))}
              </ul>
              <Link to="/learning-path" className="btn btn-secondary btn-auto" style={{ marginTop: 14 }}>Continue Learning</Link>
            </>
          )}
        </section>

        {/* Recent assessments */}
        <section className="card" aria-labelledby="recent-heading">
          <h3 id="recent-heading" className="card-title"><FileText size={18} aria-hidden="true" /> Recent Assessments</h3>
          {recentResults.length === 0 ? (
            <EmptyState icon={FileText} action={<Link to="/diagnostic-assessment" className="btn btn-primary btn-auto" style={{ marginTop: 10 }}>Take Your First Assessment</Link>}>
              No assessments completed yet.
            </EmptyState>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {recentResults.map((r) => (
                  <li key={r.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, overflowWrap: 'anywhere' }}>{r.quiz_title}</div>
                      <div className="small muted">{r.quiz_type === 'Diagnostic' ? 'Competency assessment' : 'Learning material quiz'} · {new Date(r.attempted_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex-wrap">
                      <span className={`badge ${Number(r.percentage) >= 70 ? 'badge-teal' : Number(r.percentage) >= 50 ? 'badge-amber' : 'badge-red'}`}>{r.score}/{r.total_questions} · {Number(r.percentage)}%</span>
                      <Link to={`/results/${r.id}`} className="btn-link small">View</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="card mb-20" aria-labelledby="actions-heading">
        <h3 id="actions-heading" className="card-title">Continue your journey</h3>
        <div className="flex-wrap">
          <Link to="/diagnostic-assessment" className="btn btn-primary btn-auto">Competency Assessment</Link>
          <Link to="/learning-path" className="btn btn-secondary">Continue Learning</Link>
          <Link to="/upload" className="btn btn-secondary">Upload Learning Material</Link>
          {currentLearningArea?.latestQuizId && <Link to={`/quiz/${currentLearningArea.latestQuizId}`} className="btn btn-secondary">Open Latest Quiz</Link>}
          <Link to="/skill-gaps" className="btn btn-secondary">Skill Gap Analysis</Link>
        </div>
      </section>

      <HowItWorks />
    </AppShell>
  );
}
