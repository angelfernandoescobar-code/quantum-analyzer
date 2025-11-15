// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// === CLAVE SECRETA (NUNCA EN CÓDIGO EN PRODUCCIÓN) ===
const JWT_SECRET = process.env.JWT_SECRET || 'AngelChirinosBiblioteca2025';

module.exports = async function (req, res, next) {
  // === OBTENER TOKEN DEL HEADER ===
  const token = req.header('x-auth-token');
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Acceso denegado. Token no proporcionado.' 
    });
  }

  try {
    // === VERIFICAR TOKEN ===
    const decoded = jwt.verify(token, JWT_SECRET);

    // === BUSCAR USUARIO EN DB ===
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Token inválido: usuario no encontrado.' 
      });
    }

    // === INYECTAR USUARIO EN req ===
    req.user = {
      _id: user._id,
      userId: user._id,        // Para compatibilidad con frontend
      nombre: user.nombre,
      email: user.email,
      rol: user.rol
    };

    next();

  } catch (err) {
    // === DETECTAR TOKEN EXPIRADO ===
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Sesión expirada. Inicia sesión nuevamente.' 
      });
    }

    // === OTROS ERRORES DE JWT ===
    console.error('Error JWT:', err.message);
    return res.status(401).json({ 
      error: 'Token inválido o corrupto.' 
    });
  }
};