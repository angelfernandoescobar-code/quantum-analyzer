// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. No hay token.' });
  }

  try {
    // Usa variable de entorno de Render
    const secret = process.env.JWT_SECRET || 'fallback_secret_temporal_no_usar_en_produccion';
    
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    req.user = {
      _id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol
    };

    next();
  } catch (err) {
    console.error('Error JWT:', err.message);
    res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};