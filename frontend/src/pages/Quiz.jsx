// frontend/src/pages/Quiz.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchQuiz() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/quiz/${id}`);
      setQuiz(data.quiz);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this quiz.');
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(questionId, optionIndex) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  async function handleSubmit() {
    if (!quiz) return;
    const unanswered = quiz.questions.filter((q) => answers[q.id] === undefined);
    if (unanswered.length > 0) {
      setError('Please answer all questions before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/quiz/${id}/submit`, { answers });
      navigate(`/quiz/${id}/result`, { state: { result: data.result, quizTitle: quiz.title, documentName: quiz.original_filename } });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your quiz.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="content-area">
          <div className="page-loading">Loading quiz...</div>
        </main>
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <div className="app-shell">
        <Sidebar />
        <main className="content-area">
          <div className="form-error">{error}</div>
        </main>
      </div>
    );
  }

  const question = quiz.questions[current];
  const isLast = current === quiz.questions.length - 1;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <div className="page-header">
          <div>
            <h2>{quiz.title}</h2>
            <p>Based on: {quiz.original_filename}</p>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 680 }}>
          <div className="quiz-progress-label">
            Question {current + 1} of {quiz.questions.length}
          </div>

          <div className="question-dots">
            {quiz.questions.map((q, idx) => (
              <div
                key={q.id}
                className={`question-dot ${answers[q.id] !== undefined ? 'answered' : ''} ${
                  idx === current ? 'current' : ''
                }`}
              />
            ))}
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="quiz-question">{question.question}</div>

          <div className="option-list">
            {question.options.map((opt, idx) => (
              <div
                key={idx}
                className={`option-item ${answers[question.id] === idx ? 'selected' : ''}`}
                onClick={() => selectAnswer(question.id, idx)}
              >
                <div className="option-letter">{LETTERS[idx]}</div>
                <div>{opt}</div>
              </div>
            ))}
          </div>

          <div className="quiz-nav">
            <button
              className="btn btn-secondary"
              disabled={current === 0}
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            >
              Previous
            </button>

            {isLast ? (
              <button
                className="btn btn-primary"
                style={{ width: 'auto', padding: '11px 24px' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <span className="spinner" /> : 'Submit Quiz'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: 'auto', padding: '11px 24px' }}
                onClick={() => setCurrent((c) => Math.min(quiz.questions.length - 1, c + 1))}
              >
                Next
              </button>
            )}
          </div>

          <p style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
            {answeredCount} of {quiz.questions.length} questions answered
          </p>
        </div>
      </main>
    </div>
  );
}
