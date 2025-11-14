// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_temporal_no_usar_en_produccion';

// === REGISTRO (SOLO ADMIN) ===
router.post('/register', auth, async (req, res) => {
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el admin puede crear usuarios' });
  }

  try {
    const { nombre, email, password, rol = 'user' } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      nombre,
      email: email.toLowerCase(),
      password: hashedPassword,
      rol
    });
    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Usuario creado',
      token,
      user: { 
        id: user._id, 
        nombre: user.nombre, 
        email: user.email, 
        rol: user.rol 
      }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// === LOGIN ===
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
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
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// === LISTAR USUARIOS (SOLO ADMIN) ===
router.get('/users', auth, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });

  const users = await User.find().select('-password');
  res.json(users);
});

// === ELIMINAR USUARIO (SOLO ADMIN) ===
router.delete('/users/:id', auth, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (user.rol === 'admin' && user.email === 'admin@quantum.com') {
    return res.status(400).json({ error: 'No puedes eliminar al admin principal' });
  }

  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'Usuario eliminado' });
});

module.exports = router;
// === VALIDAR TOKEN (para index.html) ===
router.get('/validate', auth, (req, res) => {
  res.json({ valid: true, user: req.user });
});