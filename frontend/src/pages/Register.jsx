// frontend/src/pages/Register.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.token, data.user);
      navigate('/profile');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="brand">
          <GraduationCap size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          SkillStat AI
        </div>
        <div className="tagline">
          <h2>Start your personalized learning path</h2>
          <p>
            Tell us a bit about your role and experience once — every quiz you take after that is
            tuned to fit you.
          </p>
        </div>
        <div className="stat-row">
          <div>
            <div className="stat-num">2 min</div>
            <div className="stat-label">To set up your profile</div>
          </div>
          <div>
            <div className="stat-num">∞</div>
            <div className="stat-label">Documents you can upload</div>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <h1>Create your account</h1>
          <p className="subtitle">It only takes a minute to get started.</p>

          {error && <div className="form-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="At least 6 characters"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                placeholder="Re-enter your password"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
