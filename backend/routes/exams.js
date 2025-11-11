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
const puppeteer = require('puppeteer');

const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CARGAR PRODUCTOS REALES
const productos4Life = JSON.parse(fs.readFileSync(path.join(__dirname, '../4life-products.json'), 'utf-8'));

// === ANALIZAR ZIP ===
router.post('/analyze', auth, upload.single('zip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió ZIP' });

  const zipPath = req.file.path;
  const extractPath = path.join(__dirname, '../extracted', Date.now().toString());
  const fileName = req.file.originalname;

  try {
    fs.mkdirSync(extractPath, { recursive: true });
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractPath })).promise();

    const files = fs.readdirSync(extractPath);
    let htmlContent = '', jsonData = {};

    for (const file of files) {
      const filePath = path.join(extractPath, file);
      const ext = path.extname(file).toLowerCase();
      if (ext === '.html' || ext === '.htm') htmlContent = fs.readFileSync(filePath, 'utf-8');
      if (ext === '.json') jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    if (!htmlContent) throw new Error('No se encontró HTML en el ZIP');

    const nombre = jsonData.paciente || 'No especificado';
    const edad = jsonData.edad || 'No especificada';
    const sexo = jsonData.sexo || 'No especificado';
    const peso = jsonData.peso || 'No especificado';
    const estatura = jsonData.estatura || 'No especificada';
    const imc = peso && estatura ? (peso / Math.pow(estatura / 100, 2)).toFixed(1) : 'No calculable';

    // LISTA DE PRODUCTOS PARA EL PROMPT
    const listaProductos = Object.entries(productos4Life)
      .map(([nombre, info]) => `"${nombre}": ${info.beneficio} | Forma: ${info.forma} | Dosis base: ${info.dosis} | Sistemas: ${info.sistemas.join(', ')}`)
      .join('\n');

    const prompt = `
Eres un médico funcional experto en 4Life Research (EE.UU.). Analiza **TODOS** los parámetros anormales del JSON/HTML.

**REGLAS ESTRICTAS:**
- Analiza por sistema: hepático, cardiovascular, óseo, inmunológico, endocrino, digestivo, otros.
- Para cada parámetro: valor actual vs rango normal, fisiología, causas, impacto.
- **NO hay productos base**. Solo recomendar lo que **realmente necesita el paciente**.
- **Máximo 8 productos**.
- **Dosis puede variar según gravedad** (ej: "2-3 cápsulas" si alto riesgo).
- **Fibre System Plus + PhytoLax** siempre juntos si hay estreñimiento o limpieza.
- **Essential Fatty Acid Complex** solo si lípidos o estrés oxidativo.
- **Forma exacta**: si es sobre → "disolver en agua", no "cápsulas".

**PRODUCTOS OFICIALES (elige solo de aquí):**
${listaProductos}

**FORMATO JSON EXACTO:**

{
  "paciente": { "nombre": "${nombre}", "edad": "${edad}", "sexo": "${sexo}", "peso": "${peso}", "estatura": "${estatura}", "imc": "${imc}" },
  "resumen": "3-4 líneas sobre sistemas afectados",
  "analisis_por_sistemas": { "hepatico": "...", "cardiovascular": "...", ... },
  "riesgo": "BAJO|MEDIO|ALTO",
  "recomendaciones_4life": [
    "Essential Fatty Acid Complex (2-3 cápsulas con comida x 3 meses): Soporte para triglicéridos elevados (1.8 vs <1.7)."
  ]
}

DATOS:
${JSON.stringify(jsonData, null, 2)}

HTML: ${htmlContent.substring(0, 20000)}...
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
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

// === HISTORIAL ===
router.get('/', auth, async (req, res) => {
  try {
    const exams = await Exam.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === DETALLE POR ID ===
router.get('/:id', auth, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Examen no encontrado' });
    if (exam.userId.toString() !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// === PDF ===
router.get('/pdf/:id', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Acceso denegado. No hay token.' });

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const exam = await Exam.findById(req.params.id);
    if (!exam || exam.userId.toString() !== decoded.user.id) {
      return res.status(404).send('No encontrado');
    }

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Informe - ${exam.fileName}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 40px; background: #f8f9fa; color: #2d3748; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          h1 { color: #06b6d4; text-align: center; margin-bottom: 30px; font-size: 28px; }
          .info { display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 15px; }
          .section { margin: 25px 0; padding: 18px; background: #f1f5f9; border-left: 5px solid #06b6d4; border-radius: 0 8px 8px 0; }
          .label { font-weight: bold; color: #06b6d4; font-size: 16px; margin-bottom: 8px; }
          ul { padding-left: 20px; margin: 10px 0; }
          li { margin: 7px 0; }
          .risk { display: inline-block; padding: 6px 12px; border-radius: 20px; font-weight: bold; color: white; font-size: 14px; }
          .risk.BAJO { background: #10b981; }
          .risk.MEDIO { background: #f59e0b; }
          .risk.ALTO { background: #ef4444; }
          .footer { text-align: center; margin-top: 50px; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Quantum Analyzer - Informe Médico</h1>
          <div class="info">
            <div><strong>Paciente:</strong> ${exam.patientInfo.nombre}</div>
            <div><strong>Edad:</strong> ${exam.patientInfo.edad}</div>
          </div>
          <div class="info">
            <div><strong>Peso:</strong> ${exam.patientInfo.peso} kg | <strong>Estatura:</strong> ${exam.patientInfo.estatura} cm | <strong>IMC:</strong> ${exam.patientInfo.imc}</div>
            <div><strong>Riesgo:</strong> <span class="risk ${exam.aiAnalysis.riesgo}">${exam.aiAnalysis.riesgo}</span></div>
          </div>

          <div class="section">
            <div class="label">Resumen</div>
            <p>${exam.aiAnalysis.resumen}</p>
          </div>

          <div class="section">
            <div class="label">Diagnóstico por Sistemas</div>
            <p>${Object.entries(exam.aiAnalysis.analisis_por_sistemas).map(([s, d]) => `<strong>${s.charAt(0).toUpperCase() + s.slice(1)}:</strong> ${d}`).join('<br><br>')}</p>
          </div>

          <div class="section">
            <div class="label">Plan de Suplementación 4Life Research (3 meses)</div>
            <ul>
              ${exam.aiAnalysis.recomendaciones_4life.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>

          <div class="footer">Generado por Quantum Analyzer © 2025 | IA Médica</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Informe_${exam.fileName.replace('.zip', '')}.pdf"`
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Error PDF:', err);
    res.status(500).json({ error: 'Error al generar PDF: ' + err.message });
  }
});

module.exports = router;