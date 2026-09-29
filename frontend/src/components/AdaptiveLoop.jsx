// frontend/src/components/AdaptiveLoop.jsx
// Subtle visual of the adaptive learning cycle (the core idea of the platform).
import React from 'react';
import { ArrowRight } from 'lucide-react';

const STEPS = ['Assess', 'Identify gap', 'Recommend', 'Learn', 'Reassess', 'Improve'];

export function AdaptiveLoopStrip({ active }) {
  return (
    <nav className="card loop-strip" aria-label="How SkillStat AI works: adaptive learning cycle">
      <span className="loop-title">Adaptive learning cycle</span>
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <span className={`loop-step ${active === s ? 'is-active' : ''}`} aria-current={active === s ? 'step' : undefined}>{s}</span>
          {i < STEPS.length - 1 && <ArrowRight size={14} className="loop-arrow" aria-hidden="true" />}
        </React.Fragment>
      ))}
    </nav>
  );
}

const HOW = [
  ['Assess', 'Short competency assessment against your role.'],
  ['Identify gap', 'Your level is compared with the required level.'],
  ['Recommend', 'Learning matched to each gap, by priority.'],
  ['Learn', 'Follow your sequenced learning path.'],
  ['Reassess', 'Quiz on your own learning material.'],
  ['Improve', 'Evidence updates competency, gaps and path.'],
];

export function HowItWorks() {
  return (
    <section className="card mb-20" aria-labelledby="how-it-works-heading">
      <h3 id="how-it-works-heading" className="card-title" style={{ marginBottom: 12 }}>How the platform works</h3>
      <ol className="how-list">
        {HOW.map(([title, text], i) => (
          <li key={title}>
            <span className="how-num" aria-hidden="true">{i + 1}</span>
            <strong>{title}</strong>
            {text}
          </li>
        ))}
      </ol>
    </section>
  );
}
