// frontend/src/components/Sidebar.jsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, User, UploadCloud, ListChecks, BarChart3, LogOut, GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <GraduationCap size={22} />
        SkillStat AI
      </div>
      <nav>
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          <User size={18} /> Profile
        </NavLink>
        <NavLink to="/upload" className={({ isActive }) => (isActive ? 'active' : '')}>
          <UploadCloud size={18} /> Upload Document
        </NavLink>
        <NavLink to="/my-quizzes" className={({ isActive }) => (isActive ? 'active' : '')}>
          <ListChecks size={18} /> My Quizzes
        </NavLink>
        <NavLink to="/results" className={({ isActive }) => (isActive ? 'active' : '')}>
          <BarChart3 size={18} /> Results
        </NavLink>
        <button className="nav-link" onClick={handleLogout}>
          <LogOut size={18} /> Logout
        </button>
      </nav>
      {user && (
        <div className="user-chip">
          Signed in as
          <br />
          <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{user.name}</strong>
        </div>
      )}
    </aside>
  );
}
