import type { ReactNode } from 'react';
import { Link } from '../i18n/navigation';
import type { Locale, Messages } from 'next-intl';
import { CatGlyph } from './CatGlyph';
import { MeliSprite } from './MeliSprite';
import { LandingInteractions } from './LandingInteractions';
import './docs.css';

/** Where payment companies reach us until gatopago.com has its own address. */
const CONTACT = 'https://x.com/gatopago';

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

/** One leg of the example charge: who and in what. */
function Leg({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="border border-canvas/20 bg-canvas/[0.04] px-5 py-4">
      <p className="font-mono text-[0.72rem] tracking-[0.08em] text-canvas/60 uppercase">{label}</p>
      <p className="docs-title mt-1 text-[1.35rem]">{value}</p>
      {children}
    </div>
  );
}

/**
 * `/cascabel`: Cascabel, GatoPago Business's stablecoin layer for payment companies. It shows the
 * model and keeps apart what works today from what is being built (`Cascabel` of the catalog).
 */
export function CascabelPage({ lang, copy: t }: { lang: Locale; copy: Messages['Cascabel'] }) {
  const otherLocale = lang === 'es' ? 'en' : 'es';
  const localeLabel = lang === 'es' ? 'EN' : 'ES';
  const sections = [
    ['#how', t.nav.how],
    ['#today', t.nav.today],
    ['#why', t.nav.why],
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
              <a className="meli-button meli-button--brand meli-nav__cta" href={CONTACT}>
                {t.nav.contact}
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
            <a className="meli-button meli-button--brand" href={CONTACT}>
              {t.nav.contact} <span aria-hidden="true">↗</span>
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
                <h1 id="hero-title" className="text-[clamp(2.3rem,4.2vw,4rem)]!">
                  {t.hero.titleLead}
                  <br />
                  <span>{t.hero.titleAccent}</span>
                </h1>
                <p className="meli-hero__lead">{t.hero.copy}</p>

                <div className="meli-hero__actions">
                  <a className="meli-button meli-button--brand meli-button--large" href={CONTACT}>
                    {t.hero.primary}
                    <span aria-hidden="true">↗</span>
                  </a>
                  <a
                    className="meli-button meli-button--ghost-light meli-button--large"
                    href="#how"
                  >
                    {t.hero.secondary}
                    <span aria-hidden="true">↓</span>
                  </a>
                </div>

                <ul className="meli-alpha-list" aria-label={t.hero.today}>
                  <li>
                    <i aria-hidden="true"></i>
                    {t.hero.today}
                  </li>
                  <li>{t.hero.building}</li>
                </ul>
              </div>

              <div className="meli-hero__visual">
                <figure className="w-full max-w-[420px]" aria-label={t.hero.routeLabel}>
                  <figcaption className="mb-4 flex items-center justify-between gap-3">
                    <span className="font-mono text-[0.75rem] tracking-[0.08em] text-canvas/60 uppercase">
                      {t.hero.routeLabel}
                    </span>
                    <span className="border border-pending/60 px-2 py-1 font-mono text-[0.7rem] text-[#f6c65b] uppercase">
                      {t.hero.routeChip}
                    </span>
                  </figcaption>
                  <Leg label={t.hero.routeFrom} value={t.hero.routeFromValue} />
                  <div className="flex items-center gap-3 py-4 pl-5">
                    <span aria-hidden="true" className="text-[1.4rem] text-cat-500">
                      ↓
                    </span>
                    <span className="font-bold text-cat-500">{t.hero.routeVia}</span>
                  </div>
                  <Leg label={t.hero.routeTo} value={t.hero.routeToValue} />
                </figure>
              </div>
            </div>
          </section>

          <section className="meli-section meli-section--milk" id="how" aria-labelledby="how-title">
            <div className="meli-container grid gap-12 lg:grid-cols-2 lg:items-start">
              <div className="space-y-6">
                <Heading id="how-title" kicker={t.how.kicker} title={t.how.title} />
                <p className="max-w-md leading-relaxed text-text-muted">{t.how.note}</p>
              </div>
              <ol className="border-t-2 border-text">
                {t.how.items.map(([title, text], index) => (
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
          </section>

          <section
            className="meli-section meli-section--ink"
            id="today"
            aria-labelledby="today-title"
          >
            <div className="meli-container space-y-12">
              <Heading id="today-title" kicker={t.today.kicker} title={t.today.title} light />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="border border-growth/50 bg-canvas/[0.03] p-7">
                  <h3 className="flex items-center gap-3 font-bold">
                    <span aria-hidden="true" className="size-2.5 bg-[#71d5a1]"></span>
                    {t.today.nowTitle}
                  </h3>
                  <ul className="mt-5 space-y-3 text-canvas/75">
                    {t.today.now.map((item) => (
                      <li key={item} className="leading-snug">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border border-[#f6c65b]/50 bg-canvas/[0.03] p-7">
                  <h3 className="flex items-center gap-3 font-bold">
                    <span aria-hidden="true" className="size-2.5 bg-[#f6c65b]"></span>
                    {t.today.nextTitle}
                  </h3>
                  <ul className="mt-5 space-y-3 text-canvas/75">
                    {t.today.next.map((item) => (
                      <li key={item} className="leading-snug">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-6">
                <p className="text-canvas/70">{t.today.notYet}</p>
                <Link href="/docs" className="meli-text-link">
                  {t.today.docs}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>

          <section className="meli-section meli-section--milk" id="why" aria-labelledby="why-title">
            <div className="meli-container space-y-12">
              <Heading id="why-title" kicker={t.why.kicker} title={t.why.title} />
              <div className="grid gap-4 md:grid-cols-2">
                {t.why.items.map(([title, text]) => (
                  <article
                    key={title}
                    className="border-2 border-text bg-surface p-6 shadow-[5px_5px_0_var(--color-cat-300)]"
                  >
                    <h3 className="docs-title text-[1.35rem]">{title}</h3>
                    <p className="mt-2 leading-relaxed text-text-muted">{text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink"
            id="avalanche"
            aria-labelledby="avalanche-title"
          >
            <div className="meli-container grid gap-12 lg:grid-cols-2 lg:items-start">
              <Heading
                id="avalanche-title"
                kicker={t.avalanche.kicker}
                title={t.avalanche.title}
                light
              />
              <div>
                <ul className="border-t-2 border-canvas/60">
                  {t.avalanche.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-baseline gap-3 border-b border-canvas/15 py-4 leading-snug before:text-[0.6rem] before:text-cat-500 before:content-['■']"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-canvas/60">{t.avalanche.note}</p>
              </div>
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
                <a className="meli-button meli-button--ink meli-button--large" href={CONTACT}>
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
              <a href={CONTACT}>X</a>
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
