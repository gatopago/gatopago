import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { ImageResponse } from 'next/og';
import { createTranslator, type Locale } from 'next-intl';
import english from '../messages/en.json';
import spanish from '../messages/es.json';
import { formatUsdc, type PaymentPreview, type ProfilePreview } from './data';

/**
 * The cards a link shows when it is shared (WhatsApp, Telegram, X, LinkedIn): 1200 × 630, in the
 * brand's colours, square corners and the pixel cat at its own size so its pixels stay sharp.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Cards that do not depend on data: built once, with the site. */
export const OG_PAGES = ['home', 'developers', 'demo'] as const;
export type OgPage = (typeof OG_PAGES)[number];

const ink = '#0B0B0F';
const milk = '#FFF8F0';
const paper = '#FFFDF9';
const fire = '#F85239';
const deep = '#9F292E';
const sub = '#5F5650';
const BAND = 84;

// The brand kit's static poses in PNG (Satori does not read webp): the same drawings as the body
// sprites of `@gatopago/brand`, so a redrawn cat goes to both.
const cats = {
  courier: { file: 'pose-mensajero.png', width: 397, height: 395 },
  qr: { file: 'pose-qr.png', width: 316, height: 433 },
  sitting: { file: 'pose-sentado.png', width: 270, height: 395 },
  cart: { file: 'pose-carrito.png', width: 445, height: 387 },
} as const;
type Cat = keyof typeof cats;

/** Read once per server: the fonts (static Recursive instances) and the images, from the repo. */
let assets: ReturnType<typeof loadAssets> | null = null;
async function loadAssets() {
  const folder = join(process.cwd(), 'src/og/assets');
  const font = (name: string) => readFile(join(folder, 'fonts', name));
  const png = async (name: string) =>
    `data:image/png;base64,${(await readFile(join(folder, 'cat', name))).toString('base64')}`;
  const [display, text, strong, mono, logo, ...images] = await Promise.all([
    font('recursive-casual-bold.ttf'),
    font('recursive-regular.ttf'),
    font('recursive-semibold.ttf'),
    font('recursive-mono-semibold.ttf'),
    readFile(join(process.cwd(), 'public/Logo_gatopago.svg')),
    ...Object.values(cats).map((cat) => png(cat.file)),
  ]);
  return {
    fonts: [
      { name: 'Display', data: display, weight: 700 as const, style: 'normal' as const },
      { name: 'Text', data: text, weight: 400 as const, style: 'normal' as const },
      { name: 'Strong', data: strong, weight: 600 as const, style: 'normal' as const },
      { name: 'Mono', data: mono, weight: 600 as const, style: 'normal' as const },
    ],
    logo: `data:image/svg+xml;base64,${logo.toString('base64')}`,
    cats: Object.fromEntries(Object.keys(cats).map((cat, index) => [cat, images[index]])) as Record<
      Cat,
      string
    >,
  };
}

const texts = (locale: Locale) =>
  createTranslator({ locale, messages: locale === 'en' ? english : spanish, namespace: 'Og' });

/** A font size that keeps `value` on one line within `width` pixels (Recursive is about 0.6em). */
const fit = (value: string, width: number, max: number, min: number) =>
  Math.max(min, Math.min(max, Math.floor(width / (value.length * 0.6))));

/** A column: Satori lays fragments out in a row. */
function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontFamily: 'Mono',
        fontSize: 20,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: deep,
      }}
    >
      <div style={{ width: 14, height: 14, marginRight: 12, background: fire }} />
      {children}
    </div>
  );
}

function Title({ lead, accent, size = 80 }: { lead: string; accent?: string; size?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 18,
        fontFamily: 'Display',
        fontSize: size,
        lineHeight: 0.98,
        letterSpacing: -3,
      }}
    >
      <span>{lead}</span>
      {accent ? <span style={{ color: fire }}>{accent}</span> : null}
    </div>
  );
}

function Copy({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', marginTop: 22, fontSize: 28, lineHeight: 1.35, color: sub }}>
      {children}
    </div>
  );
}

/** The frame every card shares: the brand on top, the cat sitting on the band below. */
function Frame(props: {
  cat: string;
  size: (typeof cats)[Cat];
  logo: string;
  band: string;
  status: string;
  children: ReactNode;
}) {
  const { cat, size, logo, band, status, children } = props;
  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: milk,
        color: ink,
        fontFamily: 'Text',
      }}
    >
      <div style={{ position: 'absolute', top: 0, right: 64, display: 'flex' }}>
        <div style={{ width: 28, height: 14, background: deep }} />
        <div style={{ width: 96, height: 14, background: fire }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '44px 64px 0' }}>
        <img src={logo} width={60} height={46} alt="" />
        <div style={{ marginLeft: 16, fontFamily: 'Display', fontSize: 34, letterSpacing: -1 }}>
          GatoPago
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flexGrow: 1,
          width: 64 + 640,
          padding: '0 0 0 64px',
        }}
      >
        {children}
      </div>
      <div
        style={{
          height: BAND,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 64px',
          background: ink,
          color: milk,
          fontFamily: 'Mono',
          fontSize: 19,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        <span>{band}</span>
        <span style={{ color: fire }}>{status}</span>
      </div>
      <img
        src={cat}
        width={size.width}
        height={size.height}
        alt=""
        style={{ position: 'absolute', right: 56, bottom: BAND }}
      />
    </div>
  );
}

async function render(
  locale: Locale,
  cat: Cat,
  band: string,
  children: ReactNode,
  cacheControl: string,
) {
  const { fonts, logo, cats: images } = await (assets ??= loadAssets());
  const t = texts(locale);
  return new ImageResponse(
    <Frame cat={images[cat]} size={cats[cat]} logo={logo} band={band} status={t('status')}>
      {children}
    </Frame>,
    { ...OG_SIZE, fonts, headers: { 'Cache-Control': cacheControl } },
  );
}

/** Built with the site; the CDN keeps them until the next deploy. */
const STATIC = 'public, max-age=86400, s-maxage=31536000';

export function pageImage(locale: Locale, page: OgPage) {
  const t = texts(locale);
  if (page === 'demo')
    return paymentImage(locale, {
      merchant: 'Café Norte',
      amount: '18.00',
      concept: (locale === 'en' ? english : spanish).Demo.order,
    });
  const copy =
    page === 'home'
      ? {
          kicker: t('home.kicker'),
          lead: t('home.titleLead'),
          accent: t('home.titleAccent'),
          copy: t('home.copy'),
        }
      : {
          kicker: t('developers.kicker'),
          lead: t('developers.titleLead'),
          accent: t('developers.titleAccent'),
          copy: t('developers.copy'),
        };
  return render(
    locale,
    page === 'home' ? 'courier' : 'cart',
    t('site'),
    <Stack>
      <Kicker>{copy.kicker}</Kicker>
      <Title lead={copy.lead} accent={copy.accent} />
      <Copy>{copy.copy}</Copy>
    </Stack>,
    STATIC,
  );
}

/**
 * A payment link: who charges, how much and for what. A charge never changes its amount, so its
 * card is kept long; one Flow did not answer is generic and retried soon.
 */
export function paymentImage(locale: Locale, payment: PaymentPreview | null) {
  const t = texts(locale);
  const amount = payment ? formatUsdc(payment.amount, locale) : '';
  return render(
    locale,
    'qr',
    t('payment.payWith'),
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 600,
        padding: '26px 32px 30px',
        background: paper,
        border: `4px solid ${ink}`,
        boxShadow: `12px 12px 0 ${deep}`,
      }}
    >
      <Kicker>{t('payment.label')}</Kicker>
      {payment ? (
        <Stack>
          <div
            style={{
              display: 'flex',
              marginTop: 16,
              fontFamily: 'Display',
              fontSize: payment.merchant ? fit(payment.merchant, 530, 46, 26) : 34,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {payment.merchant ?? t('payment.unnamed')}
          </div>
          {payment.merchant ? (
            <div style={{ display: 'flex', marginTop: 4, fontSize: 24, color: sub }}>
              {t('payment.charges')}
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 10 }}>
            <span
              style={{
                fontFamily: 'Display',
                fontSize: fit(amount, 440, 104, 56),
                lineHeight: 1,
                letterSpacing: -4,
              }}
            >
              {amount}
            </span>
            <span style={{ marginLeft: 14, marginBottom: 10, fontFamily: 'Mono', fontSize: 28 }}>
              USDC
            </span>
          </div>
          {payment.concept ? (
            <div
              style={{ display: 'flex', marginTop: 14, fontSize: 24, lineHeight: 1.3, color: sub }}
            >
              {payment.concept}
            </div>
          ) : null}
        </Stack>
      ) : (
        <Stack>
          <Title lead={t('payment.fallbackTitle')} size={44} />
          <Copy>{t('payment.fallbackCopy')}</Copy>
        </Stack>
      )}
    </div>,
    payment ? 'public, max-age=86400, s-maxage=2592000' : 'public, max-age=60, s-maxage=300',
  );
}

/** A public profile: whom to pay, with the name the person chose. Kept an hour: names change. */
export function profileImage(locale: Locale, profile: ProfilePreview | null) {
  const t = texts(locale);
  const handle = profile ? `@${profile.username}` : '';
  return render(
    locale,
    'sitting',
    t('site'),
    <Stack>
      <Kicker>{t('profile.kicker')}</Kicker>
      {profile ? (
        <Stack>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 18,
              fontFamily: 'Display',
              lineHeight: 0.98,
              letterSpacing: -3,
            }}
          >
            <span style={{ fontSize: 76 }}>{t('profile.lead')}</span>
            <span style={{ fontSize: fit(handle, 660, 96, 40), color: fire }}>{handle}</span>
          </div>
          <Copy>
            {profile.name ? t('profile.copy', { name: profile.name }) : t('profile.copyPlain')}
          </Copy>
        </Stack>
      ) : (
        <Stack>
          <Title lead={t('profile.fallbackTitle')} />
          <Copy>{t('profile.copyPlain')}</Copy>
        </Stack>
      )}
    </Stack>,
    profile ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=60, s-maxage=300',
  );
}
