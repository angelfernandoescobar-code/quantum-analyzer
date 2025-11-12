// backend/routes/exams.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const unzipper = require('unzipper');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const Exam = require('../models/Exam');

const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const productos4Life = JSON.parse(fs.readFileSync(path.join(__dirname, '../4life-products.json'), 'utf-8'));

// === EXTRAER TEXTO DE HTML ===
function extraerTextoHTML(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// === RESUMIR ARCHIVO ===
async function resumirArchivo(tipo, datos, archivo) {
  const prompt = `
Resumen médico: solo parámetros anormales con valor real y rango normal.  
Formato:  
- Parámetro: valor (normal: rango) → impacto  
Máx 10 líneas.

Archivo: ${archivo}
Datos: ${tipo === 'json' ? JSON.stringify(datos).substring(0, 3000) : datos.substring(0, 3000)}
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
    return `Error: ${archivo}`;
  }
}

// === ANALIZAR ZIP (CON SOPORTE HTML) ===
router.post('/analyze', upload.single('zip'), async (req, res) => {
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

    const processFile = async (file) => {
      const filePath = path.join(extractPath, file);
      const ext = path.extname(file).toLowerCase();

      // === JSON ===
      if (ext === '.json') {
        try {
          const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const resumen = await resumirArchivo('json', jsonData, file);
          resumenes.push(resumen);

          if (patientInfo.nombre === 'No especificado') {
            const posiblesNombres = [
              jsonData.paciente, jsonData.nombre, jsonData.name, jsonData.patient,
              jsonData.PatientName, jsonData['Nombre del Paciente'], jsonData['nombre_paciente'],
              jsonData.Nombre, jsonData.fullName, jsonData['full_name'], jsonData.Patient,
              jsonData['Patient Name']
            ].filter(Boolean);
            if (posiblesNombres.length > 0) patientInfo.nombre = posiblesNombres[0];
          }

          const edad = jsonData.edad || jsonData.age || jsonData.Edad || jsonData.Age;
          if (edad && (!patientInfo.edad || patientInfo.edad === 'N/A')) patientInfo.edad = edad;

          const sexo = jsonData.sexo || jsonData.gender || jsonData.Sexo || jsonData.Gender || jsonData.sexo_biologico;
          if (sexo && (!patientInfo.sexo || patientInfo.sexo === 'N/A')) patientInfo.sexo = sexo;

          const peso = parseFloat(jsonData.peso || jsonData.weight || jsonData.Peso || jsonData.Weight || 0);
          if (peso > 0 && patientInfo.peso === '0') patientInfo.peso = peso.toString();

          const estatura = parseFloat(jsonData.estatura || jsonData.height || jsonData.Estatura || jsonData.Height || 0);
          if (estatura > 0 && patientInfo.estatura === '0') patientInfo.estatura = estatura.toString();
        } catch (e) {}
      }

      // === HTML / HTM ===
      if (ext === '.html' || ext === '.htm') {
        const html = fs.readFileSync(filePath, 'utf-8');
        const texto = extraerTextoHTML(html);
        const resumen = await resumirArchivo('html', texto, file);
        resumenes.push(resumen);

        // === EXTRAER DATOS DEL PACIENTE DEL HTML ===
        if (patientInfo.nombre === 'No especificado') {
          const nombreMatch = texto.match(/Nombre[:\s]*([^,;\n]+)/i);
          if (nombreMatch) patientInfo.nombre = nombreMatch[1].trim();
        }

        if (!patientInfo.edad || patientInfo.edad === 'N/A') {
          const edadMatch = texto.match(/Edad[:\s]*([0-9]+)/i);
          if (edadMatch) patientInfo.edad = edadMatch[1];
        }

        if (!patientInfo.sexo || patientInfo.sexo === 'N/A') {
          const sexoMatch = texto.match(/Sexo[:\s]*([^\s,;\n]+)/i);
          if (sexoMatch) patientInfo.sexo = sexoMatch[1].trim();
        }

        if (patientInfo.peso === '0') {
          const pesoMatch = texto.match(/\(.*?([0-9]+)kg/i) || texto.match(/([0-9]+)\s*kg/i);
          if (pesoMatch) patientInfo.peso = pesoMatch[1];
        }

        if (patientInfo.estatura === '0') {
          const estaturaMatch = texto.match(/\(.*?([0-9]+)cm/i) || texto.match(/([0-9]+)\s*cm/i);
          if (estaturaMatch) patientInfo.estatura = estaturaMatch[1];
        }
      }
    };

    for (let i = 0; i < files.length; i += 8) {
      const batch = files.slice(i, i + 8);
      await Promise.all(batch.map(processFile));
    }

    // === CALCULAR IMC ===
    const peso = parseFloat(patientInfo.peso) || 0;
    const estatura = parseFloat(patientInfo.estatura) || 0;
    if (peso > 0 && estatura > 0) {
      patientInfo.imc = (peso / Math.pow(estatura / 100, 2)).toFixed(1);
    }

    if (resumenes.length === 0) throw new Error('No datos');

    const listaProductos = Object.entries(productos4Life)
      .map(([n, i]) => `"${n}": ${i.beneficio}`)
      .join('\n');

    const promptFinal = `
Paciente: ${patientInfo.nombre}, ${patientInfo.edad} años, IMC: ${patientInfo.imc}

RESÚMENES CON VALORES:
${resumenes.join('\n\n---\n\n')}

**ANÁLISIS OBLIGATORIO (12 sistemas):**
hepatico, cardiovascular, renal, endocrino, digestivo, inmunologico, oseo, nervioso, respiratorio, muscular, hematologico, otros.

Por sistema:
- 3-5 oraciones detalladas
- Incluir parámetros alterados con valor real y rango normal
- Riesgo: BAJO/MEDIO/ALTO
- Recomendaciones 4Life: TODOS los necesarios (sin límite), con beneficio claro

Productos:
${listaProductos}

**RESPONDE SOLO EN FORMATO JSON VÁLIDO. Usa este esquema exacto:**
{
  "paciente": ${JSON.stringify(patientInfo)},
  "resumen": "4-5 líneas...",
  "analisis_por_sistemas": {
    "hepatico": "3-5 oraciones con valores...",
    "cardiovascular": "...",
    ...
  },
  "riesgo": "ALTO",
  "recomendaciones_4life": ["Producto: beneficio claro"]
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

// === HISTORIAL PÚBLICO ===
router.get('/', async (req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar historial' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'No encontrado' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar examen' });
  }
});

module.exports = router;