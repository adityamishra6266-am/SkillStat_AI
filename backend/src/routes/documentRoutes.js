// backend/src/routes/documentRoutes.js
const express = require('express');
const router = express.Router();
const { uploadDocument, generateDocumentQuiz, listDocuments, getDocument } = require('../controllers/documentController');
const authMiddleware = require('../middleware/auth');
const { upload, MAX_SIZE_MB } = require('../middleware/upload');

router.use(authMiddleware);

router.post('/upload', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: `File is too large. Maximum allowed size is ${MAX_SIZE_MB}MB.` });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ success: false, message: 'Invalid file type. Only PDF, DOCX, PPTX and TXT files are allowed.' });
      }
      return res.status(400).json({ success: false, message: 'File upload error.' });
    }
    next();
  });
}, uploadDocument);

router.post('/:id/generate-quiz', generateDocumentQuiz);
router.get('/', listDocuments);
router.get('/:id', getDocument);

module.exports = router;
