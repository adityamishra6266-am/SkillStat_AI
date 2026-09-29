// frontend/src/pages/Upload.jsx
// Learning-material upload. The two backend steps are real, so the progress
// text reflects what is actually happening - there is no fake percentage:
//   1. Uploading & extracting text      (POST /documents/upload)
//   2. Generating personalised quiz     (POST /documents/:id/generate-quiz)
//   3. Preparing assessment             (competency mapping is part of step 2, then we open the quiz)
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, X, Check, Circle } from 'lucide-react';
import AppShell from '../components/AppShell.jsx';
import { apiErrorMessage } from '../components/PageState.jsx';
import api from '../services/api';

const ALLOWED_EXT = ['.pdf', '.docx', '.pptx', '.txt'];
const MAX_SIZE_MB = 10;
const STEPS = ['Uploading document', 'Extracting text', 'Generating personalized quiz', 'Preparing assessment'];

export default function Upload() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(-1); // -1 = idle
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const processing = step >= 0;

  function validateAndSetFile(f) {
    setError('');
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return setError('Invalid file type. Only PDF, DOCX, PPTX and TXT files are allowed.');
    if (f.size === 0) return setError('This file is empty.');
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return setError(`File is too large. Maximum allowed size is ${MAX_SIZE_MB}MB.`);
    setFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  }

  async function handleUpload() {
    if (!file) return;
    setError('');
    setStep(0);
    const formData = new FormData();
    formData.append('document', file);

    try {
      // Steps 0-1 happen inside one request (the server saves the file, then
      // asks the AI service to extract its text) - show "Uploading" while it
      // is in flight and "Extracting" only once the upload itself completed.
      const { data: up } = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && e.loaded >= e.total) setStep(1);
        },
      });
      setStep(2);
      const { data: gen } = await api.post(`/documents/${up.document.id}/generate-quiz`);
      setStep(3);
      navigate(`/quiz/${gen.quizId}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Something went wrong while processing your document.'));
      setStep(-1);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h2>Upload Learning Material</h2>
          <p>Upload a document you have studied. A short quiz is generated from it and, when the questions match a competency, the result is recorded as assessment evidence.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        {error && <div className="form-error" role="alert">{error}</div>}

        {!processing ? (
          <>
            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              role="button"
              tabIndex={0}
              aria-label="Choose a document to upload, or drag and drop it here"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input ref={inputRef} type="file" accept=".pdf,.docx,.pptx,.txt" aria-label="Document file" onChange={(e) => validateAndSetFile(e.target.files?.[0])} />
              {file ? (
                <div>
                  <FileText size={32} color="var(--indigo-600)" aria-hidden="true" />
                  <p style={{ marginTop: 12, fontWeight: 600, color: 'var(--ink-900)', wordBreak: 'break-word' }}>{file.name}</p>
                  <p className="small">{(file.size / 1024).toFixed(0)} KB</p>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <X size={15} aria-hidden="true" /> Remove
                  </button>
                </div>
              ) : (
                <div>
                  <UploadCloud size={34} color="var(--indigo-500)" aria-hidden="true" />
                  <p style={{ marginTop: 12, fontWeight: 600, color: 'var(--ink-900)' }}>Drag & drop your file here, or click to browse</p>
                  <p className="small" style={{ marginTop: 6 }}>Maximum size {MAX_SIZE_MB}MB</p>
                  <div style={{ marginTop: 14 }}>
                    {['PDF', 'DOCX', 'PPTX', 'TXT'].map((t) => <span className="file-type-pill" key={t}>{t}</span>)}
                  </div>
                </div>
              )}
            </div>

            <button type="button" className="btn btn-primary" style={{ marginTop: 20 }} disabled={!file} onClick={handleUpload}>
              Upload & Generate Quiz
            </button>
          </>
        ) : (
          <div role="status" aria-live="polite" style={{ padding: '10px 6px' }}>
            <p style={{ fontWeight: 600, color: 'var(--ink-900)', marginBottom: 16 }}>Processing {file?.name}</p>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {STEPS.map((label, i) => (
                <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, color: i > step ? 'var(--ink-300)' : 'var(--ink-900)', fontWeight: i === step ? 600 : 400 }}>
                  {i < step ? <Check size={18} color="#0f8a68" aria-hidden="true" /> : i === step ? <span className="spinner" style={{ borderTopColor: 'var(--indigo-600)', borderColor: 'var(--indigo-100)', width: 18, height: 18 }} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                  {label}{i === step ? '…' : ''}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </AppShell>
  );
}
