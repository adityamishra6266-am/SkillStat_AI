// backend/src/middleware/auth.js
// Protects private routes by verifying the JWT sent in the Authorization header.

const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // `role` was added to the JWT payload in existing (see authController.generateToken).
    // A token issued before that change won't carry it — default to 'user' rather than
    // leaving it undefined, so older sessions keep working as ordinary learner accounts
    // (they simply won't be treated as admin until they log in again).
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name, role: decoded.role || 'user' };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token. Please log in again.' });
  }
}

// Administrator Dashboard.
// Backend-enforced authorization: a learner hitting an admin route
// directly (not just an admin button hidden in the UI) must receive
// 403, not the data. Always used AFTER authMiddleware (which sets
// req.user), so req.user.role is guaranteed to be present here.
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.' });
  }
  next();
}

module.exports = authMiddleware;
module.exports.adminOnly = adminOnly;
