/**
 * Admin middleware
 *
 * This middleware ensures that the request comes from an authenticated user with the
 * `admin` role. It should be used after the `authenticate` middleware to
 * populate `req.user`. If the user is not an admin, a 403 response is
 * returned.
 */
module.exports = function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  next();
};