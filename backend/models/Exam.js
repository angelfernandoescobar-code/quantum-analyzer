// backend/models/Exam.js
const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,  // OBLIGATORIO: cada examen pertenece a un usuario
    index: true      // Para búsquedas rápidas por usuario
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  patientInfo: {
    type: Object,
    default: {}
  },
  title: {
    type: String,
    trim: true
  },
  parameters: {
    type: Object,
    default: {}
  },
  aiAnalysis: {
    type: Object,
    default: {}
  },
  severity: {
    type: String,
    enum: ['BAJO', 'MEDIO', 'ALTO'],
    default: 'BAJO',
    uppercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true  // Para ordenar por fecha
  }
});

// === ÍNDICE COMPUESTO PARA HISTORIAL RÁPIDO ===
ExamSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Exam', ExamSchema);