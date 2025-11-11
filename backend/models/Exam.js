const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  patientInfo: {
    type: Object,
    default: {}
  },
  title: {
    type: String
  },
  parameters: {
    type: Object,
    default: {}
  },
  aiAnalysis: {
    type: Object,  // CAMBIADO: ahora acepta objeto
    default: {}
  },
  severity: {
    type: String,
    enum: ['BAJO', 'MEDIO', 'ALTO'],
    default: 'BAJO'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Exam', ExamSchema);