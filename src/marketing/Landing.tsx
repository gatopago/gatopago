import Link from 'next/link';
import type { Locale, Messages } from 'next-intl';
import { CatGlyph } from './CatGlyph';
import { MeliSprite } from './MeliSprite';
import { LandingInteractions } from './LandingInteractions';
import { localizedPath } from '../consumer/routes';
import { LanguageLink } from '../lib/LanguageLink';
import { settings } from '../lib/settings';

/** The landing in `lang`, with its texts (`Landing` of the catalog) read by the page. */
export function Landing({ lang, copy: t }: { lang: Locale; copy: Messages['Landing'] }) {
  const isSpanish = lang === 'es';
  const localeHref = isSpanish ? '/en' : '/';
  const localeLabel = isSpanish ? 'EN' : 'ES';
  const appHref = localizedPath('/app', lang);
  const legalPrefix = isSpanish ? '' : '/en';
  // Static pages: each language has its own path.
  const demoPaymentPath = isSpanish ? '/pay/demo-cafe-norte' : '/en/pay/demo-cafe-norte';
  const docsHref = isSpanish ? '/docs' : '/en/docs';
  const businessHref = settings.businessOrigin;
  const apiExample = `const response = await fetch(
  API_ORIGIN + "/v1/payment_intents",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": "order-001"
    },
    body: JSON.stringify({
      amount: "18.00",
      description: "Order 1042",
      metadata: { order_id: "1042" }
    })
  }
);
const intent = await response.json();`;
  return (
    <>
      <a className="meli-skip-link" href="#main-content">
        {t.skip}
      </a>

      <div className="meli-landing" data-locale={lang}>
        <header className="meli-nav-shell" data-nav-shell>
          <nav className="meli-nav" aria-label={t.nav.aria}>
            <Link className="meli-brand" href={isSpanish ? '/' : '/en/'} aria-label={t.nav.home}>
              <CatGlyph className="meli-brand__glyph" decorative />
              <span className="meli-brand__word">GatoPago</span>
              <span className="meli-brand__alpha">Beta</span>
            </Link>

            <div className="meli-nav__links" data-nav-menu>
              <a href="#cycle">{t.nav.cycle}</a>
              <a href="#account">{t.nav.account}</a>
              <a href="#grow">{t.nav.grow}</a>
              <a href="#control">{t.nav.control}</a>
              <a href="#card">{t.nav.card}</a>
              <a href="#api">{t.nav.developers}</a>
            </div>

            <div className="meli-nav__actions">
              <LanguageLink
                className="meli-locale"
                href={localeHref}
                language={isSpanish ? 'en' : 'es'}
                aria-label={t.nav.language}
                data-locale-link
              >
                {localeLabel}
              </LanguageLink>
              <Link
                className="meli-button meli-button--brand meli-nav__cta"
                href={appHref}
                prefetch={false}
                data-cta="nav"
              >
                {t.nav.open}
                <span aria-hidden="true">↗</span>
              </Link>
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
            <a href="#cycle">{t.nav.cycle}</a>
            <a href="#account">{t.nav.account}</a>
            <a href="#grow">{t.nav.grow}</a>
            <a href="#control">{t.nav.control}</a>
            <a href="#card">{t.nav.card}</a>
            <a href="#api">{t.nav.developers}</a>
            <Link
              className="meli-button meli-button--brand"
              href={appHref}
              prefetch={false}
              data-cta="mobile-nav"
            >
              {t.nav.open} <span aria-hidden="true">↗</span>
            </Link>
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
                <h1 id="hero-title">
                  {t.hero.titleLead}
                  <br />
                  <span>{t.hero.titleAccent}</span>
                </h1>
                <p className="meli-hero__lead">{t.hero.copy}</p>

                <div className="meli-hero__actions">
                  <Link
                    className="meli-button meli-button--brand meli-button--large"
                    href={appHref}
                    prefetch={false}
                    data-cta="hero"
                  >
                    {t.hero.primary}
                    <span aria-hidden="true">↗</span>
                  </Link>
                  <a
                    className="meli-button meli-button--ghost-light meli-button--large"
                    href="#cycle"
                  >
                    {t.hero.secondary}
                    <span aria-hidden="true">↓</span>
                  </a>
                </div>

                <ul className="meli-alpha-list" aria-label={t.hero.alpha}>
                  <li>
                    <i aria-hidden="true"></i>
                    {t.hero.alpha}
                  </li>
                  <li>{t.hero.network}</li>
                  <li>{t.hero.funds}</li>
                </ul>
              </div>

              <div className="meli-hero__visual">
                <div className="meli-orbit-label meli-orbit-label--top">
                  <span></span>
                  {t.hero.packet}
                </div>
                <figure className="meli-cat-stage" data-cat-stage>
                  <div className="meli-hero-character" role="img" aria-label={t.hero.visualLabel}>
                    <MeliSprite
                      variant="head-neutral"
                      className="meli-hero-sprite meli-hero-sprite--awake"
                      loading="eager"
                    />
                    <MeliSprite
                      variant="body-sleeping"
                      className="meli-hero-sprite meli-hero-sprite--sleeping"
                    />
                    <span className="meli-dream-pixels" aria-hidden="true">
                      <i>Z</i>
                      <i>z</i>
                      <i>·</i>
                    </span>
                  </div>
                  <figcaption>{t.hero.visualNote}</figcaption>
                </figure>
                <div className="meli-pixel-rail meli-pixel-rail--hero" aria-hidden="true">
                  <span></span>
                </div>
                <button
                  className="meli-nap-toggle"
                  type="button"
                  aria-pressed="false"
                  data-nap-toggle
                  data-awake={t.hero.napOff}
                  data-asleep={t.hero.napOn}
                >
                  <span className="meli-nap-toggle__pixel" aria-hidden="true">
                    Z
                  </span>
                  <span>{t.hero.nap}</span>
                </button>
                <p className="meli-nap-status" aria-live="polite" data-nap-status>
                  {t.hero.napOff}
                </p>
              </div>
            </div>
          </section>

          <aside className="meli-signal-strip" aria-label={t.labels.principles}>
            <div className="meli-container meli-signal-strip__grid">
              {t.signals.map(([title, text], index) => (
                <div key={title} className="meli-signal">
                  <span className="meli-signal__number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section
            className="meli-section meli-section--milk meli-cycle"
            id="cycle"
            aria-labelledby="cycle-title"
          >
            <div className="meli-container">
              <div className="meli-section-heading meli-section-heading--wide">
                <p className="meli-kicker">
                  <span aria-hidden="true"></span>
                  {t.cycle.kicker}
                </p>
                <h2 id="cycle-title">
                  {t.cycle.title}
                  <br />
                  <em>{t.cycle.accent}</em>
                </h2>
                <p>{t.cycle.intro}</p>
              </div>

              <div className="meli-cycle-lab" data-cycle-lab>
                <div className="meli-cycle-lab__topline">
                  <span>{t.cycle.demo}</span>
                  <span className="meli-live-dot">{t.cycle.label}</span>
                </div>
                <div className="meli-cycle-track" role="group" aria-label={t.cycle.kicker}>
                  {t.cycle.states.map((state, index) => (
                    <button
                      className={`meli-cycle-state ${index === 0 ? 'is-active' : ''}`}
                      key={state.id}
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
                  <div className="meli-cycle-packet" aria-hidden="true">
                    <MeliSprite variant="body-courier" />
                  </div>
                </div>
                <div className="meli-cycle-output">
                  <div
                    className="meli-cycle-output__cat"
                    data-cycle-expression
                    data-expression="focused"
                    aria-hidden="true"
                  >
                    <MeliSprite
                      variant="head-focused"
                      className="meli-cycle-face meli-cycle-face--focused"
                    />
                    <MeliSprite
                      variant="head-happy"
                      className="meli-cycle-face meli-cycle-face--happy"
                    />
                    <MeliSprite
                      variant="head-cautious"
                      className="meli-cycle-face meli-cycle-face--cautious"
                    />
                    <MeliSprite
                      variant="head-excited"
                      className="meli-cycle-face meli-cycle-face--excited"
                    />
                  </div>
                  <div>
                    <p data-cycle-status>{t.cycle.states[0].status}</p>
                    <strong data-cycle-detail>{t.cycle.states[0].detail}</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink meli-account"
            id="account"
            aria-labelledby="account-title"
          >
            <div className="meli-container meli-split meli-split--account">
              <div className="meli-section-heading">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.account.kicker}
                </p>
                <h2 id="account-title">{t.account.title}</h2>
                <p>{t.account.copy}</p>
                <ul className="meli-check-list">
                  {t.account.productNotes.map((note) => (
                    <li key={note}>
                      <span aria-hidden="true">✓</span>
                      {note}
                    </li>
                  ))}
                </ul>
                <Link
                  className="meli-button meli-button--brand mt-8"
                  href={localizedPath('/login', lang)}
                  prefetch={false}
                >
                  {t.account.action}
                  <span aria-hidden="true">↗</span>
                </Link>
                <MeliSprite variant="body-sitting" className="meli-account-mascot" />
              </div>

              <div className="meli-app-concept-wrap">
                <p className="meli-concept-label">
                  <span aria-hidden="true"></span>
                  {t.account.concept}
                </p>
                <div className="meli-app-frame">
                  <div className="meli-app-frame__header">
                    <div className="meli-avatar">
                      <CatGlyph decorative />
                    </div>
                    <div>
                      <strong>{t.account.greeting}</strong>
                      <small>@dani</small>
                    </div>
                    <button type="button" aria-label={t.labels.notifications} disabled>
                      <span aria-hidden="true">•</span>
                    </button>
                  </div>
                  <div className="meli-balance-card">
                    <div className="meli-balance-card__meta">
                      <span>{t.account.available}</span>
                      <span>USDC</span>
                    </div>
                    <strong>
                      {t.money.balance[0]}
                      <span>{t.money.balance[1]}</span>
                    </strong>
                    <div className="meli-balance-card__rail" aria-hidden="true">
                      <i></i>
                    </div>
                    <div className="meli-balance-card__growing">
                      <span>
                        <i aria-hidden="true"></i>
                        {t.account.growing}
                      </span>
                      <b>{t.money.growing}</b>
                    </div>
                  </div>
                  <div className="meli-quick-actions">
                    {t.account.actions.map((action, index) => (
                      <button key={action} type="button" disabled>
                        <span aria-hidden="true">{['+', '↑', '⇅', '⌗'][index]}</span>
                        {action}
                      </button>
                    ))}
                  </div>
                  <div className="meli-activity-card">
                    <div className="meli-activity-card__heading">
                      <span>{t.account.activity}</span>
                      <span aria-hidden="true">···</span>
                    </div>
                    <div className="meli-activity-row">
                      <span className="meli-activity-row__icon" aria-hidden="true">
                        ↓
                      </span>
                      <div>
                        <strong>{t.account.received}</strong>
                        <small>{t.account.receivedFrom}</small>
                      </div>
                      <b>+{t.money.charge}</b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ember meli-receive"
            id="receive"
            aria-labelledby="receive-title"
          >
            <div className="meli-container meli-split meli-split--receive">
              <div className="meli-section-heading">
                <p className="meli-kicker meli-kicker--dark">
                  <span aria-hidden="true"></span>
                  {t.receive.kicker}
                </p>
                <h2 id="receive-title">{t.receive.title}</h2>
                <p>{t.receive.copy}</p>
                <div className="meli-channel-list" aria-label={t.labels.sharing}>
                  {t.receive.channels.map((channel, index) => (
                    <span className={index === 3 ? 'is-future' : undefined} key={channel}>
                      {channel}
                    </span>
                  ))}
                </div>
                <p className="meli-honesty-note">
                  <span aria-hidden="true">↗</span>
                  {t.receive.note}
                </p>
              </div>

              <div className="meli-receipt-stack">
                <div className="meli-receipt-shadow" aria-hidden="true"></div>
                <article className="meli-receipt-card">
                  <div className="meli-receipt-card__head">
                    <div className="meli-receipt-brand">
                      <CatGlyph decorative />
                      <span>GatoPago</span>
                    </div>
                    <span className="meli-pending-chip">
                      <i aria-hidden="true"></i>
                      {t.receive.status}
                    </span>
                  </div>
                  <p className="meli-receipt-label">{t.receive.linkLabel}</p>
                  <code>{demoPaymentPath}</code>
                  <div className="meli-receipt-main">
                    <div>
                      <span>{t.receive.amountLabel}</span>
                      <strong>
                        {t.money.charge} <small>USDC</small>
                      </strong>
                      <p>{t.receive.item}</p>
                    </div>
                    <MeliSprite variant="body-qr" className="meli-receipt-qr-mascot" />
                  </div>
                  <Link
                    className="meli-button meli-button--ink meli-button--full"
                    href={demoPaymentPath}
                    prefetch={false}
                  >
                    {t.receive.copyLink}
                    <span aria-hidden="true">→</span>
                  </Link>
                </article>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink meli-grow"
            id="grow"
            aria-labelledby="grow-title"
          >
            <div className="meli-container">
              <div className="meli-grow__heading">
                <div className="meli-section-heading">
                  <p className="meli-kicker meli-kicker--light">
                    <span aria-hidden="true"></span>
                    {t.grow.kicker}
                  </p>
                  <h2 id="grow-title">
                    {t.grow.titleLead}
                    <br />
                    <em>{t.grow.titleAccent}</em>
                  </h2>
                </div>
                <p>{t.grow.copy}</p>
              </div>

              <div className="meli-grow-route">
                <div className="meli-grow-bucket meli-grow-bucket--available">
                  <span>{t.grow.available}</span>
                  <strong>{t.money.available} USDC</strong>
                  <small>78%</small>
                </div>
                <div className="meli-grow-bridge" aria-hidden="true">
                  <div className="meli-grow-bridge__packet">{t.money.moving}</div>
                  <span></span>
                  <i></i>
                </div>
                <div className="meli-grow-bucket meli-grow-bucket--active">
                  <span>
                    <i aria-hidden="true"></i>
                    {t.grow.growing}
                  </span>
                  <strong>{t.grow.amount}</strong>
                  <small>22%</small>
                </div>
              </div>

              <div className="meli-grow-details">
                <div>
                  <span>{t.grow.route}</span>
                  <strong>{t.grow.routeValue}</strong>
                </div>
                <div>
                  <span>{t.grow.rate}</span>
                  <strong>{t.grow.rateValue}</strong>
                </div>
                <div>
                  <span>{t.grow.exit}</span>
                  <strong>{t.grow.exitValue}</strong>
                </div>
                <p>
                  <span aria-hidden="true">!</span>
                  {t.grow.risk}
                </p>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink meli-control"
            id="control"
            aria-labelledby="control-title"
          >
            <div className="meli-container meli-split meli-split--control">
              <div className="meli-section-heading">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.control.kicker}
                </p>
                <h2 id="control-title">{t.control.title}</h2>
                <p>{t.control.copy}</p>
                <button className="meli-button meli-button--brand" type="button" data-dialog-open>
                  {t.control.demo}
                  <span aria-hidden="true">↗</span>
                </button>
                <small className="meli-dialog-hint">{t.control.demoHint}</small>
              </div>
              <div className="meli-control-stack">
                {t.control.items.map(([title, text], index) => (
                  <article key={title} className="meli-control-card">
                    <span className="meli-control-card__index">0{index + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                    <span className="meli-control-card__status" aria-hidden="true">
                      ✓
                    </span>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <dialog
            className="meli-dialog"
            data-transaction-dialog
            aria-labelledby="transaction-dialog-title"
          >
            <div className="meli-dialog__topline" aria-hidden="true">
              <span></span>
            </div>
            <form method="dialog" className="meli-dialog__content">
              <button className="meli-dialog__close" value="cancel" aria-label={t.dialog.close}>
                <span aria-hidden="true">×</span>
              </button>
              <p className="meli-kicker">
                <span aria-hidden="true"></span>
                {t.dialog.eyebrow}
              </p>
              <h2 id="transaction-dialog-title">{t.dialog.title}</h2>
              <div className="meli-dialog__amount">
                <MeliSprite variant="head-cautious" className="meli-dialog__mascot" />
                <strong>{t.dialog.amount}</strong>
              </div>
              <dl>
                {t.dialog.rows.map(([term, value]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="meli-dialog__disclaimer">
                <span aria-hidden="true">i</span>
                {t.dialog.disclaimer}
              </p>
              <div className="meli-dialog__actions">
                <button className="meli-button meli-button--secondary" value="cancel">
                  {t.dialog.cancel}
                </button>
                <button className="meli-button meli-button--brand" value="confirm">
                  {t.dialog.confirm}
                  <span aria-hidden="true">✓</span>
                </button>
              </div>
            </form>
          </dialog>

          <section
            className="meli-section meli-section--milk meli-card-section"
            id="card"
            aria-labelledby="card-title"
          >
            <div className="meli-container meli-split meli-split--card">
              <div className="meli-card-scene">
                <div className="meli-card-orbit" aria-hidden="true">
                  <span></span>
                  <i></i>
                </div>
                <article className="meli-concept-card">
                  <div className="meli-concept-card__head">
                    <CatGlyph decorative />
                    <span>{t.card.cardLabel}</span>
                  </div>
                  <div className="meli-concept-card__chip" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="meli-concept-card__number">•••• &nbsp; •••• &nbsp; 2048</div>
                  <div className="meli-concept-card__foot">
                    <span>{t.card.cardName}</span>
                    <strong>GatoPago</strong>
                  </div>
                </article>
                <MeliSprite variant="body-peek-card" className="meli-card-mascot" />
                <span className="meli-early-stamp">{t.card.badge}</span>
              </div>
              <div className="meli-section-heading">
                <p className="meli-kicker">
                  <span aria-hidden="true"></span>
                  {t.card.kicker}
                </p>
                <h2 id="card-title">{t.card.title}</h2>
                <p>{t.card.copy}</p>
                <Link
                  className="meli-button meli-button--ink"
                  href={appHref}
                  prefetch={false}
                  data-cta="card-interest"
                >
                  {t.card.waitlist}
                  <span aria-hidden="true">↗</span>
                </Link>
                <small className="meli-card-notice">{t.card.notice}</small>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--ink meli-developers"
            id="api"
            aria-labelledby="developers-title"
          >
            <div className="meli-container meli-split meli-split--developers">
              <div className="meli-section-heading">
                <p className="meli-kicker meli-kicker--light">
                  <span aria-hidden="true"></span>
                  {t.developers.kicker}
                </p>
                <h2 id="developers-title">{t.developers.title}</h2>
                <p>{t.developers.copy}</p>
                <ul className="meli-feature-pills">
                  {t.developers.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className="meli-developer-actions">
                  <Link className="meli-button meli-button--brand" href={docsHref}>
                    {t.developers.docs}
                    <span aria-hidden="true">→</span>
                  </Link>
                  <a className="meli-text-link" href={businessHref}>
                    {t.developers.pilot}
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
                <small className="meli-api-note">{t.developers.note}</small>
              </div>
              <div className="meli-code-window" role="figure" aria-label={t.labels.apiExample}>
                <div className="meli-code-window__bar">
                  <span></span>
                  <span></span>
                  <span></span>
                  <small>payment-intent.js</small>
                </div>
                <pre>
                  <code>
                    <span className="code-muted">
                      {isSpanish
                        ? 'crear un cobro desde tu servidor'
                        : 'create a payment from your server'}
                    </span>
                    {'\n'}
                    {apiExample}
                  </code>
                </pre>
                <div className="meli-code-response">
                  <span>201</span>
                  <code>{`{ status: "${t.developers.response}" }`}</code>
                </div>
                <div className="meli-code-cat" aria-hidden="true">
                  <MeliSprite variant="head-peek" />
                  <span>webhook ✓</span>
                </div>
              </div>
            </div>
          </section>

          <section
            className="meli-section meli-section--milk meli-faq"
            id="faq"
            aria-labelledby="faq-title"
          >
            <div className="meli-container meli-split meli-split--faq">
              <div className="meli-section-heading">
                <p className="meli-kicker">
                  <span aria-hidden="true"></span>
                  {t.faq.kicker}
                </p>
                <h2 id="faq-title">{t.faq.title}</h2>
                <div className="meli-faq-cat" aria-hidden="true">
                  <MeliSprite variant="head-curious" />
                  <span>?</span>
                </div>
              </div>
              <div className="meli-faq-list">
                {t.faq.items.map(([question, answer], index) => (
                  <details key={question} className="meli-faq-item" open={index === 0}>
                    <summary>
                      <span>{question}</span>
                      <i aria-hidden="true"></i>
                    </summary>
                    <p>{answer}</p>
                  </details>
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
                <Link
                  className="meli-button meli-button--ink meli-button--large"
                  href={appHref}
                  prefetch={false}
                  data-cta="final"
                >
                  {t.final.primary}
                  <span aria-hidden="true">↗</span>
                </Link>
                <a
                  className="meli-button meli-button--ember-ghost meli-button--large"
                  href="#cycle"
                >
                  {t.final.secondary}
                  <span aria-hidden="true">↑</span>
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer className="meli-footer">
          <div className="meli-container meli-footer__grid">
            <div className="meli-footer__brand">
              <Link className="meli-brand" href={isSpanish ? '/' : '/en/'}>
                <CatGlyph className="meli-brand__glyph" decorative />
                <span className="meli-brand__word">GatoPago</span>
              </Link>
              <p>{t.footer.line}</p>
              <span className="meli-footer__status">
                <i aria-hidden="true"></i>
                {t.footer.status}
              </span>
            </div>
            <div>
              <strong>{t.footer.product}</strong>
              <a href="#cycle">{t.footer.links[0]}</a>
              <a href="#account">{t.footer.links[1]}</a>
              <a href="#grow">{t.footer.links[2]}</a>
              <a href="#api">{t.footer.links[3]}</a>
            </div>
            <div>
              <strong>{t.footer.company}</strong>
              <a href="#faq">{t.labels.faq}</a>
              <LanguageLink href={localeHref} language={isSpanish ? 'en' : 'es'} data-locale-link>
                {localeLabel}
              </LanguageLink>
            </div>
            <div>
              <strong>{t.footer.legal}</strong>
              <Link href={`${legalPrefix}/terms`}>{t.footer.terms}</Link>
              <Link href={`${legalPrefix}/privacy`}>{t.footer.privacy}</Link>
            </div>
          </div>
          <div className="meli-container meli-footer__bottom">
            <span>
              © {new Date().getFullYear()} {t.footer.rights}
            </span>
            <span className="meli-footer__pixels" aria-hidden="true">
              ■ ■ □ ■
            </span>
          </div>
        </footer>
      </div>
      <LandingInteractions />
    </>
  );
}
