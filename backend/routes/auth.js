const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// REGISTRO
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      nombre,
      email: email.toLowerCase(),
      password: hashedPassword
    });
    await user.save();

    const token = jwt.sign(
      { user: { id: user.id } },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// LOGIN
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
      { user: { id: user.id } },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;