// frontend/src/pages/MyQuizzes.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api';

const TYPE_LABEL = { pdf: 'PDF', docx: 'DOCX', pptx: 'PPTX', txt: 'TXT' };

export default function MyQuizzes() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const { data } = await api.get('/documents');
      setDocuments(data.documents);
    } catch (err) {
      setError('Could not load your documents.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <div className="page-header">
          <div>
            <h2>My Quizzes</h2>
            <p>Every document you've uploaded, and the quiz generated from it.</p>
          </div>
          <Link to="/upload" className="btn btn-primary" style={{ width: 'auto' }}>
            Upload New Document
          </Link>
        </div>

        {loading ? (
          <div className="page-loading">Loading your quizzes...</div>
        ) : error ? (
          <div className="form-error">{error}</div>
        ) : documents.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon-circle">📚</div>
              <p>No documents uploaded yet. Upload one to generate your first quiz.</p>
              <Link to="/upload" className="btn btn-primary" style={{ width: 'auto', marginTop: 14, display: 'inline-flex' }}>
                Upload a Document
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {documents.map((doc) => (
              <div className="card" key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'var(--indigo-100)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileText size={20} color="var(--indigo-600)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{doc.original_filename}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                      <span className="file-type-pill">{TYPE_LABEL[doc.file_type] || doc.file_type}</span>
                      Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                      {doc.attempt_count > 0 ? ` · Attempted ${doc.attempt_count} time(s)` : ' · Not attempted yet'}
                    </div>
                  </div>
                </div>
                {doc.quiz_id ? (
                  <button className="btn btn-teal" onClick={() => navigate(`/quiz/${doc.quiz_id}`)}>
                    {doc.attempt_count > 0 ? 'Retake Quiz' : 'Start Quiz'}
                  </button>
                ) : (
                  <span className="badge badge-amber">No quiz generated</span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
