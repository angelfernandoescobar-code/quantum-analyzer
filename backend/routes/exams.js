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

// === RESUMIR ARCHIVO (gpt-4o-mini) ===
async function resumirArchivo(tipo, datos, archivo) {
  const prompt = `
Resumen médico: solo parámetros anormales.  
Formato:  
- Parámetro: valor (normal) → impacto breve  
Máx 8 líneas.

Archivo: ${archivo}
Datos: ${tipo === 'json' ? JSON.stringify(datos).substring(0, 3000) : datos.substring(0, 3000)}
`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.1
    });
    return res.choices[0].message.content.trim();
  } catch (err) {
    return `Error: ${archivo}`;
  }
}

// === ANALIZAR ZIP (12 SISTEMAS + PACIENTE + ANTI-429) ===
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
    let patientInfo = { nombre: 'No especificado', edad: 'N/A', sexo: 'N/A', peso: '0', estatura: '0', imc: 'N/A' };

    // === RESUMIR EN PARALELO (LOTES DE 8) ===
    const processFile = async (file) => {
      const filePath = path.join(extractPath, file);
      const ext = path.extname(file).toLowerCase();

      if (ext === '.json') {
        try {
          const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const resumen = await resumirArchivo('json', jsonData, file);
          resumenes.push(resumen);

          // EXTRAER PACIENTE DE CUALQUIER JSON
          if (jsonData.paciente && patientInfo.nombre === 'No especificado') {
            const peso = parseFloat(jsonData.peso) || 0;
            const estatura = parseFloat(jsonData.estatura) || 0;
            const imc = peso && estatura ? (peso / Math.pow(estatura / 100, 2)).toFixed(1) : 'N/A';
            patientInfo = {
              nombre: jsonData.paciente,
              edad: jsonData.edad || 'N/A',
              sexo: jsonData.sexo || 'N/A',
              peso: peso.toString(),
              estatura: estatura.toString(),
              imc
            };
          }
        } catch (e) {}
      }

      if (ext === '.html' || ext === '.htm') {
        const html = fs.readFileSync(filePath, 'utf-8');
        const resumen = await resumirArchivo('html', html, file);
        resumenes.push(resumen);
      }
    };

    for (let i = 0; i < files.length; i += 8) {
      const batch = files.slice(i, i + 8);
      await Promise.all(batch.map(processFile));
    }

    if (resumenes.length === 0) throw new Error('No datos');

    // === ANÁLISIS FINAL (FORZAR 12 SISTEMAS) ===
    const listaProductos = Object.entries(productos4Life)
      .map(([n, i]) => `"${n}": ${i.beneficio}`)
      .join('\n');

    const promptFinal = `
Paciente: ${patientInfo.nombre}, ${patientInfo.edad} años, IMC: ${patientInfo.imc}

RESÚMENES (${resumenes.length} archivos):
${resumenes.join('\n\n---\n\n')}

**ANÁLISIS OBLIGATORIO (12 sistemas):**
hepatico, cardiovascular, renal, endocrino, digestivo, inmunologico, oseo, nervioso, respiratorio, muscular, hematologico, otros.

Por sistema:
- 3-5 oraciones detalladas
- Riesgo: BAJO/MEDIO/ALTO
- Recomendaciones 4Life: máx 8

Productos:
${listaProductos}

**JSON EXACTO:**
{
  "paciente": ${JSON.stringify(patientInfo)},
  "resumen": "4-5 líneas...",
  "analisis_por_sistemas": {
    "hepatico": "3-5 oraciones...",
    "cardiovascular": "...",
    "renal": "...",
    "endocrino": "...",
    "digestivo": "...",
    "inmunologico": "...",
    "oseo": "...",
    "nervioso": "...",
    "respiratorio": "...",
    "muscular": "...",
    "hematologico": "...",
    "otros": "..."
  },
  "riesgo": "ALTO",
  "recomendaciones_4life": ["Producto (dosis): motivo"]
}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: promptFinal.substring(0, 24000) }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 3500
    });

    let aiResponse = JSON.parse(completion.choices[0].message.content);

    // === ASEGURAR 12 SISTEMAS ===
    const sistemasRequeridos = [
      'hepatico', 'cardiovascular', 'renal', 'endocrino', 'digestivo',
      'inmunologico', 'oseo', 'nervioso', 'respiratorio', 'muscular',
      'hematologico', 'otros'
    ];

    aiResponse.analisis_por_sistemas = aiResponse.analisis_por_sistemas || {};
    sistemasRequeridos.forEach(s => {
      if (!aiResponse.analisis_por_sistemas[s]) {
        aiResponse.analisis_por_sistemas[s] = 'No se detectaron alteraciones significativas en este sistema.';
      }
    });

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
    res.status(500).json({ error: 'Error: ' + err.message });
  }
});

// === HISTORIAL Y DETALLE ===
router.get('/', auth, async (req, res) => {
  const exams = await Exam.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(exams);
});

router.get('/:id', auth, async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam || exam.userId.toString() !== req.user.id) return res.status(404).json({ error: 'No encontrado' });
  res.json(exam);
});

module.exports = router;