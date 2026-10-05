import { buildBrowser, styles, webRoot as web } from './harness.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

const fontDirectory = resolve(web, 'node_modules/@fontsource-variable/recursive');
const fonts = await readFile(resolve(fontDirectory, 'index.css'), 'utf8');
const fontFiles = [
  ...new Set(
    [...fonts.matchAll(/url\(\s*['"]?(\.\/files\/[^'"\s)]+)['"]?\s*\)/g)].map((match) => match[1]),
  ),
];
let fontCss = fonts;
for (const path of fontFiles)
  fontCss = fontCss.replaceAll(
    path,
    `data:font/woff2;base64,${(await readFile(resolve(fontDirectory, path))).toString('base64')}`,
  );
const css = await styles(['src/app/base.css', 'src/marketing/landing.css']);
const bundle = await buildBrowser({
  stdin: {
    contents: `
    import { StrictMode } from 'react';
    import { createRoot } from 'react-dom/client';
    import { Landing } from './src/marketing/Landing';
    createRoot(document.getElementById('root')).render(<StrictMode><Landing lang={location.pathname === '/en' ? 'en' : 'es'} /></StrictMode>);
  `,
  },
});
const logo = await readFile(resolve(web, 'public/Logo_gatopago.svg'));
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end();
  } else if (req.url === '/' || req.url === '/en') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><html lang="${req.url === '/en' ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>GatoPago landing — local visual check</title><style>${fontCss + css}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`,
    );
  } else if (req.url === '/harness.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(bundle.outputFiles[0].text);
  } else if (req.url === '/Logo_gatopago.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(logo);
  } else {
    res.writeHead(404);
    res.end('Not a Next.js application route.');
  }
}).listen(4184, '127.0.0.1', () =>
  console.log('Landing harness http://127.0.0.1:4184 PID=' + process.pid),
);
