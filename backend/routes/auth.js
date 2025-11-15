// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// CLAVE SECRETA
const JWT_SECRET = process.env.JWT_SECRET || 'AngelChirinosBiblioteca2025';

// === LOGIN (CORREGIDO PARA QUE FUNCIONE CON TU USUARIO ACTUAL) ===
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

    // ACEPTAR AMBAS CONTRASEÑAS PORQUE TU USUARIO TIENE UNA EN TEXTO PLANO
    const isMatch = await bcrypt.compare(password, user.password);
    const isPlainTextMatch = user.password === password; // <-- esto es lo nuevo

    if (!isMatch && !isPlainTextMatch) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    // Si entró con contraseña en texto plano, la hasheamos ahora mismo
    if (isPlainTextMatch && user.password !== password) {
      const salt = await bcrypt.genSalt(12);
      user.password = await bcrypt.hash(password, salt);
      await user.save();
      console.log('Contraseña del admin actualizada a hash seguro');
    }

    const token = jwt.sign(
      { userId: user._id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '30d' }
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

// EL RESTO QUEDA IGUAL (register, users, delete, validate)
router.post('/register', auth, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo el admin puede crear usuarios' });

  try {
    const { nombre, email, password, rol = 'user' } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan datos requeridos' });

    const emailLower = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) return res.status(400).json({ error: 'Este email ya está registrado' });

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({ nombre: nombre.trim(), email: emailLower, password: hashedPassword, rol });
    await user.save();

    const token = jwt.sign({ userId: user._id, rol: user.rol }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      token,
      user: { id: user._id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    console.error('Error en registro:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/users', auth, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/users/:id', auth, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.rol === 'admin' && user.email === 'admin@quantum.com')
      return res.status(400).json({ error: 'No puedes eliminar al administrador principal' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/validate', auth, (req, res) => {
  res.json({
    valid: true,
    user: { id: req.user.userId, nombre: req.user.nombre, email: req.user.email, rol: req.user.rol }
  });
});

module.exports = router;