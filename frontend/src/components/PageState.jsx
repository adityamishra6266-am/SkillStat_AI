// frontend/src/components/PageState.jsx
// Shared loading / error / empty states so every page behaves the same way.
import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

export function LoadingSkeleton({ label = 'Loading…', blocks = 3 }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skeleton skeleton-line" style={{ width: '38%', height: 26, marginBottom: 22 }} />
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="stat-card" key={i}>
            <div className="skeleton skeleton-line" style={{ width: '60%' }} />
            <div className="skeleton skeleton-line" style={{ width: '40%', height: 26, marginBottom: 0 }} />
          </div>
        ))}
      </div>
      {Array.from({ length: blocks }).map((_, i) => (
        <div className="card mb-20" key={i}>
          <div className="skeleton skeleton-line" style={{ width: '30%' }} />
          <div className="skeleton skeleton-block" />
        </div>
      ))}
    </div>
  );
}

export function InlineLoading({ label = 'Loading…' }) {
  return (
    <div className="page-loading" style={{ minHeight: 160 }} role="status" aria-live="polite">
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry, retrying = false }) {
  return (
    <div className="card" role="alert" style={{ maxWidth: 560 }}>
      <div className="empty-state" style={{ padding: '28px 12px' }}>
        <div className="icon-circle" style={{ background: 'var(--red-100)', color: 'var(--red-600)' }}>
          <AlertCircle size={24} aria-hidden="true" />
        </div>
        <p style={{ marginBottom: 14 }}>{message || 'Something went wrong.'}</p>
        {onRetry && (
          <button type="button" className="btn btn-secondary" onClick={onRetry} disabled={retrying}>
            <RefreshCw size={16} aria-hidden="true" /> {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, children, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="icon-circle">
          <Icon size={24} aria-hidden="true" />
        </div>
      )}
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Extracts a user-facing message from an axios error. */
export function apiErrorMessage(err, fallback) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ERR_NETWORK') return 'Cannot reach the server. Check that the backend is running and try again.';
  return fallback;
}
