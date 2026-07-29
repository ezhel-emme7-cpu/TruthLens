// api/analyze-image.js
// ─────────────────────────────────────────────
// La API key de Anthropic vive SOLO aquí (variable de entorno del
// servidor). El navegador nunca la ve. Cada análisis requiere una
// licencia activa (LemonSqueezy) y respeta el límite mensual real de
// su plan — no hay tier "ilimitado" en ningún plan.

const { validateLicense } = require('./_lemonsqueezy');
const { getUsage, incrementUsage } = require('./_usage');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_B64_CHARS = 8 * 1024 * 1024; // ~6MB de imagen real tras compresión a 1024px

function buildSystemPrompt() {
  return (
    'Eres un detector forense especializado en imágenes generadas por inteligencia artificial. ' +
    'Analiza la imagen con precision tecnica y entrega un veredicto estructurado.\n\n' +
    'Examina estas señales:\n' +
    '1. Textura de piel: uniformidad antinatural, ausencia de poros, suavizado excesivo\n' +
    '2. Cabello y bordes: patrones repetidos, bordes perfectos o difuminados artificialmente\n' +
    '3. Ojos y reflejos: asimetria imposible, brillos identicos, iris generado\n' +
    '4. Manos: numero anomalo de dedos, anatomia imposible, fusion de elementos\n' +
    '5. Fondo: geometria repetida, elementos incoherentes, difuminado artificial\n' +
    '6. Iluminacion: direccion imposible, sombras inconsistentes\n' +
    '7. Ruido: ausencia de grano fotografico natural, artefactos de red convolucional\n' +
    '8. Texto en imagen: distorsion tipografica\n\n' +
    'Responde SOLO con JSON valido, sin markdown ni texto adicional. ' +
    'El JSON debe tener exactamente estas claves: ' +
    'veredicto (string: IA o REAL o SOSPECHOSO), ' +
    'confianza (numero 0-100), ' +
    'senales (array de 3 strings en español), ' +
    'modelo_probable (string o null), ' +
    'resumen (string, una oracion).\n\n' +
    'Reglas: usa "IA" cuando hay señales claras de generacion artificial. ' +
    'Usa "REAL" cuando las caracteristicas son consistentes con fotografia autentica. ' +
    'Usa "SOSPECHOSO" cuando las señales son ambiguas.'
  );
}

function parseResult(raw) {
  const clean = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e1) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch (e2) {
        /* sigue al throw de abajo */
      }
    }
    throw new Error('La respuesta no contiene JSON válido.');
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'El servidor no tiene configurada ANTHROPIC_API_KEY. Revisa las variables de entorno en Vercel.'
    });
  }

  const body = req.body || {};
  const { image_base64, mime, license_key } = body;

  if (!image_base64 || !mime) {
    return res.status(400).json({ error: 'Falta la imagen a analizar.' });
  }
  if (image_base64.length > MAX_B64_CHARS) {
    return res.status(413).json({ error: 'La imagen es demasiado grande.' });
  }

  // 1. Licencia válida y activa — obligatoria en este endpoint.
  const license = await validateLicense(license_key);
  if (!license.valid) {
    return res.status(402).json({
      error: 'Licencia inválida o vencida.',
      code: 'LICENSE_REQUIRED'
    });
  }

  // 2. Límite mensual REAL del plan — ningún plan es ilimitado.
  const usedSoFar = await getUsage(license_key);
  if (usedSoFar >= license.planLimit) {
    return res.status(429).json({
      error: 'Alcanzaste el límite de ' + license.planLimit + ' análisis de tu plan ' + license.planName + ' este mes.',
      code: 'PLAN_LIMIT_REACHED',
      plan_name: license.planName,
      usage: { usados: usedSoFar, limite: license.planLimit }
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: buildSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: image_base64 } },
              { type: 'text', text: 'Analiza esta imagen y devuelve el JSON.' }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(function () {
        return {};
      });
      throw new Error(errData.error ? errData.error.message : 'Error API ' + response.status);
    }

    const data = await response.json();
    let raw = '';
    if (data.content && data.content.length) {
      for (const block of data.content) {
        if (block.type === 'text') {
          raw = block.text;
          break;
        }
      }
    }

    const result = parseResult(raw);
    if (!result.señales && result.senales) result.señales = result.senales;
    if (!result.veredicto) throw new Error('Respuesta incompleta del modelo.');

    // 3. Solo se cuenta contra el límite si el análisis tuvo éxito.
    const newCount = await incrementUsage(license_key);

    result.plan_name = license.planName;
    result.usage = { usados: newCount, limite: license.planLimit };

    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Error al analizar la imagen.' });
  }
};
