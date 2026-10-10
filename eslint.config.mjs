import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'output/**',
    '.playwright-cli/**',
    'next-env.d.ts',
    'public/**',
    '!public/',
    '!public/sw.js',
  ]),
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': hooks, '@next/next': next },
    rules: { ...hooks.configs.recommended.rules, ...next.configs['core-web-vitals'].rules },
  },
  // The shared-link cards are drawn by Satori, which takes plain <img> tags, never next/image.
  { files: ['src/og/**'], rules: { '@next/next/no-img-element': 'off' } },
]);
