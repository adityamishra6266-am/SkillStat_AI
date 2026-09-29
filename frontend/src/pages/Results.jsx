// frontend/src/pages/Results.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell.jsx';
import api from '../services/api';

function badgeClass(pct) {
  if (pct >= 70) return 'badge-teal';
  if (pct >= 50) return 'badge-amber';
  return 'badge-red';
}

export default function Results() {
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchResults();
  }, []);

  async function fetchResults() {
    setLoading(true);
    try {
      const { data } = await api.get('/results');
      setResults(data.results);
      setStats(data.stats);
    } catch (err) {
      setError('Could not load your results.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
        <div className="page-header">
          <div>
            <h2>Assessment Results</h2>
            <p>A full history of every quiz you've attempted.</p>
          </div>
        </div>

        {loading ? (
          <div className="page-loading" role="status">Loading results…</div>
        ) : error ? (
          <div className="form-error" role="alert">{error}{' '}<button type="button" className="btn-link" onClick={fetchResults}>Retry</button></div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Quizzes Attempted</div>
                <div className="stat-value">{stats.totalAttempts}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Average Score</div>
                <div className="stat-value">{stats.averageScore}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Highest Score</div>
                <div className="stat-value">{stats.highestScore}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Latest Score</div>
                <div className="stat-value">{stats.latestScore}%</div>
              </div>
            </div>

            <div className="card">
              {results.length === 0 ? (
                <div className="empty-state">
                  <div className="icon-circle">📄</div>
                  <p>You haven't attempted any quizzes yet.</p>
                  <Link to="/upload" className="btn btn-primary" style={{ width: 'auto', marginTop: 14, display: 'inline-flex' }}>
                    Upload a Document
                  </Link>
                </div>
              ) : (
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Quiz</th>
                      <th>Document</th>
                      <th>Score</th>
                      <th>Percentage</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id}>
                        <td>{r.quiz_title}</td>
                        <td>{r.quiz_type === 'Diagnostic' ? <span className="badge badge-indigo">Diagnostic</span> : r.document_name}</td>
                        <td>
                          {r.score}/{r.total_questions}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass(Number(r.percentage))}`}>{r.percentage}%</span>
                        </td>
                        <td>{new Date(r.attempted_at).toLocaleDateString()}</td>
                        <td>
                          <Link to={`/results/${r.id}`}>View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </AppShell>
  );
}
