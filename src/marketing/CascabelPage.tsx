import Image, { type StaticImageData } from 'next/image';
import type { ReactNode } from 'react';
import { Link } from '../i18n/navigation';
import type { Locale, Messages } from 'next-intl';
import { CatGlyph } from './CatGlyph';
import { MeliSprite } from './MeliSprite';
import { LandingInteractions } from './LandingInteractions';
import { API_RESPONSE, apiExample } from './apiExample';
import { settings } from '../lib/settings';
import checkoutEn from './cascabel/checkout-en.webp';
import checkoutEs from './cascabel/checkout-es.webp';
import './docs.css';

const CHECKOUT: Record<Locale, StaticImageData> = { es: checkoutEs, en: checkoutEn };

/** A section's label and title, sized for full sentences (the landing's are for two words). */
function Heading({
  id,
  kicker,
  title,
  light,
}: {
  id: string;
  kicker: string;
  title: string;
  light?: boolean;
}) {
  return (
    <div>
      <p className={`meli-kicker ${light ? 'meli-kicker--light' : ''}`}>
        <span aria-hidden="true"></span>
        {kicker}
      </p>
      <h2 id={id} className="docs-title max-w-3xl text-[clamp(2rem,4vw,3.4rem)] leading-[1.04]">
        {title}
      </h2>
    </div>
  );
}

/** A text link for the light sections (the landing's is for dark ones). */
function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 border-b-2 border-cat-500 font-bold"
    >
      {children}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/** `/cascabel`: Cascabel, GatoPago Business's payments, with only what works today (`Cascabel` of the catalog). */
export function CascabelPage({ lang, copy: t }: { lang: Locale; copy: Messages['Cascabel'] }) {
  const otherLocale = lang === 'es' ? 'en' : 'es';
  const localeLabel = lang === 'es' ? 'EN' : 'ES';
  const consoleHref = settings.businessOrigin;
  const sections = [
    ['#example', t.nav.example],
    ['#ways', t.nav.ways],
    ['#steps', t.nav.tech],
  ] as const;
  return (
    <>
      <a className="meli-skip-link" href="#main-content">
        {t.skip}
      </a>

      <div className="meli-landing" data-locale={lang}>
        <header className="meli-nav-shell" data-nav-shell>
          <nav className="meli-nav" aria-label={t.nav.aria}>
            <Link className="meli-brand" href="/" aria-label={t.nav.home}>
              <CatGlyph className="meli-brand__glyph" decorative />
              <span className="meli-brand__word">GatoPago</span>
              <span className="meli-brand__alpha">Business</span>
            </Link>

            <div className="meli-nav__links" data-nav-menu>
              {sections.map(([href, label]) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
              <Link href="/docs">{t.nav.docs}</Link>
            </div>

            <div className="meli-nav__actions">
              <Link
                className="meli-locale"
                href="/cascabel"
                locale={otherLocale}
                aria-label={t.nav.language}
                data-locale-link
              >
                {localeLabel}
              </Link>
              <a className="meli-button meli-button--brand meli-nav__cta" href={consoleHref}>
                {t.nav.console}
                <span aria-hidden="true">↗</span>
              </a>
              <button
                className="meli-menu-button"
                type="button"
                aria-expanded="false"
                aria-controls="meli-mobile-menu"
                aria-label={t.nav.menuOpen}
                data-menu-button
                data-open-label={t.nav.menuOpen}
                data-close-label={t.nav.menuClose}
              >
                <span></span>
                <span></span>
                <span></span>
              </button>
            </div>
          </nav>

          <div className="meli-mobile-menu" id="meli-mobile-menu" data-mobile-menu hidden>
            {sections.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
            <Link href="/docs">{t.nav.docs}</Link>
            <a className="meli-button meli-button--brand" href={consoleHref}>
              {t.nav.console} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </header>

        <main id="main-content">
          <section className="meli-hero meli-section--ink" id="hero" aria-labelledby="hero-title">
            <div className="meli-ambient-grid" aria-hidden="true"></div>
            <div className="meli-container meli-hero__grid">
              <div className="meli-hero__copy">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.hero.eyebrow}
                </p>
                {/* On phones the landing orders the hero's parts; the name goes with the label. */}
                <p className="docs-title order-1 mb-4 text-[clamp(1.4rem,2.4vw,1.9rem)] text-cat-500">
                  {t.hero.brand}
                </p>
                <h1 id="hero-title" className="text-[clamp(2.4rem,4.4vw,4.2rem)]!">
                  {t.hero.titleLead}
                  <br />
                  <span>{t.hero.titleAccent}</span>
                </h1>
                <p className="meli-hero__lead">{t.hero.copy}</p>

                <div className="meli-hero__actions">
                  <a
                    className="meli-button meli-button--brand meli-button--large"
                    href={consoleHref}
                  >
                    {t.hero.primary}
                    <span aria-hidden="true">↗</span>
                  </a>
                  <a
                    className="meli-button meli-button--ghost-light meli-button--large"
                    href="#example"
                  >
                    {t.hero.secondary}
                    <span aria-hidden="true">↓</span>
                  </a>
                </div>

                <ul className="meli-alpha-list" aria-label={t.hero.status}>
                  <li>
                    <i aria-hidden="true"></i>
                    {t.hero.status}
                  </li>
                </ul>
              </div>

              <div className="meli-hero__visual">
                <Image
                  src={CHECKOUT[lang]}
                  alt={t.hero.checkout}
                  width={500}
                  height={296}
                  className="h-auto w-full max-w-[420px] border-2 border-canvas/30 shadow-[12px_12px_0_var(--color-cat-300)]"
                  sizes="420px"
                  priority
                />
              </div>
            </div>
          </section>

          <section className="meli-section meli-section--milk" id="example">
            <div className="meli-container grid gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-end">
              <Heading id="example-title" kicker={t.example.kicker} title={t.example.title} />
              <div className="space-y-6">
                <p className="text-[1.05rem] leading-relaxed text-text-muted">{t.example.copy}</p>
                <TextLink href="/pay/demo-cafe-norte">{t.example.demo}</TextLink>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink"
            id="ways"
            aria-labelledby="ways-title"
          >
            <div className="meli-container space-y-12">
              <Heading id="ways-title" kicker={t.ways.kicker} title={t.ways.title} light />
              <div className="grid gap-4 md:grid-cols-2">
                {t.ways.items.map(([title, text], index) => (
                  <article
                    key={title}
                    className="flex flex-col border border-canvas/15 bg-canvas/[0.03] p-7"
                  >
                    <h3 className="docs-title text-[1.5rem]">{title}</h3>
                    <p className="mt-3 flex-1 leading-relaxed text-canvas/70">{text}</p>
                    {index === 0 ? (
                      <Link href="/app" prefetch={false} className="meli-text-link mt-6 self-start">
                        {t.ways.app}
                        <span aria-hidden="true">↗</span>
                      </Link>
                    ) : (
                      <Link href="/docs" className="meli-text-link mt-6 self-start">
                        {t.ways.docs}
                        <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </article>
                ))}
              </div>
              <div className="border-l-4 border-cat-500 py-1 pl-5">
                <h3 className="font-bold">{t.ways.payTitle}</h3>
                <p className="mt-2 max-w-3xl leading-relaxed text-canvas/70">{t.ways.pay}</p>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--milk"
            id="steps"
            aria-labelledby="steps-title"
          >
            <div className="meli-container grid gap-12 lg:grid-cols-2 lg:items-start">
              <div className="space-y-10">
                <Heading id="steps-title" kicker={t.steps.kicker} title={t.steps.title} />
                <ol className="border-t-2 border-text">
                  {t.steps.items.map(([title, text], index) => (
                    <li
                      key={title}
                      className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-border py-5"
                    >
                      <span className="font-mono text-[0.75rem] font-bold text-cat-300">
                        0{index + 1}
                      </span>
                      <div>
                        <h3 className="font-bold">{title}</h3>
                        <p className="mt-1 leading-relaxed text-text-muted">{text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="min-w-0">
                <div className="meli-code-window" role="figure" aria-label={t.steps.code}>
                  <div className="meli-code-window__bar">
                    <span></span>
                    <span></span>
                    <span></span>
                    <small>payment-intent.js</small>
                  </div>
                  <pre>
                    <code>
                      <span className="code-muted">{t.steps.comment}</span>
                      {'\n'}
                      {apiExample('500.00', t.steps.order)}
                    </code>
                  </pre>
                  <div className="meli-code-response">
                    <span>201</span>
                    <code>{API_RESPONSE}</code>
                  </div>
                  <div className="meli-code-cat" aria-hidden="true">
                    <MeliSprite variant="head-peek" />
                    <span>webhook ✓</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink"
            id="gets"
            aria-labelledby="gets-title"
          >
            <div className="meli-container grid gap-12 lg:grid-cols-2 lg:items-start">
              <Heading id="gets-title" kicker={t.gets.kicker} title={t.gets.title} light />
              <ul className="border-t-2 border-canvas/60">
                {t.gets.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-baseline gap-3 border-b border-canvas/15 py-4 leading-snug before:text-[0.6rem] before:text-cat-500 before:content-['■']"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section
            className="meli-section meli-section--milk"
            id="not-yet"
            aria-labelledby="not-yet-title"
          >
            <div className="meli-container grid gap-12 lg:grid-cols-2 lg:items-start">
              <Heading id="not-yet-title" kicker={t.notYet.kicker} title={t.notYet.title} />
              <ul className="grid gap-3">
                {t.notYet.items.map(([title, text]) => (
                  <li
                    key={title}
                    className="border-2 border-text bg-surface p-5 shadow-[5px_5px_0_var(--color-cat-300)]"
                  >
                    <h3 className="font-bold">{title}</h3>
                    <p className="mt-1 text-text-muted">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="meli-final" aria-labelledby="final-title">
            <div className="meli-final__pixels" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="meli-container meli-final__inner">
              <MeliSprite variant="head-excited" className="meli-final__cat" />
              <p className="meli-kicker meli-kicker--dark">
                <span aria-hidden="true"></span>
                {t.final.eyebrow}
              </p>
              <h2 id="final-title">{t.final.title}</h2>
              <p>{t.final.copy}</p>
              <div className="meli-final__actions">
                <a className="meli-button meli-button--ink meli-button--large" href={consoleHref}>
                  {t.final.primary}
                  <span aria-hidden="true">↗</span>
                </a>
                <Link
                  className="meli-button meli-button--ember-ghost meli-button--large"
                  href="/docs"
                >
                  {t.final.secondary}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="meli-footer">
          <div className="meli-container meli-footer__grid">
            <div className="meli-footer__brand">
              <Link className="meli-brand" href="/">
                <CatGlyph className="meli-brand__glyph" decorative />
                <span className="meli-brand__word">GatoPago</span>
              </Link>
              <p>{t.footer.line}</p>
            </div>
            <div>
              <strong>{t.footer.product}</strong>
              <Link href="/">{t.footer.app}</Link>
              <Link href="/docs">{t.footer.docs}</Link>
              <a href={consoleHref}>GatoPago Business</a>
            </div>
            <div>
              <strong>{t.footer.legal}</strong>
              <Link href="/terms">{t.footer.terms}</Link>
              <Link href="/privacy">{t.footer.privacy}</Link>
            </div>
          </div>
        </footer>
      </div>
      <LandingInteractions />
    </>
  );
}
