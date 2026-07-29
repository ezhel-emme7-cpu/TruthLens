// api/_lemonsqueezy.js — helper compartido, NO es un endpoint (empieza con "_").
// ─────────────────────────────────────────────
// Valida un código de licencia contra la License API pública de
// LemonSqueezy y resuelve a qué plan (Basic/Pro) corresponde según el
// variant_id de la compra.

// Configura estos IDs cuando crees las variantes en tu producto de
// LemonSqueezy (Dashboard → producto → variantes → copiar el ID).
const PLANS = {
  [process.env.PLAN_BASIC_VARIANT_ID || '']: {
    name: process.env.PLAN_BASIC_NAME || 'Basic',
    limit: Number(process.env.PLAN_BASIC_LIMIT || 300)
  },
  [process.env.PLAN_PRO_VARIANT_ID || '']: {
    name: process.env.PLAN_PRO_NAME || 'Pro',
    limit: Number(process.env.PLAN_PRO_LIMIT || 800)
  }
};

// Si el variant_id de la licencia no coincide con ninguno configurado
// arriba (por ejemplo, todavía no configuraste las variables de
// entorno), se usa este límite conservador en vez de fallar o dejar
// pasar análisis sin tope.
const DEFAULT_PLAN = {
  name: process.env.DEFAULT_PLAN_NAME || 'Plan',
  limit: Number(process.env.DEFAULT_PLAN_LIMIT || 150)
};

// ── Código de prueba (opcional) ─────────────────────────────────────
// Sirve para verificar que el análisis con Claude funciona ANTES de
// tener LemonSqueezy configurado. Si defines TEST_LICENSE_KEY en
// Vercel, ese código exacto se acepta como licencia válida sin llamar
// a LemonSqueezy. Con un límite bajo (10/mes por defecto) para no
// gastar de más mientras pruebas.
// Quítalo (borra la variable de entorno) antes de lanzar en público —
// cualquiera que lo conozca podría usarlo.
const TEST_LICENSE_KEY = process.env.TEST_LICENSE_KEY || '';
const TEST_PLAN = {
  name: 'Prueba',
  limit: Number(process.env.TEST_LICENSE_LIMIT || 10)
};

/**
 * Valida el código de licencia contra LemonSqueezy.
 * @returns {Promise<{valid:boolean, planName:string, planLimit:number}>}
 */
async function validateLicense(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { valid: false, planName: null, planLimit: 0 };
  }

  // Atajo de prueba — ver comentario arriba.
  if (TEST_LICENSE_KEY && licenseKey === TEST_LICENSE_KEY) {
    return { valid: true, planName: TEST_PLAN.name, planLimit: TEST_PLAN.limit };
  }

  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: licenseKey })
    });
    const data = await r.json();

    const isActive = !!(
      data &&
      data.valid === true &&
      data.license_key &&
      data.license_key.status === 'active'
    );
    if (!isActive) return { valid: false, planName: null, planLimit: 0 };

    const variantId = data.meta && data.meta.variant_id ? String(data.meta.variant_id) : '';
    const plan = PLANS[variantId] || DEFAULT_PLAN;

    return { valid: true, planName: plan.name, planLimit: plan.limit };
  } catch (e) {
    return { valid: false, planName: null, planLimit: 0 };
  }
}

module.exports = { validateLicense };
