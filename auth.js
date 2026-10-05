const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// Verifies the login token, confirms the account is still active, and attaches
// { id, role, name } to the request.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Please log in.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Checked against the database, not just the token, so a deactivated account
    // loses access immediately rather than whenever its token happens to expire.
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Your session is no longer valid — please log in again.' });
    }

    req.user = { id: user.id, role: user.role, name: user.name };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired — please log in again.' });
  }
}

// Restricts a route to one or more roles, e.g. authorize('ADMIN', 'SUPER_ADMIN')
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
