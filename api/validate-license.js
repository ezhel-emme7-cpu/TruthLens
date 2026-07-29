// api/validate-license.js
// ─────────────────────────────────────────────
// Endpoint liviano usado al activar la licencia en la interfaz (botón
// "Activar"). No gasta tokens de Claude. Devuelve el plan (Basic/Pro) y
// cuántos análisis lleva usados este mes, para que el frontend muestre
// un número real desde el primer momento — nunca "ilimitado".
//
// La validación real y obligatoria de cada análisis vuelve a ocurrir
// dentro de analyze-image.js / analyze-text.js, así que nadie puede
// falsear el estado "activo" manipulando el navegador.

const { validateLicense } = require('./_lemonsqueezy');
const { getUsage } = require('./_usage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, error: 'Método no permitido.' });
  }

  const { license_key } = req.body || {};
  if (!license_key || typeof license_key !== 'string') {
    return res.status(400).json({ valid: false, error: 'Falta el código de licencia.' });
  }

  const license = await validateLicense(license_key);
  if (!license.valid) {
    return res.status(200).json({ valid: false, status: 'invalid' });
  }

  const usedSoFar = await getUsage(license_key);

  return res.status(200).json({
    valid: true,
    status: 'active',
    plan_name: license.planName,
    usage: { usados: usedSoFar, limite: license.planLimit }
  });
};
