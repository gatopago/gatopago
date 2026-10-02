// Actual landing components and styles. No Next server, account services or funds.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontDirectory = resolve(web, 'node_modules/@fontsource-variable/recursive');
const fonts = await readFile(resolve(fontDirectory, 'index.css'), 'utf8');
const fontFiles = [...new Set([...fonts.matchAll(/url\(\s*['"]?(\.\/files\/[^'"\s)]+)['"]?\s*\)/g)].map(match => match[1]))];
let fontCss = fonts;
for (const path of fontFiles) fontCss = fontCss.replaceAll(path, `data:font/woff2;base64,${(await readFile(resolve(fontDirectory, path))).toString('base64')}`);
const styles = await Promise.all(['src/app/base.css', 'src/marketing/landing.css'].map(async path => {
  const from = resolve(web, path);
  return (await postcss([tailwind()]).process(await readFile(from, 'utf8'), { from })).css;
}));
const bundle = await build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  loader: { '.webp': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'standalone-image', setup(builder) {
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'standalone' }));
    builder.onLoad({ filter: /^image$/, namespace: 'standalone' }, () => ({ loader: 'tsx', resolveDir: web,
      contents: 'export default function Image({src, unoptimized, ...props}) { return <img src={typeof src === "string" ? src : src.src} {...props} />; }' }));
  } }], stdin: { resolveDir: web, loader: 'tsx', contents: `
    import { StrictMode } from 'react';
    import { createRoot } from 'react-dom/client';
    import { Landing } from './src/marketing/Landing';
    createRoot(document.getElementById('root')).render(<StrictMode><Landing lang={location.pathname === '/en' ? 'en' : 'es'} /></StrictMode>);
  ` } });
const logo = await readFile(resolve(web, 'public/Logo_gatopago.svg'));
createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.writeHead(405); res.end(); }
  else if (req.url === '/' || req.url === '/en') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="${req.url === '/en' ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>GatoPago landing — local visual check</title><style>${fontCss + styles.join('\n')}</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>`);
  } else if (req.url === '/harness.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/Logo_gatopago.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end(logo); }
  else { res.writeHead(404); res.end('Not a Next.js application route.'); }
}).listen(4184, '127.0.0.1', () => console.log('Landing harness http://127.0.0.1:4184 PID=' + process.pid));
