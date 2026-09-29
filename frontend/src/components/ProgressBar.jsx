// frontend/src/components/ProgressBar.jsx
// Accessible progress / level bar. `required` draws the requirement marker.
import React from 'react';

export default function ProgressBar({ value, required = null, label, color, height }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="progress-bar level-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      style={height ? { height } : undefined}
    >
      <div className="progress-bar-fill" style={{ width: `${v}%`, background: color }} />
      {required !== null && required !== undefined && (
        <div className="level-marker" style={{ left: `${Math.min(100, required)}%` }} title={`Required level: ${required}%`} />
      )}
    </div>
  );
}

export function levelColor(current, required) {
  if (required === null || required === undefined) return undefined;
  if (current >= required) return '#0f8a68';
  if (current >= required * 0.7) return '#b7791f';
  return '#c23a3a';
}
