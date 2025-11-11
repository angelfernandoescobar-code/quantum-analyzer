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

const productos4Life = JSON.parse(fs.readFileSync(path.join(__dirname, '../4life-products.json'), 'utf-8'));

// === FUNCIÓN: RESUMIR ARCHIVO (MAX 5000 tokens) ===
async function resumirArchivo(tipo, datos, archivo) {
  const prompt = `
Eres un médico. Resume **solo parámetros anormales** de este archivo.  
Formato:  
- Parámetro: valor (rango normal) → impacto breve  
Máximo 10 líneas.

Archivo: ${archivo}
Datos: ${tipo === 'json' ? JSON.stringify(datos, null, 2).substring(0, 4000) : datos.substring(0, 4000)}
`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.1
    });
    return res.choices[0].message.content.trim();
  } catch (err) {
    return `Error resumiendo ${archivo}: ${err.message}`;
  }
}

// === ANALIZAR ZIP (CHUNKING + RESUMEN) ===
router.post('/analyze', auth, upload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ZIP' });

  const zipPath = req.file.path;
  const extractPath = path.join(__dirname, '../extracted', Date.now().toString());
  const fileName = req.file.originalname;

  try {
    fs.mkdirSync(extractPath, { recursive: true });
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractPath })).promise();

    const files = fs.readdirSync(extractPath);
    const resumenes = [];
    let patientInfo = {};

    // === 1. RESUMIR CADA ARCHIVO (gpt-4o-mini, barato y rápido) ===
    for (const file of files) {
      const filePath = path.join(extractPath, file);
      const ext = path.extname(file).toLowerCase();

      if (ext === '.json') {
        try {
          const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const resumen = await resumirArchivo('json', jsonData, file);
          resumenes.push(resumen);

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
        const html = fs.readFileSync(filePath, 'utf-8');
        const resumen = await resumirArchivo('html', html, file);
        resumenes.push(resumen);
      }
    }

    if (resumenes.length === 0) throw new Error('No se encontraron datos');

    // === 2. ANÁLISIS FINAL (gpt-4o, máx 25K tokens) ===
    const listaProductos = Object.entries(productos4Life)
      .map(([n, i]) => `"${n}": ${i.beneficio} | Dosis: ${i.dosis}`)
      .join('\n');

    const promptFinal = `
Paciente: ${patientInfo.nombre}, ${patientInfo.edad} años, IMC: ${patientInfo.imc}

**RESÚMENES DE ${resumenes.length} ARCHIVOS (solo anormales):**
${resumenes.join('\n\n---\n\n')}

**TAREA:**
- Analiza 10+ sistemas: hepático, cardiovascular, renal, endocrino, digestivo, inmunológico, óseo, nervioso, respiratorio, muscular, hematológico, otros.
- Por sistema: 3-5 oraciones detalladas
- Riesgo: BAJO/MEDIO/ALTO
- Recomendaciones 4Life: máx 8, dosis ajustada

Productos:
${listaProductos}

**FORMATO JSON EXACTO:**
{
  "paciente": ${JSON.stringify(patientInfo)},
  "resumen": "4-5 líneas...",
  "analisis_por_sistemas": { "hepatico": "...", ... },
  "riesgo": "ALTO",
  "recomendaciones_4life": [ "Producto (dosis): motivo" ]
}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: promptFinal.substring(0, 25000) }], // SAFE
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 3000
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content);

    const exam = new Exam({
      userId: req.user.id,
      fileName,
      patientInfo: aiResponse.paciente,
      aiAnalysis: aiResponse,
      severity: aiResponse.riesgo
    });

    await exam.save();

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

// === HISTORIAL, DETALLE ===
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