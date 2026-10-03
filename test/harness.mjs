import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

export const webRoot = resolve(import.meta.dirname, '..');

export async function styles(paths = ['src/app/base.css', 'src/auth/auth.css', 'src/consumer/consumer.css']) {
  return (await Promise.all(paths.map(async path => {
    const from = resolve(webRoot, path);
    return (await postcss([tailwind()]).process(await readFile(from, 'utf8'), { from })).css;
  }))).join('\n');
}

const nextComponents = {
  name: 'harness-next-components',
  setup(builder) {
    builder.onResolve({ filter: /^next\/(link|image)$/ }, input => ({ path: input.path, namespace: 'harness-next' }));
    builder.onLoad({ filter: /.*/, namespace: 'harness-next' }, input => ({ loader: 'tsx', resolveDir: webRoot,
      contents: input.path === 'next/image' ? `
        export default function Image({ src, unoptimized, priority, fill, ...props }) {
          return <img src={typeof src === 'string' ? src : src.src} {...props} />;
        }` : `
        export default function Link({ href, children, prefetch, replace, onNavigate, onClick, ...props }) {
          return <a href={href} {...props} onClick={event => {
            onClick?.(event);
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank') return;
            onNavigate?.({ preventDefault: () => event.preventDefault() });
          }}>{children}</a>;
        }` }));
  },
};

export function buildBrowser({ stdin, plugins = [], ...options }) {
  return build({ bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    loader: { '.webp': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    ...options, plugins: [nextComponents, ...plugins], stdin: { resolveDir: webRoot, loader: 'tsx', ...stdin } });
}
