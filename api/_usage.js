// api/_usage.js — helper compartido, NO es un endpoint (empieza con "_").
// ─────────────────────────────────────────────
// Cuenta cuántos análisis ha hecho cada licencia en el mes en curso,
// para poder aplicar el límite real de su plan (nunca "ilimitado").
//
// Usa Vercel KV si está configurado (persistente y compartido entre
// todas las instancias serverless — lo recomendado para producción).
// Si KV no está disponible todavía, cae a un contador en memoria: sirve
// para probar el flujo completo, pero cada instancia serverless tiene
// su propia memoria, así que NO es un límite 100% confiable a escala.
// Actívalo agregando el add-on de Vercel KV desde el dashboard del
// proyecto — no requiere cambios de código, solo variables de entorno.

let kv = null;
try {
  kv = require('@vercel/kv').kv;
} catch (e) {
  kv = null;
}

const memoryUsage = new Map(); // key -> count (fallback, no persistente entre instancias)

function monthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function usageKey(licenseKey) {
  return 'usage:' + licenseKey + ':' + monthKey();
}

/**
 * Devuelve cuántos análisis ha consumido esta licencia en el mes actual.
 */
async function getUsage(licenseKey) {
  const key = usageKey(licenseKey);
  if (kv) {
    try {
      const count = await kv.get(key);
      return Number(count) || 0;
    } catch (e) {
      // sigue al fallback de memoria
    }
  }
  return memoryUsage.get(key) || 0;
}

/**
 * Incrementa en 1 el conteo del mes y devuelve el nuevo total.
 */
async function incrementUsage(licenseKey) {
  const key = usageKey(licenseKey);
  if (kv) {
    try {
      const newCount = await kv.incr(key);
      // TTL de 40 días: sobrevive el mes completo y expira solo.
      await kv.expire(key, 40 * 24 * 60 * 60);
      return newCount;
    } catch (e) {
      // sigue al fallback de memoria
    }
  }
  const current = (memoryUsage.get(key) || 0) + 1;
  memoryUsage.set(key, current);
  return current;
}

module.exports = { getUsage, incrementUsage };
