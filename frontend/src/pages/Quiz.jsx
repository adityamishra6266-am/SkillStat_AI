// frontend/src/pages/Quiz.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { LoadingSkeleton, ErrorState, apiErrorMessage } from '../components/PageState.jsx';
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
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchQuiz() {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get(`/quiz/${id}`);
      setQuiz(data.quiz);
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Could not load this quiz.'));
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(questionId, optionIndex) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  async function handleSubmit() {
    if (!quiz) return;
    if (quiz.questions.some((q) => answers[q.id] === undefined)) {
      setError('Please answer all questions before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/quiz/${id}/submit`, { answers });
      navigate(`/results/${data.result.id}`, { state: { result: data.result, quizTitle: quiz.title } });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not submit your quiz.'));
      setSubmitting(false);
    }
  }

  if (loading) return <AppShell><LoadingSkeleton label="Loading assessment…" blocks={1} /></AppShell>;
  if (loadError || !quiz) return <AppShell><ErrorState message={loadError} onRetry={fetchQuiz} /></AppShell>;

  const question = quiz.questions[current];
  const isLast = current === quiz.questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const isDiagnostic = quiz.quiz_type === 'Diagnostic';
  const prov = quiz.provenance;
  const mapping = prov?.mapping;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h2>{quiz.title}</h2>
          <p>{isDiagnostic ? 'Competency assessment' : `Based on: ${quiz.original_filename}`}</p>
        </div>
        {prov && <span className="mode-note">Assessment mode: {prov.generationModeLabel}</span>}
      </div>

      {!isDiagnostic && mapping && (
        <div className={`notice ${mapping.mappedQuestions > 0 ? 'notice-info' : ''}`} style={{ maxWidth: 680 }} role="note">
          <Info size={18} aria-hidden="true" />
          <div>
            {mapping.mappedQuestions > 0 ? (
              <>{mapping.mappedQuestions} of {mapping.totalQuestions} questions are mapped to <strong>{mapping.competencies.map((c) => c.name).join(', ')}</strong> and will count as competency evidence.</>
            ) : (
              <>This learning material will be assessed for comprehension only — it was not mapped to a competency, so your competency profile will not change.</>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 680 }}>
        <div className="quiz-progress-label" aria-live="polite">Question {current + 1} of {quiz.questions.length}</div>

        <div className="question-dots" aria-hidden="true">
          {quiz.questions.map((q, idx) => (
            <div key={q.id} className={`question-dot ${answers[q.id] !== undefined ? 'answered' : ''} ${idx === current ? 'current' : ''}`} />
          ))}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="quiz-question">{question.question}</legend>
          <div className="option-list" role="radiogroup" aria-label="Answer options">
            {question.options.map((opt, idx) => {
              const selected = answers[question.id] === idx;
              return (
                <div
                  key={idx}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  className={`option-item ${selected ? 'selected' : ''}`}
                  onClick={() => selectAnswer(question.id, idx)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      selectAnswer(question.id, idx);
                    }
                  }}
                >
                  <div className="option-letter" aria-hidden="true">{LETTERS[idx]}</div>
                  <div>{opt}</div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="quiz-nav">
          <button type="button" className="btn btn-secondary" disabled={current === 0} onClick={() => setCurrent((c) => Math.max(0, c - 1))}>
            Previous
          </button>
          {isLast ? (
            <button type="button" className="btn btn-primary btn-auto" style={{ padding: '11px 24px' }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><span className="spinner" aria-hidden="true" /> Submitting…</> : 'Submit'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-auto" style={{ padding: '11px 24px' }} onClick={() => setCurrent((c) => Math.min(quiz.questions.length - 1, c + 1))}>
              Next
            </button>
          )}
        </div>

        <p className="small muted" style={{ marginTop: 16, textAlign: 'center' }}>
          {answeredCount} of {quiz.questions.length} questions answered
        </p>
      </div>
    </AppShell>
  );
}
