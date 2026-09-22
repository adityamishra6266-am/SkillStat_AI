// backend/src/services/aiService.js
// Talks to the Python FastAPI AI service to extract document text
// and generate a personalized 5-question MCQ quiz.

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function extractAndGenerateQuiz({ filePath, fileType, profile }) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('file_type', fileType);
  form.append('designation', profile.designation || '');
  form.append('department', profile.department || '');
  form.append('qualification', profile.qualification || '');
  form.append('experience', profile.experience || '');
  form.append('interests', profile.interests || '');
  form.append('skill_level', profile.skill_level || 'Beginner');

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/extract-and-generate-quiz`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data;
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      const e = new Error('AI_SERVICE_UNAVAILABLE');
      throw e;
    }
    if (err.response) {
      const e = new Error(err.response.data?.detail || 'AI_SERVICE_ERROR');
      throw e;
    }
    throw err;
  }
}

module.exports = { extractAndGenerateQuiz };
