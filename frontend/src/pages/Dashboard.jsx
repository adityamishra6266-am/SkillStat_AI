// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Sparkles, BookOpen } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';

function performanceBadge(pct) {
  if (pct >= 90) return { label: 'Excellent', cls: 'badge-teal' };
  if (pct >= 70) return { label: 'Good', cls: 'badge-teal' };
  if (pct >= 50) return { label: 'Needs Practice', cls: 'badge-amber' };
  return { label: 'Needs Improvement', cls: 'badge-red' };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard');
      setDashboard(data.dashboard);
    } catch (err) {
      setError('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="content-area">
          <div className="page-loading">Loading your dashboard...</div>
        </main>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="content-area">
          <div className="form-error">{error || 'Something went wrong.'}</div>
        </main>
      </div>
    );
  }

  const { stats, currentLearningArea, recentResults, profileCompletion } = dashboard;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <div className="page-header">
          <div>
            <h2>Welcome, {user?.name?.split(' ')[0] || 'there'}</h2>
            <p>Here's where your learning stands today.</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--ink-500)' }}>Profile Completion</span>
              <strong>{profileCompletion}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${profileCompletion}%` }} />
            </div>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Documents Uploaded</div>
            <div className="stat-value">{stats.documentsUploaded}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Quizzes Attempted</div>
            <div className="stat-value">{stats.quizzesAttempted}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Average Score</div>
            <div className="stat-value">{stats.averageScore}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Latest Score</div>
            <div className="stat-value">{stats.latestScore}%</div>
          </div>
        </div>

        <div className="two-col">
          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={18} /> Current Learning Area
            </h3>
            {currentLearningArea.documentName ? (
              <>
                <p style={{ marginBottom: 4 }}>
                  <strong>Document:</strong> {currentLearningArea.documentName}
                </p>
                <p style={{ marginBottom: 4 }}>
                  <strong>Detected Topic:</strong> {currentLearningArea.topic || 'Not detected'}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>Skill Level:</strong> {currentLearningArea.skillLevel}
                </p>
              </>
            ) : (
              <p>You haven't uploaded a document yet. Upload one to generate your first quiz.</p>
            )}
          </div>

          <div className="card" style={{ background: 'linear-gradient(160deg, var(--indigo-900), var(--indigo-700))', color: '#fff' }}>
            <h3 style={{ color: '#fff', fontSize: 16, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} /> Your Personalized Quiz
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.78)', marginBottom: 18 }}>
              {currentLearningArea.latestQuizId
                ? 'Your most recent quiz is ready to take.'
                : 'Upload a document to generate a quiz tailored to you.'}
            </p>
            {currentLearningArea.latestQuizId ? (
              <button
                className="btn btn-teal"
                onClick={() => navigate(`/quiz/${currentLearningArea.latestQuizId}`)}
              >
                Start Quiz
              </button>
            ) : (
              <Link to="/upload" className="btn btn-teal" style={{ display: 'inline-flex' }}>
                Upload Document
              </Link>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} /> Recent Results
          </h3>
          {recentResults.length === 0 ? (
            <div className="empty-state">
              <div className="icon-circle">📊</div>
              <p>No quiz attempts yet. Your results will show up here once you take a quiz.</p>
            </div>
          ) : (
            <table className="results-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentResults.map((r) => {
                  const badge = performanceBadge(Number(r.percentage));
                  return (
                    <tr key={r.id}>
                      <td>{r.quiz_title}</td>
                      <td>
                        {r.score}/{r.total_questions}
                      </td>
                      <td>
                        <span className={`badge ${badge.cls}`}>{r.percentage}%</span>
                      </td>
                      <td>{new Date(r.attempted_at).toLocaleDateString()}</td>
                      <td>
                        <Link to={`/results/${r.id}`}>View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
