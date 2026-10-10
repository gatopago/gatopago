import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import english from '../src/messages/en.json';
import spanish from '../src/messages/es.json';

/** Namespaces the public pages read as written (`getMessages`), not through `t`. */
const AS_WRITTEN = new Set(['Landing', 'Terms', 'Privacy', 'Legal']);

/** Every text with its full key: `Send.title`, `Activity.periods.today`, `Landing.signals.0.1`. */
const texts = (tree: object, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value]] : texts(value, `${prefix}${key}.`),
  );

/** The values a text takes (`{amount}`, `{count, plural, …}`) and its tags (`<accent>`). */
const argumentsOf = (text: string) => [...text.matchAll(/\{(\w+)[,}]/g)].map(([, name]) => name);
const tagsOf = (text: string) => [...text.matchAll(/<(\w+)>/g)].map(([, name]) => name);

/** Formats every text the way `t` and `t.rich` do, and returns what failed. */
function invalid(locale: 'es' | 'en', catalog: object) {
  const errors: string[] = [];
  const messages = Object.fromEntries(
    Object.entries(catalog).filter(([namespace]) => !AS_WRITTEN.has(namespace)),
  );
  const t = createTranslator({ locale, messages, onError: (error) => errors.push(error.message) });
  // Typed keys are checked when compiling; here every key is visited by its name.
  const translate = t as unknown as {
    (key: string, values: object): string;
    rich: (key: string, values: object) => unknown;
  };
  for (const [key, text] of texts(messages)) {
    const values = Object.fromEntries(argumentsOf(text).map((name) => [name, 1]));
    const tags = Object.fromEntries(tagsOf(text).map((tag) => [tag, (chunks: string) => chunks]));
    if (tagsOf(text).length) translate.rich(key, { ...values, ...tags });
    else translate(key, values);
  }
  return errors;
}

describe('texts', () => {
  it('say the same things in both languages, with the same values', () => {
    const spanishTexts = Object.fromEntries(texts(spanish));
    const englishTexts = Object.fromEntries(texts(english));
    expect(Object.keys(spanishTexts).sort()).toEqual(Object.keys(englishTexts).sort());
    for (const [key, text] of Object.entries(englishTexts)) {
      expect(new Set(argumentsOf(spanishTexts[key])), key).toEqual(new Set(argumentsOf(text)));
      expect(tagsOf(spanishTexts[key]), key).toEqual(tagsOf(text));
    }
  });

  it('are valid messages in both languages', () => {
    expect(invalid('es', spanish)).toEqual([]);
    expect(invalid('en', english)).toEqual([]);
  });
});

describe('the texts in the browser', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [join(dir, entry.name).replaceAll('\\', '/')]
          : [],
    );
  const sources = files('src').map((file) => [file, readFileSync(file, 'utf8')] as const);

  it('come from the layouts, in one language: nothing the browser loads imports a catalog', () => {
    const code = new Map(sources);
    // The catalogs, next-intl's request configuration and its server functions (its routing and
    // navigation are for the browser).
    const catalog =
      /from '[^']*(messages\/[^']*\.json|\/i18n\/(request|messages))'|from 'next-intl\/server'|import\(`[^`]*messages\//;
    const resolve = (from: string, specifier: string) => {
      const base = join(dirname(from), specifier).replaceAll('\\', '/');
      return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((name) => code.has(name));
    };
    // Every module reachable from a client component ends up in the browser's code.
    const reached = new Set<string>();
    const visit = (file: string) => {
      if (reached.has(file)) return;
      reached.add(file);
      const imports = code.get(file)!.replace(/^import type .*$/gm, '');
      for (const [, specifier] of imports.matchAll(/from '(\.[^']*)'/g)) {
        const target = resolve(file, specifier);
        if (target) visit(target);
      }
    };
    for (const [file, text] of sources) if (text.startsWith("'use client'")) visit(file);
    expect(reached.size).toBeGreaterThan(50);
    expect(
      [...reached].filter((file) =>
        catalog.test(code.get(file)!.replace(/^import type .*$/gm, '')),
      ),
    ).toEqual([]);
  });
});
