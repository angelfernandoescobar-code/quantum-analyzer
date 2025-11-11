const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

async function analyzeExam(examText) {
  const prompt = `Eres un médico especialista en biorresonancia cuántica. Usa términos médicos reales como "hipertensión", "dislipidemia", "insuficiencia cardíaca", etc. Analiza este examen cardiovascular y cerebrovascular:

${examText}

Responde SOLO en formato JSON válido:
{
  "resumen": "Resumen en 2-3 líneas",
  "hallazgos": ["hallazgo 1", "hallazgo 2"],
  "recomendaciones": ["recomendación 1", "recomendación 2"],
  "riesgo": "Bajo / Moderado / Alto"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (err) {
    console.error("Error OpenAI:", err);
    return {
      resumen: "Análisis fallido.",
      hallazgos: ["Error de conexión con IA."],
      recomendaciones: ["Reintentar más tarde."],
      riesgo: "Desconocido"
    };
  }
}

module.exports = { analyzeExam };