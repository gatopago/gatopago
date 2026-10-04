import { createHash } from 'node:crypto';

const css =
  'body{margin:0;background:#fff8f0;color:#0b0b0f;font:18px/1.6 system-ui,sans-serif}main{max-width:36rem;margin:8vh auto;padding:24px}h1{line-height:1.2}a{display:inline-block;padding:14px 20px;color:#0b0b0f;background:#ff503b;border:2px solid #0b0b0f;font-weight:700;text-decoration:none}a:focus-visible{outline:3px solid #21638b;outline-offset:5px}section{border-top:1px solid #c5b8aa;margin-top:28px;padding-top:20px}';
export const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="gatopago-offline" content="v3"><title>Sin conexión — GatoPago</title><style>${css}</style></head><body><main><p>GatoPago</p><h1>No pudimos conectar</h1><p>Comprueba tu conexión y vuelve a abrir la app. No podemos confirmar saldos ni pagos desde esta pantalla.</p><p>No reenviaremos ninguna operación automáticamente. Si estabas pagando, revisa su estado al volver antes de intentarlo otra vez.</p><a href="/app">Volver a la app</a><section lang="en"><h2>We could not connect</h2><p>Check your connection and open the app again. This screen cannot confirm balances or payments.</p><p>We will not retry any operation automatically. If you were paying, check its status before trying again.</p><a href="/app?lang=en">Open the app</a></section></main></body></html>`;

export const OFFLINE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'X-GatoPago-Offline': 'v3',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'none'; style-src 'sha256-${createHash('sha256').update(css).digest('base64')}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
};
