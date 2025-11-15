// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// === CLAVE SECRETA (NUNCA EN CÓDIGO EN PRODUCCIÓN) ===
const JWT_SECRET = process.env.JWT_SECRET || 'AngelChirinosBiblioteca2025';

// === REGISTRO (SOLO ADMIN) ===
router.post('/register', auth, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el admin puede crear usuarios' });
  }

  try {
    const { nombre, email, password, rol = 'user' } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const emailLower = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      return res.status(400).json({ error: 'Este email ya está registrado' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      nombre: nombre.trim(),
      email: emailLower,
      password: hashedPassword,
      rol
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol
      }
    });
  } catch (err) {
    console.error('Error en registro:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// === LOGIN ===
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const emailLower = email.toLowerCase().trim();
    const user = await User.findOne({ email: emailLower });
    if (!user) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { userId: user._id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol
      }
    });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// === LISTAR USUARIOS (SOLO ADMIN) ===
router.get('/users', auth, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error('Error al listar usuarios:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// === ELIMINAR USUARIO (SOLO ADMIN) ===
router.delete('/users/:id', auth, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.rol === 'admin' && user.email === 'admin@quantum.com') {
      return res.status(400).json({ error: 'No puedes eliminar al administrador principal' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// === VALIDAR TOKEN (PARA index.html) ===
router.get('/validate', auth, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.userId,
      nombre: req.user.nombre,
      email: req.user.email,
      rol: req.user.rol
    }
  });
});

module.exports = router;