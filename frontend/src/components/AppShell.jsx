// frontend/src/components/AppShell.jsx
// Page frame shared by every signed-in page: sidebar (off-canvas on small
// screens), mobile top bar, skip link and the <main> landmark.
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, GraduationCap } from 'lucide-react';
import Sidebar from './Sidebar.jsx';

export default function AppShell({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the drawer on navigation and on Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="mobile-bar">
        <button type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen(true)}>
          <Menu size={20} aria-hidden="true" />
        </button>
        <GraduationCap size={20} aria-hidden="true" /> SkillStat AI
      </div>
      <div className={`sidebar-scrim ${open ? 'is-open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <main id="main-content" className="content-area" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
