const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req, res, next) {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ error: 'Acceso denegado. No hay token.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido.' });
  }
};