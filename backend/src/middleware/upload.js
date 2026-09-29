// backend/src/middleware/upload.js
// Handles document uploads with Multer: validates type, size, and destination.

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    cb(null, `${safeBase}-${uniqueSuffix}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  // Extension is the primary check; browsers sometimes send a generic MIME type
  // (e.g. application/octet-stream) for valid Office files, and the file's real
  // content is verified after upload (see documentController.contentMatchesType).
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.mimetype) || file.mimetype === 'application/octet-stream';
  if (!ALLOWED_EXTENSIONS.includes(ext) || !mimeOk) {
    return cb(new Error('INVALID_FILE_TYPE'), false);
  }
  cb(null, true);
}

const maxSizeMB = Number(process.env.MAX_FILE_SIZE_MB) || 10;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024, files: 1 },
});

module.exports = { upload, UPLOAD_DIR, MAX_SIZE_MB: maxSizeMB };
