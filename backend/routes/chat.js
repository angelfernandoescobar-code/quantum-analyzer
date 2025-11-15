// backend/routes/chat.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const auth = require('../middleware/auth');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Modelo del chat (en memoria por ahora, puedes crear un modelo Mongoose si quieres guardar historial)
const chatHistories = new Map();

// === ENDPOINT PARA CHAT ===
router.post('/message', auth, async (req, res) => {
  const { message } = req.body;
  const userId = req.user._id.toString();

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Mensaje inválido' });
  }

  try {
    // Obtener historial del usuario (máximo 10 mensajes previos)
    let history = chatHistories.get(userId) || [];
    
    // Agregar mensaje del usuario
    history.push({ role: 'user', content: message });

    // Limitar historial a últimos 10 mensajes (para no exceder tokens)
    if (history.length > 10) {
      history = history.slice(-10);
    }

    // Llamar a OpenAI con contexto médico
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Más rápido y económico para chat
      messages: [
        {
          role: 'system',
          content: `Eres un asistente médico inteligente llamado "Quantum Assistant" del sistema Quantum Analyzer. 
Tu función es:
- Responder preguntas sobre salud, exámenes de laboratorio y resultados médicos
- Explicar términos médicos de forma clara y sencilla
- Dar recomendaciones generales de salud
- Ayudar a interpretar parámetros de laboratorio

IMPORTANTE:
- Sé preciso pero amigable
- Si no estás seguro, recomienda consultar a un médico
- No diagnostiques enfermedades, solo proporciona información educativa
- Respuestas cortas y directas (máximo 3-4 párrafos)
- Usa emojis ocasionalmente para ser más amigable 😊`
        },
        ...history
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const aiResponse = completion.choices[0].message.content;

    // Agregar respuesta de la IA al historial
    history.push({ role: 'assistant', content: aiResponse });
    chatHistories.set(userId, history);

    res.json({ 
      message: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Error en chat:', err.message);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
});

// === LIMPIAR HISTORIAL (OPCIONAL) ===
router.delete('/history', auth, async (req, res) => {
  const userId = req.user._id.toString();
  chatHistories.delete(userId);
  res.json({ message: 'Historial limpiado' });
});

// === OBTENER HISTORIAL (OPCIONAL) ===
router.get('/history', auth, async (req, res) => {
  const userId = req.user._id.toString();
  const history = chatHistories.get(userId) || [];
  res.json({ history });
});

module.exports = router;