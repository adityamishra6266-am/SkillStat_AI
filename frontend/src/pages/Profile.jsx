// frontend/src/pages/Profile.jsx
import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export default function Profile() {
  const [form, setForm] = useState({
    designation: '',
    department: '',
    qualification: '',
    experience: '',
    interests: '',
    skillLevel: 'Beginner',
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [completion, setCompletion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    try {
      const { data } = await api.get('/profile');
      const p = data.profile;
      setName(p.name || '');
      setEmail(p.email || '');
      setForm({
        designation: p.designation || '',
        department: p.department || '',
        qualification: p.qualification || '',
        experience: p.experience || '',
        interests: p.interests || '',
        skillLevel: p.skill_level || 'Beginner',
      });
      setCompletion(p.completion || 0);
    } catch (err) {
      setError('Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api.put('/profile', form);
      setMessage('Profile saved successfully.');
      fetchProfile();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <div className="page-header">
          <div>
            <h2>Your Profile</h2>
            <p>This information personalizes the quizzes generated from your documents.</p>
          </div>
        </div>

        {loading ? (
          <div className="page-loading">Loading profile...</div>
        ) : (
          <div className="two-col">
            <div className="card">
              {message && <div className="form-success">{message}</div>}
              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="two-col" style={{ marginBottom: 0 }}>
                  <div className="field">
                    <label>Full Name</label>
                    <input value={name} disabled />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input value={email} disabled />
                  </div>
                </div>

                <div className="two-col" style={{ marginBottom: 0 }}>
                  <div className="field">
                    <label htmlFor="designation">Designation</label>
                    <input
                      id="designation"
                      value={form.designation}
                      onChange={(e) => update('designation', e.target.value)}
                      placeholder="e.g. Statistical Officer"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="department">Department</label>
                    <input
                      id="department"
                      value={form.department}
                      onChange={(e) => update('department', e.target.value)}
                      placeholder="e.g. Statistics Department"
                    />
                  </div>
                </div>

                <div className="two-col" style={{ marginBottom: 0 }}>
                  <div className="field">
                    <label htmlFor="qualification">Qualification</label>
                    <input
                      id="qualification"
                      value={form.qualification}
                      onChange={(e) => update('qualification', e.target.value)}
                      placeholder="e.g. MCA"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="experience">Years of Experience</label>
                    <input
                      id="experience"
                      value={form.experience}
                      onChange={(e) => update('experience', e.target.value)}
                      placeholder="e.g. 2 years"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="interests">Areas of Interest</label>
                  <input
                    id="interests"
                    value={form.interests}
                    onChange={(e) => update('interests', e.target.value)}
                    placeholder="e.g. Python, Data Analysis, GIS"
                  />
                </div>

                <div className="field">
                  <label htmlFor="skillLevel">Current Skill Level</label>
                  <select
                    id="skillLevel"
                    value={form.skillLevel}
                    onChange={(e) => update('skillLevel', e.target.value)}
                  >
                    {SKILL_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>

                <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: 'auto', padding: '11px 28px' }}>
                  {saving ? <span className="spinner" /> : 'Save Profile'}
                </button>
              </form>
            </div>

            <div className="card" style={{ alignSelf: 'start' }}>
              <div className="stat-label" style={{ marginBottom: 10 }}>
                Profile Completion
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
                {completion}%
              </div>
              <div className="progress-bar" style={{ marginBottom: 18 }}>
                <div className="progress-bar-fill" style={{ width: `${completion}%` }} />
              </div>
              <p style={{ fontSize: 13.5 }}>
                A complete profile helps SkillStat AI tailor quiz difficulty and focus to your
                background — fill in every field for the best results.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
