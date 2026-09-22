// frontend/src/pages/Result.jsx
// Handles two entry points:
//  1) Right after submitting a quiz: /quiz/:id/result  (result passed via navigation state)
//  2) Viewing a past attempt later: /results/:attemptId (fetched from the API)

import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api';

function performanceBadgeClass(pct) {
  if (pct >= 90) return 'badge-teal';
  if (pct >= 70) return 'badge-teal';
  if (pct >= 50) return 'badge-amber';
  return 'badge-red';
}

export default function Result() {
  const { id, attemptId } = useParams();
  const location = useLocation();

  const [result, setResult] = useState(location.state?.result || null);
  const [meta, setMeta] = useState({
    quizTitle: location.state?.quizTitle || '',
    documentName: location.state?.documentName || '',
  });
  const [loading, setLoading] = useState(!location.state?.result);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!location.state?.result && attemptId) {
      fetchResult();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function fetchResult() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/results/${attemptId}`);
      setResult(data.result);
      setMeta({ quizTitle: data.result.quizTitle, documentName: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this result.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="content-area">
          <div className="page-loading">Loading result...</div>
        </main>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="content-area">
          <div className="form-error">{error || 'Result not found.'}</div>
        </main>
      </div>
    );
  }

  const pct = Number(result.percentage);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <div className="page-header">
          <div>
            <h2>Quiz Result</h2>
            <p>{meta.quizTitle || 'Your quiz performance'}</p>
          </div>
        </div>

        <div className="card score-hero" style={{ maxWidth: 460, marginBottom: 24 }}>
          <div className="score-ring" style={{ '--pct': pct }}>
            {pct}%
          </div>
          <h3 style={{ marginBottom: 6 }}>
            Score: {result.score}/{result.total}
          </h3>
          <span className={`badge ${performanceBadgeClass(pct)}`}>{result.performance}</span>
        </div>

        <h3 style={{ marginBottom: 14 }}>Question Breakdown</h3>
        {result.breakdown.map((item, idx) => (
          <div className="breakdown-item" key={item.questionId}>
            <div className="breakdown-q">
              {idx + 1}. {item.question}
            </div>
            {item.options.map((opt, optIdx) => {
              let cls = 'option-item';
              if (optIdx === item.correctAnswer) cls += ' correct';
              else if (optIdx === item.userAnswer && !item.isCorrect) cls += ' incorrect';
              return (
                <div className={cls} key={optIdx} style={{ cursor: 'default', marginBottom: 8 }}>
                  <div className="option-letter">{String.fromCharCode(65 + optIdx)}</div>
                  <div style={{ flex: 1 }}>{opt}</div>
                  {optIdx === item.correctAnswer && <CheckCircle2 size={18} color="var(--teal-600)" />}
                  {optIdx === item.userAnswer && !item.isCorrect && <XCircle size={18} color="var(--red-600)" />}
                </div>
              );
            })}
            <div className="explanation">
              <strong>Explanation:</strong> {item.explanation}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Link to="/dashboard" className="btn btn-secondary">
            Back to Dashboard
          </Link>
          <Link to="/upload" className="btn btn-primary" style={{ width: 'auto' }}>
            Upload Another Document
          </Link>
        </div>
      </main>
    </div>
  );
}
