// frontend/src/pages/Result.jsx
// Assessment result. Always loaded from the database (GET /api/results/:id),
// so a refresh shows exactly the same page. Two clearly separate blocks:
//   1. "Quiz performance"  - the score on this quiz (always shown)
//   2. "Competency impact" - before/after competency evidence (ONLY when the
//      quiz was actually mapped to a competency; otherwise an honest note).
import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Info, ArrowRight, TrendingUp, MinusCircle } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { LoadingSkeleton, ErrorState, apiErrorMessage } from '../components/PageState.jsx';
import { AdaptiveLoopStrip } from '../components/AdaptiveLoop.jsx';
import { OpenResourceLink } from '../components/ProviderInfo.jsx';
import api from '../services/api';

const PRIORITY_CLASS = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-indigo', Low: 'badge-teal' };
const GAP_CLASS = { 'Gap closed': 'badge-teal', 'Requirement met': 'badge-teal', 'Gap reduced': 'badge-teal', 'Gap unchanged': 'badge-slate', 'Gap increased': 'badge-amber' };

function scoreBadge(pct) {
  if (pct >= 70) return 'badge-teal';
  if (pct >= 50) return 'badge-amber';
  return 'badge-red';
}

function Cell({ k, v, highlight }) {
  return (
    <div className={`impact-cell ${highlight ? 'is-highlight' : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function ChangeItem({ done, children }) {
  return (
    <li className={done ? '' : 'not-done'}>
      {done ? <CheckCircle2 size={17} color="#0f8a68" aria-hidden="true" /> : <MinusCircle size={17} color="#9aa1bd" aria-hidden="true" />}
      <span>{children}{done ? '' : ' (not run)'}</span>
    </li>
  );
}

export default function Result() {
  const { id, attemptId } = useParams();
  const location = useLocation();
  const effectiveAttemptId = attemptId || id;

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveAttemptId]);

  async function fetchResult() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/results/${effectiveAttemptId}`);
      setResult(data.result);
    } catch (err) {
      // Navigation state from a just-submitted quiz is a usable fallback.
      if (location.state?.result) setResult(location.state.result);
      else setError(apiErrorMessage(err, 'Could not load this result.'));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <AppShell><LoadingSkeleton label="Loading result…" blocks={2} /></AppShell>;
  if (error || !result) {
    return (
      <AppShell>
        <ErrorState message={error || 'Result not found.'} onRetry={fetchResult} />
      </AppShell>
    );
  }

  const pct = Number(result.percentage);
  const isDiagnostic = result.assessmentType === 'Diagnostic';
  const impact = result.competencyImpact || [];
  const update = result.adaptiveUpdate; // null for attempts made before this was recorded
  const provenance = result.provenance;
  const quizTitle = result.quizTitle || location.state?.quizTitle || 'Your assessment';
  const hasImpact = impact.length > 0;
  const mappedCount = provenance?.mapping?.mappedQuestions ?? 0;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h2>{isDiagnostic ? 'Competency Assessment Result' : 'Assessment Result'}</h2>
          <p>{quizTitle}</p>
        </div>
        {provenance && <span className="mode-note">Assessment mode: {provenance.generationModeLabel}</span>}
      </div>

      <AdaptiveLoopStrip active="Reassess" />

      {/* 1 - quiz performance */}
      <section className="card mb-24" aria-labelledby="perf-heading">
        <h3 id="perf-heading" className="card-title">Quiz performance</h3>
        <div className="flex-wrap" style={{ gap: 28 }}>
          <div className="score-ring" style={{ '--pct': pct }} role="img" aria-label={`Score ${pct} percent`}>{pct}%</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--indigo-900)' }}>
              {result.score} / {result.total}
            </div>
            <span className={`badge ${scoreBadge(pct)}`} style={{ marginTop: 6 }}>{result.performance}</span>
            {!isDiagnostic && (
              <p className="small muted" style={{ margin: '10px 0 0', maxWidth: 420 }}>
                This measures how well you understood this document. It changes your competency profile only if the questions were mapped to a competency (see below).
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2 - competency impact */}
      <section className="mb-24" aria-labelledby="impact-heading">
        <h3 id="impact-heading" style={{ marginBottom: 12 }}>Competency impact</h3>

        {!hasImpact ? (
          <div className="notice notice-info" role="note">
            <Info size={18} aria-hidden="true" />
            <div>
              {!isDiagnostic && mappedCount === 0 ? (
                <strong>This learning material was assessed for comprehension but was not mapped to a competency.</strong>
              ) : update && update.applicable && update.unapplied?.length > 0 ? (
                <strong>The competencies covered by this quiz have no requirement for your designation, so your competency profile did not change.</strong>
              ) : (
                <strong>No competency evidence was recorded for this attempt.</strong>
              )}
              <div className="small" style={{ marginTop: 4 }}>
                Your competency scores, skill gaps and learning path are unchanged by this quiz. Materials on topics such as sampling, data quality, statistical methods or visualization are mapped automatically when the questions clearly match a competency in the framework.
              </div>
            </div>
          </div>
        ) : (
          <>
            {impact.map((ci) => (
              <div className="card" key={ci.competencyId} style={{ marginBottom: 14 }}>
                <div className="flex-between">
                  <strong style={{ fontSize: 16 }}>{ci.competencyName}</strong>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {ci.gapStatus && <span className={`badge ${GAP_CLASS[ci.gapStatus] || 'badge-slate'}`}>{ci.gapStatus}</span>}
                    {ci.previousPriority && ci.newPriority && (
                      <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Priority
                        <span className={`badge ${PRIORITY_CLASS[ci.previousPriority]}`}>{ci.previousPriority}</span>
                        <ArrowRight size={13} aria-hidden="true" />
                        <span className={`badge ${PRIORITY_CLASS[ci.newPriority]}`}>{ci.newPriority}</span>
                      </span>
                    )}
                  </span>
                </div>

                <div className="impact-grid">
                  <Cell k="Previous level" v={`${ci.previousScore}%`} />
                  <Cell k="Quiz evidence" v={`${ci.quizEvidence}%`} />
                  <Cell k="New level" v={`${ci.newScore}%`} highlight={ci.newScore > ci.previousScore} />
                  <Cell k="Required level" v={ci.requiredLevel !== null ? `${ci.requiredLevel}%` : 'Not set'} />
                  {ci.previousGap !== null && <Cell k="Gap before" v={`${ci.previousGap}%`} />}
                  {ci.newGap !== null && <Cell k="Gap after" v={`${ci.newGap}%`} highlight={ci.newGap < ci.previousGap} />}
                </div>

                <div className="small muted" style={{ marginBottom: 6 }}>Previous level</div>
                <ProgressBar value={ci.previousScore} required={ci.requiredLevel} label={`${ci.competencyName} previous level ${ci.previousScore} percent`} color="#b9bdf0" />
                <div className="small muted" style={{ margin: '12px 0 6px' }}>New level (required level marked)</div>
                <ProgressBar value={ci.newScore} required={ci.requiredLevel} label={`${ci.competencyName} new level ${ci.newScore} percent`} />

                <p className="small muted" style={{ margin: '12px 0 0' }}>
                  Based on {ci.evidenceQuestions} question{ci.evidenceQuestions === 1 ? '' : 's'} mapped to this competency
                  {ci.mappingConfidence !== null && !isDiagnostic ? ` (mapping confidence ${Math.round(ci.mappingConfidence * 100)}%)` : ''}.
                  {!isDiagnostic && ' A single document quiz carries limited weight, so the level moves gradually.'}
                </p>
                {ci.previousRecommendation !== ci.newRecommendation && ci.newRecommendation && (
                  <p className="small" style={{ margin: '8px 0 0' }}>
                    <TrendingUp size={14} style={{ verticalAlign: -2 }} aria-hidden="true" /> Recommended learning changed from “{ci.previousRecommendation || 'none'}” to “{ci.newRecommendation}”.
                  </p>
                )}
              </div>
            ))}

            {isDiagnostic && (
              <div className="two-col" style={{ marginBottom: 0 }}>
                <div className="card">
                  <h4 style={{ fontSize: 15 }}>Strengths</h4>
                  {impact.filter((c) => c.newGap === 0).length === 0 ? (
                    <p className="small muted">No assessed competency meets the required level yet.</p>
                  ) : (
                    impact.filter((c) => c.newGap === 0).map((c) => <div key={c.competencyId} className="small" style={{ marginBottom: 6 }}>✓ {c.competencyName} ({c.newScore}%)</div>)
                  )}
                </div>
                <div className="card">
                  <h4 style={{ fontSize: 15 }}>Priority development areas</h4>
                  {impact.filter((c) => c.newGap > 0).length === 0 ? (
                    <p className="small muted">No open gaps among the assessed competencies.</p>
                  ) : (
                    impact.filter((c) => c.newGap > 0).sort((a, b) => b.newGap - a.newGap).map((c) => (
                      <div key={c.competencyId} className="small" style={{ marginBottom: 6 }}>⚠ {c.competencyName}: {c.newScore}% of {c.requiredLevel}% required (gap {c.newGap}%)</div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* 3 - what changed (only what actually ran) */}
      {update && update.applicable && (
        <section className="card mb-24" aria-labelledby="changed-heading">
          <h3 id="changed-heading" className="card-title">What changed?</h3>
          <ul className="change-list">
            <ChangeItem done={update.competencyUpdated}>Competency score updated</ChangeItem>
            <ChangeItem done={update.gapsRecalculated}>Skill gap recalculated</ChangeItem>
            <ChangeItem done={update.recommendationsRefreshed}>Recommendations refreshed</ChangeItem>
            <ChangeItem done={update.learningPathUpdated}>Learning path updated</ChangeItem>
          </ul>
          {update.unapplied?.length > 0 && (
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              {update.unapplied.map((u) => `${u.name}: ${u.reason}`).join(' ')}
            </p>
          )}
        </section>
      )}

      {/* 4 - next step */}
      {result.nextStep && (
        <section className="card mb-24" aria-labelledby="next-heading">
          <h3 id="next-heading" className="card-title">Recommended next step</h3>
          <div className="flex-between">
            <div>
              <strong>{result.nextStep.title}</strong>
              <div className="small muted" style={{ marginTop: 4 }}>
                {result.nextStep.competencyName} · {result.nextStep.difficulty}
                {result.nextStep.duration ? ` · ${result.nextStep.duration}` : ''} · {result.nextStep.provider}
                {result.nextStep.integrationMode !== 'Live' && <> · <span className="badge badge-proto">Prototype / Mock</span></>}
              </div>
            </div>
            <div className="flex-wrap">
              <OpenResourceLink resource={{ url: result.nextStep.url }} />
              <Link to="/learning-path" className="btn btn-primary btn-auto">Continue Learning</Link>
            </div>
          </div>
        </section>
      )}

      {/* 5 - question review */}
      <h3 style={{ marginBottom: 14 }}>Question review</h3>
      {result.breakdown.map((item, idx) => (
        <div className="breakdown-item" key={item.questionId}>
          <div className="breakdown-q">
            {idx + 1}. {item.question}{' '}
            <span className={`badge ${item.isCorrect ? 'badge-teal' : 'badge-red'}`} style={{ marginLeft: 6 }}>{item.isCorrect ? 'Correct' : 'Incorrect'}</span>
          </div>
          {item.options.map((opt, optIdx) => {
            let cls = 'option-item';
            if (optIdx === item.correctAnswer) cls += ' correct';
            else if (optIdx === item.userAnswer && !item.isCorrect) cls += ' incorrect';
            return (
              <div className={cls} key={optIdx} style={{ cursor: 'default', marginBottom: 8 }}>
                <div className="option-letter">{String.fromCharCode(65 + optIdx)}</div>
                <div style={{ flex: 1 }}>{opt}</div>
                {optIdx === item.correctAnswer && <><CheckCircle2 size={18} color="var(--teal-600)" aria-hidden="true" /><span className="sr-only">Correct answer</span></>}
                {optIdx === item.userAnswer && !item.isCorrect && <><XCircle size={18} color="var(--red-600)" aria-hidden="true" /><span className="sr-only">Your answer</span></>}
              </div>
            );
          })}
          <div className="explanation"><strong>Explanation:</strong> {item.explanation}</div>
        </div>
      ))}

      <div className="flex-wrap" style={{ marginTop: 20 }}>
        <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
        <Link to="/upload" className="btn btn-primary btn-auto">Upload Learning Material</Link>
      </div>
    </AppShell>
  );
}
