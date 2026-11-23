import { Link } from '../i18n/navigation';
import type { Locale } from 'next-intl';
import { CatGlyph } from './CatGlyph';

type CallToAction = {
  href: string;
  label: string;
  /** Another site (the contact), opened as a plain link; otherwise a page of this one. */
  external?: boolean;
  /** Marks the button for the landing's analytics (`data-cta`). */
  tracked?: boolean;
};

/**
 * The bar of the marketing pages (the landing, Cascabel): the brand with its badge, the page's
 * sections, the language switch, one call to action and the phone menu that repeats them.
 * `LandingInteractions` opens and closes the menu.
 */
export function MarketingNav({
  lang,
  labels,
  badge,
  localeHref,
  links,
  cta,
}: {
  lang: Locale;
  labels: { aria: string; home: string; language: string; menuOpen: string; menuClose: string };
  badge: string;
  /** This page in the other language. */
  localeHref: string;
  /** A section of the page (`#…`) or another page of the site. */
  links: readonly (readonly [href: string, label: string])[];
  cta: CallToAction;
}) {
  const otherLocale = lang === 'es' ? 'en' : 'es';
  const linkList = links.map(([href, label]) =>
    href.startsWith('#') ? (
      <a key={href} href={href}>
        {label}
      </a>
    ) : (
      <Link key={href} href={href}>
        {label}
      </Link>
    ),
  );
  const button = (className: string, place: 'nav' | 'mobile-nav') => {
    const content = (
      <>
        {cta.label}
        {place === 'nav' ? null : ' '}
        <span aria-hidden="true">↗</span>
      </>
    );
    return cta.external ? (
      <a className={className} href={cta.href}>
        {content}
      </a>
    ) : (
      <Link
        className={className}
        href={cta.href}
        prefetch={false}
        data-cta={cta.tracked ? place : undefined}
      >
        {content}
      </Link>
    );
  };
  return (
    <header className="meli-nav-shell" data-nav-shell>
      <nav className="meli-nav" aria-label={labels.aria}>
        <Link className="meli-brand" href="/" aria-label={labels.home}>
          <CatGlyph className="meli-brand__glyph" decorative />
          <span className="meli-brand__word">GatoPago</span>
          <span className="meli-brand__alpha">{badge}</span>
        </Link>

        <div className="meli-nav__links" data-nav-menu>
          {linkList}
        </div>

        <div className="meli-nav__actions">
          <Link
            className="meli-locale"
            href={localeHref}
            locale={otherLocale}
            aria-label={labels.language}
            data-locale-link
          >
            {otherLocale.toUpperCase()}
          </Link>
          {button('meli-button meli-button--brand meli-nav__cta', 'nav')}
          <button
            className="meli-menu-button"
            type="button"
            aria-expanded="false"
            aria-controls="meli-mobile-menu"
            aria-label={labels.menuOpen}
            data-menu-button
            data-open-label={labels.menuOpen}
            data-close-label={labels.menuClose}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>

      <div className="meli-mobile-menu" id="meli-mobile-menu" data-mobile-menu hidden>
        {linkList}
        {button('meli-button meli-button--brand', 'mobile-nav')}
      </div>
    </header>
  );
}
