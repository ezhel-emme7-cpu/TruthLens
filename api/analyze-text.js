// api/analyze-text.js
// ─────────────────────────────────────────────
// Mismo esquema que analyze-image.js: licencia obligatoria, límite
// mensual real por plan (nunca ilimitado), key de Anthropic solo aquí.

const { validateLicense } = require('./_lemonsqueezy');
const { getUsage, incrementUsage } = require('./_usage');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_TEXT_CHARS = 20000; // ~ 3,000-4,000 palabras, margen amplio para el uso normal

function buildTextSystemPrompt() {
  return (
    'Eres un detector forense especializado en identificar texto generado por inteligencia artificial. ' +
    'Analiza el texto con precision tecnica y entrega un veredicto estructurado.\n\n' +
    'Examina estas señales:\n' +
    '1. Uniformidad estructural: longitud y ritmo de oraciones demasiado regular\n' +
    '2. Conectores y muletillas tipicas de modelos de lenguaje ("en resumen", "es importante destacar", "cabe mencionar")\n' +
    '3. Diversidad lexica: vocabulario optimizado o repeticion natural propia de escritura humana\n' +
    '4. Coherencia argumental artificial: transiciones perfectas sin digresiones humanas\n' +
    '5. Ausencia de errores tipograficos, coloquialismos o marcas idiomaticas regionales\n' +
    '6. Precision excesiva o genericidad en ejemplos y datos\n\n' +
    'Responde SOLO con JSON valido, sin markdown ni texto adicional. ' +
    'El JSON debe tener exactamente estas claves: ' +
    'veredicto (string: IA o HUMANO o SOSPECHOSO), ' +
    'confianza (numero 0-100), ' +
    'ai_prob (numero 0-100), ' +
    'senales (array de 3 strings en español explicando cada señal), ' +
    'modelo_probable (string: GPT, Claude, Gemini, u otro — o null si el veredicto es HUMANO), ' +
    'fragmentos (array de hasta 3 strings que sean COPIAS TEXTUALES EXACTAS del texto original, ' +
    'los pasajes mas caracteristicos del veredicto — nunca resumas o parafrasees estas citas), ' +
    'resumen (string, una oracion).\n\n' +
    'Reglas: usa "IA" cuando hay señales claras de generacion artificial. ' +
    'Usa "HUMANO" cuando las caracteristicas son consistentes con escritura humana. ' +
    'Usa "SOSPECHOSO" cuando las señales son ambiguas. ' +
    'Los fragmentos citados deben coincidir caracter por caracter con el texto original para poder resaltarlos.'
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
  const { text, license_key } = body;

  if (!text || typeof text !== 'string' || text.trim().split(/\s+/).length < 15) {
    return res.status(400).json({ error: 'El texto debe tener al menos 15 palabras.' });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return res.status(413).json({ error: 'El texto es demasiado largo.' });
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
  //    El contador se comparte con analyze-image.js (misma clave de uso
  //    por licencia y mes), igual que el demo local comparte cuota entre
  //    Imagen y Texto.
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
        max_tokens: 900,
        system: buildTextSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: 'Analiza este texto y devuelve el JSON:\n\n' + text
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
    if (!Array.isArray(result.fragmentos)) result.fragmentos = [];

    // Solo se cuenta contra el límite si el análisis tuvo éxito.
    const newCount = await incrementUsage(license_key);

    result.plan_name = license.planName;
    result.usage = { usados: newCount, limite: license.planLimit };

    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Error al analizar el texto.' });
  }
};
