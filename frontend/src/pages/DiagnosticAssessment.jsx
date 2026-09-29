// frontend/src/pages/DiagnosticAssessment.jsx
// Competency Assessment entry point. Explains why the assessment is relevant to
// the official's role and states honestly how it will be produced (curated
// competency bank, or AI-assisted when an LLM tops up gaps in the bank), then
// hands off to the shared /quiz/:id flow.

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardCheck, Clock, Sparkles, History, AlertCircle } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import api from '../services/api';

export default function DiagnosticAssessment() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    setError('');
    try {
      const [statusRes, historyRes] = await Promise.all([
        api.get('/diagnostic/status'),
        api.get('/diagnostic/history'),
      ]);
      setStatus(statusRes.data);
      setHistory(historyRes.data.attempts || []);
    } catch (err) {
      setError('Could not check your diagnostic assessment eligibility right now.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    setError('');
    try {
      const { data } = await api.post('/diagnostic/start');
      navigate(`/quiz/${data.quizId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start the diagnostic assessment.');
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
          <div className="page-loading" role="status">Checking your assessment eligibility…</div>
        </AppShell>
    );
  }

  return (
    <AppShell>
        <div className="page-header">
          <div>
            <h2>Competency Assessment</h2>
            <p>A short assessment to establish or refresh your official competency profile.</p>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 16 }} role="alert">{error} <button type="button" className="btn-link" onClick={fetchStatus}>Retry</button></div>}

        <div className="card" style={{ maxWidth: 640, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div className="icon-circle" style={{ width: 48, height: 48 }}>
              <ClipboardCheck size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0 }}>
                {status?.hasTakenBefore ? 'Take Another Competency Assessment' : 'Start Competency Assessment'}
              </h3>
              {status?.canStart && (
                <div style={{ fontSize: 13, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Clock size={14} />
                  Estimated time: {status.estimatedMinutes.min}–{status.estimatedMinutes.max} minutes
                </div>
              )}
            </div>
          </div>

          {!status?.canStart ? (
            <div className="empty-state">
              <div className="icon-circle"><AlertCircle size={24} /></div>
              <p>{status?.message}</p>
              {status?.reason === 'NO_DESIGNATION' && (
                <Link to="/profile" className="btn btn-primary" style={{ width: 'auto', marginTop: 10, display: 'inline-flex' }}>
                  Complete Profile
                </Link>
              )}
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--ink-500)', marginBottom: 16 }}>
                {status.hasEvidence
                  ? `This will add fresh evidence to your existing competency profile for ${status.designation} — your current scores won't simply be replaced, they'll be updated using the same evidence-based model as every quiz you take.`
                  : `Your competency profile for ${status.designation} is currently based only on your profile details. Taking this assessment will replace that rough estimate with real, evidence-based scores.`}
              </p>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} aria-hidden="true" /> Assessment is built from
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                  <li>Your designation ({status.designation})</li>
                  <li>Competency requirements configured for your role</li>
                  <li>A competency-tagged question bank, mixed across difficulty levels</li>
                  <li>Assessment mode: <strong>{status.assessmentModeLabel}</strong></li>
                </ul>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                  Competencies this assessment covers
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {status.relevantCompetencies.map((name) => (
                    <span key={name} className="badge badge-indigo">{name}</span>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 20 }}>
                This assessment estimates your competency level — it does not claim to know your exact ability.
                Results feed directly into your skill gap analysis and learning recommendations.
              </p>

              <button className="btn btn-primary" style={{ width: 'auto', padding: '11px 28px' }} onClick={handleStart} disabled={starting}>
                {starting ? <span className="spinner" /> : status.hasTakenBefore ? 'Start New Assessment' : 'Start Assessment'}
              </button>
            </>
          )}
        </div>

        {history.length > 0 && (
          <div className="card" style={{ maxWidth: 640 }}>
            <h3 style={{ fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={18} /> Assessment History
            </h3>
            {history.map((h) => (
              <div
                key={h.attemptId}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{h.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                    {new Date(h.attemptedAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="badge badge-teal">{h.percentage}%</span>
                  <Link to={`/results/${h.attemptId}`} className="btn-link" style={{ fontSize: 13 }}>
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </AppShell>
  );
}
