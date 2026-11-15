import { Link } from '../i18n/navigation';
import type { Locale, Messages } from 'next-intl';
import { CatGlyph } from './CatGlyph';
import { MeliSprite } from './MeliSprite';
import { LandingInteractions } from './LandingInteractions';
import { API_EXAMPLE } from './apiExample';
import { settings } from '../lib/settings';

/** `/flow`: GatoPago Flow for businesses, with only what works today (`Flow` of the catalog). */
export function FlowPage({ lang, copy: t }: { lang: Locale; copy: Messages['Flow'] }) {
  const otherLocale = lang === 'es' ? 'en' : 'es';
  const localeLabel = lang === 'es' ? 'EN' : 'ES';
  const consoleHref = settings.businessOrigin;
  const sections = [
    ['#how', t.nav.how],
    ['#steps', t.nav.steps],
    ['#gets', t.nav.gets],
  ] as const;
  return (
    <>
      <a className="meli-skip-link" href="#main-content">
        {t.skip}
      </a>

      <div className="meli-landing meli-flow" data-locale={lang}>
        <header className="meli-nav-shell" data-nav-shell>
          <nav className="meli-nav" aria-label={t.nav.aria}>
            <Link className="meli-brand" href="/" aria-label={t.nav.home}>
              <CatGlyph className="meli-brand__glyph" decorative />
              <span className="meli-brand__word">GatoPago</span>
              <span className="meli-brand__alpha">Flow</span>
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
                href="/flow"
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
          <section
            className="meli-hero meli-hero--flow meli-section--ink"
            id="hero"
            aria-labelledby="hero-title"
          >
            <div className="meli-ambient-grid" aria-hidden="true"></div>
            <div className="meli-container meli-hero__grid">
              <div className="meli-hero__copy">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.hero.eyebrow}
                </p>
                <h1 id="hero-title">
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
                  <Link
                    className="meli-button meli-button--ghost-light meli-button--large"
                    href="/docs"
                  >
                    {t.hero.secondary}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>

                <ul className="meli-alpha-list" aria-label={t.hero.status}>
                  <li>
                    <i aria-hidden="true"></i>
                    {t.hero.status}
                  </li>
                  <li>{t.hero.custody}</li>
                </ul>
              </div>

              <div className="meli-hero__visual">
                <div className="meli-code-window" role="figure" aria-label={t.gets.code}>
                  <div className="meli-code-window__bar">
                    <span></span>
                    <span></span>
                    <span></span>
                    <small>payment-intent.js</small>
                  </div>
                  <pre>
                    <code>
                      <span className="code-muted">{t.gets.comment}</span>
                      {'\n'}
                      {API_EXAMPLE}
                    </code>
                  </pre>
                  <div className="meli-code-response">
                    <span>201</span>
                    <code>{`{ status: "${t.gets.response}" }`}</code>
                  </div>
                  <div className="meli-code-cat" aria-hidden="true">
                    <MeliSprite variant="head-peek" />
                    <span>webhook ✓</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="meli-section meli-section--milk" id="how" aria-labelledby="how-title">
            <div className="meli-container">
              <div className="meli-section-heading meli-section-heading--wide">
                <p className="meli-kicker">
                  <span aria-hidden="true"></span>
                  {t.how.kicker}
                </p>
                <h2 id="how-title">{t.how.title}</h2>
              </div>
              <div className="meli-flow-grid">
                {t.how.items.map(([title, text]) => (
                  <article key={title} className="meli-flow-card">
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink"
            id="steps"
            aria-labelledby="steps-title"
          >
            <div className="meli-container meli-split">
              <div className="meli-section-heading">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.steps.kicker}
                </p>
                <h2 id="steps-title">{t.steps.title}</h2>
              </div>
              <ol className="meli-control-stack meli-flow-steps">
                {t.steps.items.map(([title, text], index) => (
                  <li key={title} className="meli-control-card">
                    <span className="meli-control-card__index">0{index + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section
            className="meli-section meli-section--milk"
            id="gets"
            aria-labelledby="gets-title"
          >
            <div className="meli-container meli-split">
              <div className="meli-section-heading">
                <p className="meli-kicker">
                  <span aria-hidden="true"></span>
                  {t.gets.kicker}
                </p>
                <h2 id="gets-title">{t.gets.title}</h2>
                <div className="meli-developer-actions">
                  <Link className="meli-button meli-button--ink" href="/docs">
                    {t.gets.docs}
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link className="meli-text-link" href="/pay/demo-cafe-norte">
                    {t.gets.demo}
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
              <ul className="meli-flow-list">
                {t.gets.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink"
            id="not-yet"
            aria-labelledby="not-yet-title"
          >
            <div className="meli-container meli-split">
              <div className="meli-section-heading">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.notYet.kicker}
                </p>
                <h2 id="not-yet-title">{t.notYet.title}</h2>
              </div>
              <div className="meli-control-stack">
                {t.notYet.items.map(([title, text]) => (
                  <article key={title} className="meli-control-card">
                    <span className="meli-control-card__index" aria-hidden="true">
                      —
                    </span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </article>
                ))}
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
              <a href={consoleHref}>{t.nav.console}</a>
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
