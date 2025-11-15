require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const chatRoutes = require('./routes/chat'); // ← NUEVA LÍNEA AGREGADA

const app = express();

// MIDDLEWARES
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== SERVIR FRONTEND CORRECTAMENTE (ESTO ES LO QUE FALTABA) =====
const frontendPath = path.join(__dirname, '../frontend');

// Sirve todos los archivos estáticos (css, js, imágenes, etc.)
app.use(express.static(frontendPath));

// Ruta específica para login.html (importante que esté ANTES del wildcard)
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

// Ruta específica para index.html (dashboard)
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Cualquier otra ruta que no sea API → index.html (SPA fallback)
app.get(['/', '/dashboard', '/historial', '/perfil'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ===== RUTAS API (siempre después de las rutas estáticas) =====
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/chat', chatRoutes); // ← NUEVA LÍNEA AGREGADA

// ===== WILDCARD AL FINAL (captura todo lo demás) =====
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ===== CONEXIÓN A MONGODB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas conectado'))
  .catch(err => console.error('Error MongoDB:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});