// frontend/src/pages/Upload.jsx
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, X } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api';

const ALLOWED_EXT = ['.pdf', '.docx', '.pptx', '.txt'];
const MAX_SIZE_MB = 10;

export default function Upload() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  function validateAndSetFile(f) {
    setError('');
    if (!f) return;
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setError('Invalid file type. Only PDF, DOCX, PPTX and TXT files are allowed.');
      return;
    }
    if (f.size === 0) {
      setError('This file is empty.');
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum allowed size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    setFile(f);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  }

  async function handleUpload() {
    if (!file) return;
    setProcessing(true);
    setError('');
    setProcessingStep('Uploading document...');

    const formData = new FormData();
    formData.append('document', file);

    try {
      setTimeout(() => setProcessingStep('Extracting text...'), 800);
      setTimeout(() => setProcessingStep('Analyzing content and generating your quiz...'), 2200);

      const { data } = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      navigate(`/quiz/${data.quizId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong while processing your document.');
      setProcessing(false);
      setProcessingStep('');
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <div className="page-header">
          <div>
            <h2>Upload a Document</h2>
            <p>Upload a document and we'll generate a 5-question quiz tailored to your profile.</p>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 620 }}>
          {error && <div className="form-error">{error}</div>}

          {!processing ? (
            <>
              <div
                className={`dropzone ${dragging ? 'dragging' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt"
                  onChange={(e) => validateAndSetFile(e.target.files?.[0])}
                />
                {file ? (
                  <div>
                    <FileText size={32} color="var(--indigo-600)" />
                    <p style={{ marginTop: 12, fontWeight: 600, color: 'var(--ink-900)' }}>{file.name}</p>
                    <p style={{ fontSize: 13 }}>{(file.size / 1024).toFixed(0)} KB</p>
                    <button
                      className="btn btn-secondary"
                      style={{ marginTop: 8 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                    >
                      <X size={15} /> Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <UploadCloud size={34} color="var(--indigo-500)" />
                    <p style={{ marginTop: 12, fontWeight: 600, color: 'var(--ink-900)' }}>
                      Drag & drop your file here, or click to browse
                    </p>
                    <p style={{ fontSize: 13, marginTop: 6 }}>Maximum size {MAX_SIZE_MB}MB</p>
                    <div style={{ marginTop: 14 }}>
                      <span className="file-type-pill">PDF</span>
                      <span className="file-type-pill">DOCX</span>
                      <span className="file-type-pill">PPTX</span>
                      <span className="file-type-pill">TXT</span>
                    </div>
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                style={{ marginTop: 20 }}
                disabled={!file}
                onClick={handleUpload}
              >
                Upload & Generate Quiz
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <span className="spinner" style={{ borderTopColor: 'var(--indigo-600)', borderColor: 'var(--indigo-100)', width: 34, height: 34, margin: '0 auto 20px auto', display: 'block' }} />
              <p style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{processingStep}</p>
              <p style={{ fontSize: 13 }}>This usually takes a few seconds.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
