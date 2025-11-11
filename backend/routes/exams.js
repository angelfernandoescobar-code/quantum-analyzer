// backend/routes/exams.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const Exam = require('../models/Exam');
const auth = require('../middleware/auth');

const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CARGAR PRODUCTOS 4LIFE
const productos4Life = JSON.parse(fs.readFileSync(path.join(__dirname, '../4life-products.json'), 'utf-8'));

// === ANALIZAR ZIP (1 PACIENTE, 40+ ARCHIVOS) ===
router.post('/analyze', auth, upload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ZIP' });

  const zipPath = req.file.path;
  const extractPath = path.join(__dirname, '../extracted', Date.now().toString());
  const fileName = req.file.originalname;

  try {
    fs.mkdirSync(extractPath, { recursive: true });
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractPath })).promise();

    const files = fs.readdirSync(extractPath);
    const allData = { examenes: [] };
    let patientInfo = {};

    // === RECOLECTAR TODOS LOS ARCHIVOS ===
    for (const file of files) {
      const filePath = path.join(extractPath, file);
      const ext = path.extname(file).toLowerCase();

      if (ext === '.json') {
        try {
          const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          allData.examenes.push({ tipo: 'json', datos: jsonData, archivo: file });

          // Extraer info del paciente (primer JSON con datos personales)
          if (jsonData.paciente && !patientInfo.nombre) {
            const peso = parseFloat(jsonData.peso) || 0;
            const estatura = parseFloat(jsonData.estatura) || 0;
            const imc = peso && estatura ? (peso / Math.pow(estatura / 100, 2)).toFixed(1) : 'N/A';

            patientInfo = {
              nombre: jsonData.paciente || 'No especificado',
              edad: jsonData.edad || 'N/A',
              sexo: jsonData.sexo || 'N/A',
              peso: peso.toString(),
              estatura: estatura.toString(),
              imc
            };
          }
        } catch (e) { continue; }
      }

      if (ext === '.html' || ext === '.htm') {
        const htmlContent = fs.readFileSync(filePath, 'utf-8');
        allData.examenes.push({ tipo: 'html', contenido: htmlContent.substring(0, 15000), archivo: file });
      }
    }

    if (allData.examenes.length === 0) throw new Error('No se encontraron datos en el ZIP');

    // === LISTA DE PRODUCTOS ===
    const listaProductos = Object.entries(productos4Life)
      .map(([nombre, info]) => `"${nombre}": ${info.beneficio} | Dosis: ${info.dosis} | Sistemas: ${info.sistemas.join(', ')}`)
      .join('\n');

    // === PROMPT ÉPICO (1 PACIENTE, 40+ ARCHIVOS) ===
    const prompt = `
Eres un médico funcional experto en 4Life Research. Analiza **TODOS** los exámenes del ZIP (40+ archivos) de **UN SOLO PACIENTE**.

**REGLAS ESTRICTAS:**
- Analiza **10+ sistemas**: hepático, cardiovascular, renal, endocrino, digestivo, inmunológico, óseo, nervioso, respiratorio, muscular, hematológico, otros.
- Para cada sistema:
  1. Lista **todos** los parámetros anormales (valor vs rango normal)
  2. Explica fisiología, causas probables e impacto
  3. 3-5 oraciones detalladas
- Resumen: 4-5 líneas sobre salud general
- Riesgo: BAJO/MEDIO/ALTO
- Recomendaciones 4Life: máx 8 productos, dosis ajustada, solo lo necesario
- Usa **solo estos productos**:

${listaProductos}

**FORMATO JSON EXACTO:**

{
  "paciente": { "nombre": "${patientInfo.nombre}", "edad": "${patientInfo.edad}", "sexo": "${patientInfo.sexo}", "imc": "${patientInfo.imc}" },
  "resumen": "4-5 líneas sobre el estado general del paciente...",
  "analisis_por_sistemas": {
    "hepatico": "Explicación larga (3-5 oraciones)...",
    "cardiovascular": "...",
    "renal": "...",
    ...
  },
  "riesgo": "ALTO",
  "recomendaciones_4life": [
    "Transfer Factor Plus (2 cápsulas 2x/día): Inmunidad baja..."
  ]
}

**DATOS COMPLETOS (${allData.examenes.length} archivos encontrados):**
${allData.examenes.map((e, i) => `
--- ARCHIVO ${i + 1}: ${e.archivo} ---
${e.tipo === 'json' ? JSON.stringify(e.datos, null, 2) : e.contenido}
`).join('\n\n')}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4096
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content);

    // === GUARDAR EN MONGODB ===
    const exam = new Exam({
      userId: req.user.id,
      fileName,
      patientInfo: aiResponse.paciente,
      aiAnalysis: aiResponse,
      severity: aiResponse.riesgo
    });

    await exam.save();

    // === LIMPIAR ===
    fs.unlinkSync(zipPath);
    fs.rmSync(extractPath, { recursive: true, force: true });

    res.json(exam);

  } catch (err) {
    console.error('Error:', err);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(extractPath)) fs.rmSync(extractPath, { recursive: true, force: true });
    res.status(500).json({ error: 'Error al analizar: ' + err.message });
  }
});

// === HISTORIAL, DETALLE, PDF (sin cambios) ===
router.get('/', auth, async (req, res) => {
  try {
    const exams = await Exam.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam || exam.userId.toString() !== req.user.id) return res.status(404).json({ error: 'No encontrado' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;