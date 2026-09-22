// backend/src/routes/documentRoutes.js
const express = require('express');
const router = express.Router();
const { uploadDocument, listDocuments, getDocument } = require('../controllers/documentController');
const authMiddleware = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.use(authMiddleware);

router.post('/upload', (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File is too large. Maximum allowed size is 10MB.' });
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ success: false, message: 'Invalid file type. Only PDF, DOCX, PPTX and TXT files are allowed.' });
      }
      return res.status(400).json({ success: false, message: 'File upload error.' });
    }
    next();
  });
}, uploadDocument);

router.get('/', listDocuments);
router.get('/:id', getDocument);

module.exports = router;
