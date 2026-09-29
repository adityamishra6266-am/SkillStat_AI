// backend/src/controllers/profileController.js

const { pool } = require('../config/db');
const { mapUserCompetencies } = require('../services/competencyMappingService');
const { calculateAndStoreSkillGaps } = require('../services/skillGapService');
const { generateRecommendations } = require('../services/recommendationService');
const { generateLearningPath } = require('../services/learningPathService');

const PROFILE_FIELDS = ['designation', 'department', 'qualification', 'experience', 'interests', 'skill_level'];

function calculateCompletion(profile) {
  const filled = PROFILE_FIELDS.filter((f) => profile[f] && String(profile[f]).trim().length > 0).length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

async function getProfile(req, res) {
  try {
    const [userRows] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const [profileRows] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
    let profile = profileRows[0];

    if (!profile) {
      await pool.query('INSERT INTO profiles (user_id) VALUES (?)', [req.user.id]);
      profile = {
        user_id: req.user.id,
        designation: null,
        department: null,
        qualification: null,
        experience: null,
        interests: null,
        skill_level: 'Beginner',
      };
    }

    const completion = calculateCompletion(profile);

    return res.json({
      success: true,
      profile: { ...userRows[0], ...profile, completion },
    });
  } catch (err) {
    console.error('[GetProfile Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error fetching profile.' });
  }
}

async function updateProfile(req, res) {
  try {
    const { designation, department, qualification, experience, interests, skillLevel } = req.body;

    const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
    const level = validLevels.includes(skillLevel) ? skillLevel : 'Beginner';

    const [existing] = await pool.query('SELECT id FROM profiles WHERE user_id = ?', [req.user.id]);

    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO profiles (user_id, designation, department, qualification, experience, interests, skill_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, designation, department, qualification, experience, interests, level]
      );
    } else {
      await pool.query(
        `UPDATE profiles SET designation = ?, department = ?, qualification = ?, experience = ?, interests = ?, skill_level = ?
         WHERE user_id = ?`,
        [designation, department, qualification, experience, interests, level, req.user.id]
      );
    }

    // keep the competency mapping in sync with the profile.
    // and skill gaps in sync with the mapping.
    // and recommendations in sync with the gaps.
    // and the learning path in sync with the recommendations.
    // None of these must ever break the profile-save response itself
    // — if any step fails (e.g. no requirements configured yet for
    // this designation), we log it and still report success for the
    // profile save, which is the operation the user asked for.
    try {
      await mapUserCompetencies(req.user.id);
      await calculateAndStoreSkillGaps(req.user.id);
      await generateRecommendations(req.user.id);
      await generateLearningPath(req.user.id);
    } catch (mappingErr) {
      console.error('[UpdateProfile -> Competency Mapping/Skill Gap/Recommendation/Path Error]', mappingErr.message);
    }

    return res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error('[UpdateProfile Error]', err.message);
    return res.status(500).json({ success: false, message: 'Server error updating profile.' });
  }
}

module.exports = { getProfile, updateProfile, calculateCompletion, PROFILE_FIELDS };
