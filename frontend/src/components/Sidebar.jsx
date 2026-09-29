// frontend/src/components/Sidebar.jsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, User, UploadCloud, ListChecks, BarChart3, LogOut, GraduationCap,
  Target, AlertTriangle, Sparkles, Route as RouteIcon, ClipboardCheck, ShieldCheck, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const LEARNER_LINKS = [
  ['/dashboard', LayoutDashboard, 'Dashboard'],
  ['/profile', User, 'Official Profile'],
  ['/diagnostic-assessment', ClipboardCheck, 'Competency Assessment'],
  ['/competencies', Target, 'Competency Profile'],
  ['/skill-gaps', AlertTriangle, 'Skill Gap Analysis'],
  ['/recommendations', Sparkles, 'Learning Recommendations'],
  ['/learning-path', RouteIcon, 'My Learning Path'],
  ['/upload', UploadCloud, 'Learning Material'],
  ['/my-quizzes', ListChecks, 'My Quizzes'],
  ['/results', BarChart3, 'Assessment Results'],
];

export default function Sidebar({ open = false, onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const linkClass = ({ isActive }) => (isActive ? 'active' : '');

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const links = isAdmin ? [['/admin', ShieldCheck, 'Administrator Dashboard']] : LEARNER_LINKS;

  return (
    <aside id="app-sidebar" className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
      <div className="brand" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GraduationCap size={22} aria-hidden="true" /> SkillStat AI
        </span>
        {open && (
          <button type="button" className="icon-btn" aria-label="Close navigation menu" onClick={onNavigate} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff' }}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <nav aria-label="Primary">
        {links.map(([to, Icon, label]) => (
          <NavLink key={to} to={to} className={linkClass} onClick={onNavigate}>
            <Icon size={18} aria-hidden="true" /> {label}
          </NavLink>
        ))}
        <button type="button" className="nav-link" onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" /> Logout
        </button>
      </nav>
      {user && (
        <div className="user-chip">
          Signed in as
          <br />
          <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{user.name}</strong>
          {isAdmin && (
            <>
              <br />
              <span style={{ fontSize: 11, opacity: 0.75 }}>Administrator</span>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
