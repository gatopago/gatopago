import { Link } from '../i18n/navigation';
import type { Locale } from 'next-intl';
import { getMessages } from 'next-intl/server';

const privacyEmail = 'privacy@gatopago.com';

function Paragraph({ text }: { text: string }) {
  const [before, after] = text.split('{{privacyEmail}}');
  return (
    <p>
      {before}
      {after !== undefined ? (
        <>
          <a className="underline underline-offset-4" href={`mailto:${privacyEmail}`}>
            {privacyEmail}
          </a>
          {after}
        </>
      ) : null}
    </p>
  );
}

export async function LegalDocument({ kind, lang }: { kind: 'terms' | 'privacy'; lang: Locale }) {
  const messages = await getMessages({ locale: lang });
  const c = kind === 'terms' ? messages.Terms : messages.Privacy;
  const t = messages.Legal;
  const en = lang === 'en';
  return (
    <div className="min-h-dvh bg-canvas text-text">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-8">
        <Link href="/" className="font-display text-xl font-bold">
          GatoPago
        </Link>
        <Link
          href={`/${kind}`}
          locale={en ? 'es' : 'en'}
          className="border-2 border-text p-3 font-mono text-sm"
        >
          {t.otherLanguage}
        </Link>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl px-6 pb-16 leading-relaxed">
        <aside className="mb-8 border-l-4 border-info bg-info/10 p-4 text-sm" role="note">
          {t.note}
        </aside>
        <h1 className="font-display text-4xl font-bold">{c.title}</h1>
        <p className="my-4 text-sm text-text-muted">{c.updated}</p>
        <Paragraph text={c.lead} />
        {c.sections.map((section) => (
          <section key={section.h} className="mt-8 space-y-3">
            <h2 className="font-display text-2xl font-bold">{section.h}</h2>
            {section.p?.map((text) => (
              <Paragraph key={text} text={text} />
            ))}
            {section.list ? (
              <ul className="list-disc space-y-2 pl-6">
                {section.list.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <Link href="/" className="mt-10 inline-block underline underline-offset-4">
          {t.back}
        </Link>
      </main>
    </div>
  );
}
