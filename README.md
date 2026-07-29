# TruthLens Pro — listo para Vercel

## Qué incluye esta versión

| Área | Cómo quedó |
|---|---|
| API key de Anthropic | Vive **solo** en el servidor (variable de entorno de Vercel), nunca en el navegador |
| Planes de suscripción | **Basic y Pro, cada uno con límite mensual real** — ningún plan es "ilimitado" |
| Acceso | El usuario activa un código de licencia de LemonSqueezy, no pega su propia API key |
| Demo gratis | 3 análisis por sesión, **máximo 2 sesiones nuevas al mes**, cada sesión caduca sola a la hora de abierta |
| Módulos | **Imagen** y **Texto** (con resaltado de fragmentos citados), seleccionables por pestañas |
| Estética | Acento de color que **rota entre 7 tonos discretos** (violeta, azul eléctrico, verde limón, amarillo mantequilla, naranja brillante, rojo neón, rosa eléctrico) cada vez que se entra a la app |
| Copy visible al usuario | Nunca menciona "Claude Vision" ni "Anthropic" — solo aparece en comentarios internos del código, para ti |

---

## Estructura de archivos

```
truthlens-pro.html          ← frontend: módulos Imagen + Texto, tema rotativo
api/
  analyze-image.js          ← licencia + límite de plan + Claude Vision
  analyze-text.js           ← licencia + límite de plan + Claude (texto)
  validate-license.js       ← activa la licencia en la UI, devuelve plan y uso actual
  _lemonsqueezy.js           ← helper: valida licencia y resuelve el plan (no es endpoint)
  _usage.js                  ← helper: cuenta mensual persistente vía Vercel KV (no es endpoint)
vercel.json                  ← configuración de las funciones
package.json                 ← incluye @vercel/kv como dependencia
.env.example                 ← todas las variables de entorno documentadas
```

Los dos archivos que empiezan con `_` no son rutas — es la convención de Vercel para helpers compartidos dentro de `/api`, así que no aparecen como endpoints públicos.

---

## Cómo probar esto de verdad (importante)

Si abres `truthlens-pro.html` directo desde tu PC, o lo ves en la vista previa de Claude, **nunca va a llamar a Claude** — y eso es correcto, no un error. Ese archivo por sí solo no tiene servidor: `/api/analyze-image` no existe en ningún lado hasta que lo despliegas en Vercel. Sin backend, la app cae siempre al análisis local (EXIF/heurísticas para imagen, señales lingüísticas para texto) — que es justo el comportamiento de respaldo que se diseñó para cuando el servidor no responde.

Para probar la parte que sí usa Claude:

**1. Sube esta carpeta completa a tu repo `truthlens` en GitHub**, reemplazando lo que subiste la vez pasada (esa subida no tenía la carpeta `api/` todavía).

**2. En Vercel, agrega dos variables de entorno:**

| Variable | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu key real |
| `TEST_LICENSE_KEY` | invéntate un código, ej. `PRUEBA-EZHEL-2026` |

**3. Espera a que Vercel termine el deploy** (te da una URL tipo `truthlens-abc123.vercel.app`).

**4. Abre esa URL** (no el archivo local, no la vista previa de aquí), clic en **"¿Tienes licencia?"** en la barra superior, pega el mismo código que pusiste en `TEST_LICENSE_KEY`, y dale **"Activar"**.

**5. Sube una imagen o pega un texto.** Si el chip superior cambia a "Prueba" y el análisis tarda unos segundos (en vez de los ~2.8s fijos del modo local), estás hablando con Claude de verdad.

Cuando ya tengas las variantes de LemonSqueezy configuradas (Paso 3 más abajo), borra `TEST_LICENSE_KEY` de Vercel — es una puerta de prueba, no debe quedar activa en producción.

---



```
git add .
git commit -m "TruthLens v2: planes con límite real, módulo de texto, tema rotativo"
git push
```

## Paso 2 — Variables de entorno en Vercel

En **Settings → Environment Variables**, como mínimo:

| Variable | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | tu key de `console.anthropic.com/settings/keys` |

El resto (`PLAN_BASIC_LIMIT`, `PLAN_PRO_LIMIT`, etc.) ya vienen con valores por defecto razonables (300 y 800 análisis/mes) — ajústalos cuando definas los precios finales de cada plan. Todo el detalle de qué configurar está comentado en `.env.example`.

## Paso 3 — Conectar tus planes de LemonSqueezy a los límites

1. En tu producto de LemonSqueezy, activa **"License Keys"** (pestaña Licensing) y crea las variantes **Basic** y **Pro**.
2. Copia el `variant_id` de cada una (aparece en la URL al abrir la variante en el dashboard).
3. En Vercel, agrega:
   - `PLAN_BASIC_VARIANT_ID` = el ID de la variante Basic
   - `PLAN_PRO_VARIANT_ID` = el ID de la variante Pro
4. Ajusta `PLAN_BASIC_LIMIT` y `PLAN_PRO_LIMIT` al número de análisis mensuales que quieras dar en cada plan.

Si una licencia no coincide con ningún `variant_id` configurado (por ejemplo, mientras todavía no terminas este paso), cae al plan por defecto (`DEFAULT_PLAN_LIMIT`, 150 análisis) — nunca queda un hueco sin límite.

## Paso 4 — Activar Vercel KV (recomendado antes de lanzar)

El conteo de "cuántos análisis lleva cada licencia este mes" necesita persistir entre invocaciones serverless. Sin esto, el sistema funciona pero con un fallback en memoria que no es confiable a escala (cada instancia de Vercel tiene su propia memoria).

Para activarlo: en tu proyecto de Vercel → **Storage → Create Database → KV**. Al conectarlo, Vercel agrega las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` automáticamente — no hay que tocar código, `_usage.js` ya las detecta solo.

## Paso 5 — Conectar los botones "Ver planes"

Dos enlaces con `href="#"` de marcador de posición:
- `id="apiUpgradeBtn"` (panel superior)
- `id="footerUpgradeLink"` (pie de página)

Reemplaza el `#` por tu checkout real de LemonSqueezy cuando lo tengas.

---

## Sobre el demo gratuito (sin licencia)

La cuota es intencionalmente limitada y compartida entre Imagen y Texto (no son cupos independientes):

- 3 análisis por sesión
- Una sesión dura como máximo 1 hora desde que se abre
- Máximo 2 sesiones nuevas por mes (se cuenta al mes calendario)

Esto vive en `localStorage` del navegador — es una fricción razonable para un demo, no una barrera anti-fraude absoluta (alguien que borre su `localStorage` puede reiniciar el contador). Es el mismo principio que ya discutimos: es preferible una fricción simple y honesta a un sistema anti-fraude pesado para una función que de por sí es gratuita.

## Sobre el tema de color rotativo

El script que elige el color vive al final del `<head>`, antes de que se renderice el `<body>` — así no hay parpadeo del color anterior al cargar. Guarda un índice en `localStorage` (`tl_theme_idx`) y avanza al siguiente tono en cada visita, ciclando entre los 7. Los colores semánticos de veredicto (verde = auténtico/humano, rojo = IA, ámbar = incierto) **no** rotan — son fijos a propósito, para que el color nunca se confunda con el resultado del análisis.

## Sobre el módulo de Texto

Reconstruido siguiendo tu documento de arquitectura (`truthlens-pro-arquitectura.md`): mismo patrón híbrido que Imagen (local → API → fallback a local si falla), three heurísticas locales (uniformidad de oraciones, muletillas típicas de LLM, diversidad léxica), y resaltado de fragmentos citados textualmente por el modelo usando `<mark>`. El veredicto usa `HUMANO` en vez de `REAL` (así lo especifica tu documento), y el contador de 3 análisis gratis se comparte con el módulo de Imagen, no es una cuota aparte.

## Sobre el BYOK (oculto)

El flujo para que un usuario pusiera su propia API key de Anthropic ya no está en la interfaz. Si más adelante quieres reactivarlo como opción oculta para usuarios avanzados, el patrón anterior sigue disponible en el historial de versiones del repo.
