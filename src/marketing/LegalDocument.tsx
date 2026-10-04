import Link from 'next/link';
import { privacy, terms } from './legal-copy';

// Preserved public contact from the source landing; no new mailbox is implied.
const privacyEmail = 'privacy@parmelia.me';

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

export function LegalDocument({ kind, lang }: { kind: 'terms' | 'privacy'; lang: 'es' | 'en' }) {
  const c = (kind === 'terms' ? terms : privacy)[lang];
  const en = lang === 'en';
  return (
    <div className="min-h-dvh bg-canvas text-text">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-8">
        <Link href={en ? '/en' : '/'} className="font-display text-xl font-bold">
          GatoPago
        </Link>
        <Link
          href={en ? `/${kind}` : `/en/${kind}`}
          hrefLang={en ? 'es' : 'en'}
          className="border-2 border-text p-3 font-mono text-sm"
        >
          {en ? 'ES' : 'EN'}
        </Link>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl px-6 pb-16 leading-relaxed">
        <aside className="mb-8 border-l-4 border-pending bg-pending/10 p-4 text-sm" role="note">
          {en
            ? 'Historical text preserved from the previous site. V3 is a local candidate: this is not confirmation of V3 availability or a reviewed V3 policy.'
            : 'Texto histórico conservado del sitio anterior. V3 es un candidato local: esto no confirma su disponibilidad ni constituye una política V3 revisada.'}
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
        <Link href={en ? '/en' : '/'} className="mt-10 inline-block underline underline-offset-4">
          {en ? 'Back to home' : 'Volver al inicio'}
        </Link>
      </main>
    </div>
  );
}
