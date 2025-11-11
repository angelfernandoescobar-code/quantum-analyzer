require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');

const app = express();

// MIDDLEWARES
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// SERVIR FRONTEND
app.use(express.static(path.join(__dirname, '../frontend')));

// RUTAS API
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);

// CUALQUIER RUTA → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// CONEXIÓN A MONGODB (SIN OPCIONES OBSOLETAS)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas conectado'))
  .catch(err => console.error('Error MongoDB:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});