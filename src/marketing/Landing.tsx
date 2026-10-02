import { copy } from './copy';
import { CatGlyph } from './CatGlyph';
import { MeliSprite } from './MeliSprite';
import { LandingInteractions } from './LandingInteractions';
import { localizedPath } from '../consumer/routes';

export function Landing({ lang }: { lang: 'es' | 'en' }) {
  const isSpanish = lang === 'es';
  const localeHref = isSpanish ? '/en' : '/';
  const localeLabel = isSpanish ? 'EN' : 'ES';
  const appHref = localizedPath('/app', !isSpanish);
  const legalPrefix = isSpanish ? '' : '/en';

  const t = copy[lang];
  return <>
<a className="meli-skip-link" href="#main-content">{t.skip}</a>

<div className="meli-landing" data-locale={lang}>
  <header className="meli-nav-shell" data-nav-shell>
    <nav className="meli-nav" aria-label={t.nav.aria}>
      <a className="meli-brand" href={isSpanish ? '/' : '/en/'} aria-label={t.nav.home}>
        <CatGlyph className="meli-brand__glyph" decorative />
        <span className="meli-brand__word">GatoPago</span>
        <span className="meli-brand__alpha">V3 preview</span>
      </a>

      <div className="meli-nav__links" data-nav-menu>
        <a href="#cycle">{t.nav.cycle}</a>
        <a href="#account">{t.nav.account}</a>
        <a href="#control">{t.nav.control}</a>
      </div>

      <div className="meli-nav__actions">
        <a
          className="meli-locale"
          href={localeHref}
          hrefLang={isSpanish ? 'en' : 'es'}
          aria-label={t.nav.language}
          data-locale-link
        >{localeLabel}</a>
        <a className="meli-button meli-button--brand meli-nav__cta" href={appHref} data-cta="nav">
          {t.nav.open}
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
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>

    <div className="meli-mobile-menu" id="meli-mobile-menu" data-mobile-menu hidden>
      <a href="#cycle">{t.nav.cycle}</a>
      <a href="#account">{t.nav.account}</a>
      <a href="#control">{t.nav.control}</a>
      <a className="meli-button meli-button--brand" href={appHref} data-cta="mobile-nav">{t.nav.open} <span aria-hidden="true">↗</span></a>
    </div>
  </header>

  <main id="main-content">
    <section className="meli-hero meli-section--ink" id="hero" aria-labelledby="hero-title">
      <div className="meli-ambient-grid" aria-hidden="true"></div>
      <div className="meli-container meli-hero__grid">
        <div className="meli-hero__copy" data-reveal>
          <p className="meli-kicker meli-kicker--light"><span aria-hidden="true"></span>{t.hero.eyebrow}</p>
          <h1 id="hero-title">
            {t.hero.titleLead}<br />
            <span>{t.hero.titleAccent}</span>
          </h1>
          <p className="meli-hero__lead">{t.hero.copy}</p>

          <div className="meli-hero__actions">
            <a className="meli-button meli-button--brand meli-button--large" href={appHref} data-cta="hero">
              {t.hero.primary}<span aria-hidden="true">↗</span>
            </a>
            <a className="meli-button meli-button--ghost-light meli-button--large" href="#cycle">
              {t.hero.secondary}<span aria-hidden="true">↓</span>
            </a>
          </div>

          <ul className="meli-alpha-list" aria-label={t.hero.alpha}>
            <li><i aria-hidden="true"></i>{t.hero.alpha}</li>
            <li>{t.hero.network}</li>
            <li>{t.hero.funds}</li>
          </ul>
        </div>

        <div className="meli-hero__visual" data-reveal data-reveal-delay="1">
          <div className="meli-orbit-label meli-orbit-label--top"><span></span>{t.hero.packet}</div>
          <figure className="meli-cat-stage" data-cat-stage>
            <div className="meli-hero-character" role="img" aria-label={t.hero.visualLabel}>
              <MeliSprite variant="head-neutral" className="meli-hero-sprite meli-hero-sprite--awake" loading="eager" />
              <MeliSprite variant="body-sleeping" className="meli-hero-sprite meli-hero-sprite--sleeping" />
              <span className="meli-dream-pixels" aria-hidden="true"><i>Z</i><i>z</i><i>·</i></span>
            </div>
            <figcaption>{t.hero.visualNote}</figcaption>
          </figure>
          <div className="meli-pixel-rail meli-pixel-rail--hero" aria-hidden="true"><span></span></div>
          <button
            className="meli-nap-toggle"
            type="button"
            aria-pressed="false"
            data-nap-toggle
            data-awake={t.hero.napOff}
            data-asleep={t.hero.napOn}
          >
            <span className="meli-nap-toggle__pixel" aria-hidden="true">Z</span>
            <span>{t.hero.nap}</span>
          </button>
          <p className="meli-nap-status" aria-live="polite" data-nap-status>{t.hero.napOff}</p>
        </div>
      </div>
    </section>

    <aside className="meli-signal-strip" aria-label={isSpanish ? 'Principios de producto' : 'Product principles'}>
      <div className="meli-container meli-signal-strip__grid">
        {t.signals.map(([title, text], index) => (
          <div key={title} className="meli-signal" data-reveal>
            <span className="meli-signal__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{title}</strong><p>{text}</p></div>
          </div>
        ))}
      </div>
    </aside>

    <section className="meli-section meli-section--milk meli-cycle" id="cycle" aria-labelledby="cycle-title">
      <div className="meli-container">
        <div className="meli-section-heading meli-section-heading--wide" data-reveal>
          <p className="meli-kicker"><span aria-hidden="true"></span>{t.cycle.kicker}</p>
          <h2 id="cycle-title">{t.cycle.title}<br /><em>{t.cycle.accent}</em></h2>
          <p>{t.cycle.intro}</p>
        </div>

        <div className="meli-cycle-lab" data-cycle-lab data-reveal>
          <div className="meli-cycle-lab__topline">
            <span>{t.cycle.demo}</span>
            <span className="meli-live-dot">{t.cycle.label}</span>
          </div>
          <div className="meli-cycle-track" role="group" aria-label={t.cycle.kicker}>
            {t.cycle.states.map((state, index) => (
              <button
                className={`meli-cycle-state ${index === 0 ? 'is-active' : ''}`} key={state.id}
                type="button"
                aria-pressed={index === 0 ? 'true' : 'false'}
                data-cycle-state={state.id}
                data-detail={state.detail}
                data-status={state.status}
                data-expression={['focused', 'happy', 'cautious', 'excited'][index]}
              >
                <span className="meli-cycle-state__number">{state.number}</span>
                <strong>{state.label}</strong>
                <small>{state.short}</small>
                <i aria-hidden="true"></i>
              </button>
            ))}
            <div className="meli-cycle-packet" aria-hidden="true"><MeliSprite variant="body-courier" /></div>
          </div>
          <div className="meli-cycle-output">
            <div className="meli-cycle-output__cat" data-cycle-expression data-expression="focused" aria-hidden="true">
              <MeliSprite variant="head-focused" className="meli-cycle-face meli-cycle-face--focused" />
              <MeliSprite variant="head-happy" className="meli-cycle-face meli-cycle-face--happy" />
              <MeliSprite variant="head-cautious" className="meli-cycle-face meli-cycle-face--cautious" />
              <MeliSprite variant="head-excited" className="meli-cycle-face meli-cycle-face--excited" />
            </div>
            <div>
              <p data-cycle-status>{t.cycle.states[0].status}</p>
              <strong data-cycle-detail>{t.cycle.states[0].detail}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section className="meli-section meli-section--ink meli-account" id="account" aria-labelledby="account-title">
      <div className="meli-container meli-split meli-split--account">
        <div className="meli-section-heading" data-reveal>
          <p className="meli-kicker meli-kicker--light"><span aria-hidden="true"></span>{t.account.kicker}</p>
          <h2 id="account-title">{t.account.title}</h2>
          <p>{t.account.copy}</p>
          <ul className="meli-check-list">
            {t.account.productNotes.map((note) => <li key={note}><span aria-hidden="true">✓</span>{note}</li>)}
          </ul>
          <a className="meli-button meli-button--brand mt-8" href={localizedPath('/onboarding', !isSpanish)}>{t.account.action}<span aria-hidden="true">↗</span></a>
        </div>

        <div className="flex items-center justify-center" data-reveal data-reveal-delay="1"><MeliSprite variant="body-sitting" className="meli-account-mascot" /></div>
      </div>
    </section>

    <section className="meli-section meli-section--milk meli-move" id="move" aria-labelledby="move-title">
      <div className="meli-container">
        <div className="meli-section-heading meli-section-heading--wide" data-reveal>
          <p className="meli-kicker"><span aria-hidden="true"></span>{t.move.kicker}</p>
          <h2 id="move-title">{t.move.title}</h2>
          <p>{t.move.copy}</p>
        </div>
        <div className="meli-move-mascot" data-reveal data-reveal-delay="1" aria-hidden="true">
          <MeliSprite variant="body-conveyor" />
        </div>
        <div className="meli-path-grid">
          {t.move.paths.map(([title, description, glyph, href], index) => (
            <a key={title} href={localizedPath(href, !isSpanish)} className="meli-path-card" data-reveal data-reveal-delay={String(index % 2)}>
              <div className="meli-path-card__glyph" aria-hidden="true"><span>{glyph}</span></div>
              <p>0{index + 1}</p>
              <h3>{title}</h3>
              <span>{description}</span>
              <div className="meli-path-card__footer"><small>{t.move.preview}</small><i aria-hidden="true">→</i></div>
            </a>
          ))}
        </div>
      </div>
    </section>

    <section className="meli-section meli-section--ink meli-control" id="control" aria-labelledby="control-title">
      <div className="meli-container meli-split meli-split--control">
        <div className="meli-section-heading" data-reveal>
          <p className="meli-kicker meli-kicker--light"><span aria-hidden="true"></span>{t.control.kicker}</p>
          <h2 id="control-title">{t.control.title}</h2>
          <p>{t.control.copy}</p>
        </div>
        <div className="meli-control-stack">
          {t.control.items.map(([title, text], index) => (
            <article key={title} className="meli-control-card" data-reveal data-reveal-delay={String(index % 2)}>
              <span className="meli-control-card__index">0{index + 1}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <span className="meli-control-card__status" aria-hidden="true">✓</span>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="meli-section meli-section--milk meli-faq" id="faq" aria-labelledby="faq-title">
      <div className="meli-container meli-split meli-split--faq">
        <div className="meli-section-heading" data-reveal>
          <p className="meli-kicker"><span aria-hidden="true"></span>{t.faq.kicker}</p>
          <h2 id="faq-title">{t.faq.title}</h2>
          <div className="meli-faq-cat" aria-hidden="true"><MeliSprite variant="head-curious" /><span>?</span></div>
        </div>
        <div className="meli-faq-list">
          {t.faq.items.map(([question, answer], index) => (
            <details key={question} className="meli-faq-item" open={index === 0} data-reveal>
              <summary><span>{question}</span><i aria-hidden="true"></i></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>

    <section className="meli-final" aria-labelledby="final-title">
      <div className="meli-final__pixels" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div className="meli-container meli-final__inner" data-reveal>
        <MeliSprite variant="head-excited" className="meli-final__cat" />
        <p className="meli-kicker meli-kicker--dark"><span aria-hidden="true"></span>{t.final.eyebrow}</p>
        <h2 id="final-title">{t.final.title}</h2>
        <p>{t.final.copy}</p>
        <div className="meli-final__actions">
          <a className="meli-button meli-button--ink meli-button--large" href={appHref} data-cta="final">{t.final.primary}<span aria-hidden="true">↗</span></a>
          <a className="meli-button meli-button--ember-ghost meli-button--large" href="#cycle">{t.final.secondary}<span aria-hidden="true">↑</span></a>
        </div>
      </div>
    </section>
  </main>

  <footer className="meli-footer">
    <div className="meli-container meli-footer__grid">
      <div className="meli-footer__brand">
        <a className="meli-brand" href={isSpanish ? '/' : '/en/'}><CatGlyph className="meli-brand__glyph" decorative /><span className="meli-brand__word">GatoPago</span></a>
        <p>{t.footer.line}</p>
        <span className="meli-footer__status"><i aria-hidden="true"></i>{t.footer.status}</span>
      </div>
      <div><strong>{t.footer.product}</strong><a href="#cycle">{t.nav.cycle}</a><a href="#account">{t.nav.account}</a><a href="#control">{t.nav.control}</a></div>
      <div><strong>{t.footer.company}</strong><a href="#faq">{isSpanish ? 'Preguntas frecuentes' : 'FAQ'}</a><a href={localeHref} hrefLang={isSpanish ? 'en' : 'es'} data-locale-link>{localeLabel}</a></div>
      <div><strong>{t.footer.legal}</strong><a href={`${legalPrefix}/terms`}>{t.footer.terms}</a><a href={`${legalPrefix}/privacy`}>{t.footer.privacy}</a></div>
    </div>
    <div className="meli-container meli-footer__bottom"><span>© {new Date().getFullYear()} {t.footer.rights}</span><span className="meli-footer__pixels" aria-hidden="true">■ ■ □ ■</span></div>
  </footer>
</div>
<LandingInteractions locale={lang} /></>;
}
