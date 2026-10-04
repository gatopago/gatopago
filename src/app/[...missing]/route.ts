const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Página no encontrada — GatoPago</title></head><body style="margin:0;background:#fff8f0;color:#0b0b0f;font:18px/1.6 system-ui,sans-serif"><main style="max-width:36rem;margin:8vh auto;padding:24px"><p>GatoPago</p><h1>No encontramos esta página</h1><p>Comprueba el enlace o vuelve al inicio. No se realizó ninguna operación.</p><a href="/">Volver a GatoPago</a><section lang="en"><h2>Page not found</h2><p>Check the link or return to the home page. No operation was performed.</p><a href="/en">Back to GatoPago</a></section></main></body></html>`;

export function GET() {
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src-attr 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
