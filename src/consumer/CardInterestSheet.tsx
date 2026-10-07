'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ClientSettings } from '../lib/settings';
import { api } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { SelectMenu } from './SelectMenu';
import { Sheet } from './Sheet';

type Answers = {
  country: string;
  use_case: string;
  monthly_spend: string;
  card_preference: string;
  wallet_pay: string;
};

const QUESTIONS: {
  key: Exclude<keyof Answers, 'country'>;
  es: string;
  en: string;
  options: [value: string, es: string, en: string][];
}[] = [
  {
    key: 'use_case',
    es: '¿Para qué la usarías principalmente?',
    en: 'What would you mainly use it for?',
    options: [
      ['subscriptions', 'Suscripciones y software', 'Subscriptions and software'],
      ['online', 'Compras online', 'Online shopping'],
      ['travel', 'Viajes', 'Travel'],
      ['advertising', 'Publicidad y trabajo', 'Advertising and work'],
      ['daily', 'Gastos cotidianos', 'Everyday spending'],
      ['other', 'Otro uso', 'Another use'],
    ],
  },
  {
    key: 'monthly_spend',
    es: 'Gasto mensual aproximado',
    en: 'Approximate monthly spend',
    options: [
      ['under-100', 'Menos de $100', 'Less than $100'],
      ['100-500', '$100–$500', '$100–$500'],
      ['500-1000', '$500–$1.000', '$500–$1,000'],
      ['over-1000', 'Más de $1.000', 'More than $1,000'],
      ['prefer-not', 'Prefiero no decirlo', 'Prefer not to say'],
    ],
  },
  {
    key: 'card_preference',
    es: '¿Qué formato prefieres?',
    en: 'Which format do you prefer?',
    options: [
      ['virtual', 'Virtual', 'Virtual'],
      ['physical', 'Física', 'Physical'],
      ['both', 'Ambas', 'Both'],
    ],
  },
  {
    key: 'wallet_pay',
    es: '¿Qué tan importante es Apple Pay o Google Pay?',
    en: 'How important are Apple Pay or Google Pay?',
    options: [
      ['essential', 'Esencial', 'Essential'],
      ['important', 'Importante', 'Important'],
      ['not-important', 'No es importante', 'Not important'],
    ],
  },
];

const empty: Answers = {
  country: '',
  use_case: '',
  monthly_spend: '',
  card_preference: '',
  wallet_pay: '',
};

/** V2's early-access survey for a future GatoPago Card; it is not a card application. */
export function CardInterestSheet({
  settings,
  session,
  english: en,
  onClose,
  onSaved,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const complete = !!answers && Object.values(answers).every((value) => value.trim());

  useEffect(() => {
    const controller = new AbortController();
    api<{ interest: Answers | null }>(settings.apiOrigin, 'card-interest', {
      token: session.token,
      signal: controller.signal,
    })
      .then(({ interest }) => setAnswers(interest ? { ...empty, ...pick(interest) } : empty))
      .catch(() => {
        if (!controller.signal.aborted) setAnswers(empty);
      });
    return () => controller.abort();
  }, [settings, session]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!answers) return;
    setSaving(true);
    setError('');
    api(settings.apiOrigin, 'card-interest', {
      method: 'PUT',
      token: session.token,
      body: answers,
    })
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((failure: unknown) =>
        setError(
          `${en ? 'We could not save your answers.' : 'No pudimos guardar tus respuestas.'} ${failureMessage(failure, en)}`,
        ),
      )
      .finally(() => setSaving(false));
  }

  return (
    <Sheet titleId="card-interest-title" onClose={onClose} busy={saving}>
      <div className="sheet-handle mb-4" aria-hidden="true" />
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="meli-kicker mb-2">GatoPago Card</p>
          <h2 id="card-interest-title" className="font-display text-[24px] leading-tight">
            {en ? 'Help us design GatoPago Card' : 'Ayúdanos a diseñar GatoPago Card'}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            {en
              ? 'It is not available yet. Your answers help us validate demand and design the right product.'
              : 'Todavía no está disponible. Estas respuestas nos ayudan a validar demanda y diseñar el producto correcto.'}
          </p>
        </div>
        <button
          type="button"
          data-sheet-close
          aria-label={en ? 'Close' : 'Cerrar'}
          className="meli-square-action h-11 w-11 shrink-0"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {!answers ? (
        <p role="status" className="py-10 text-center text-[13px] text-text-muted">
          {en ? 'Loading…' : 'Cargando…'}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="block text-[13px] text-text-muted">
            <span className="mb-2 block">{en ? 'Country of residence' : 'País de residencia'}</span>
            <input
              required
              name="country"
              autoComplete="country-name"
              maxLength={80}
              value={answers.country}
              onChange={(event) => setAnswers({ ...answers, country: event.target.value })}
              className="meli-field h-12 text-[15px]"
              placeholder={en ? 'e.g. Bolivia' : 'Ej. Bolivia'}
            />
          </label>
          {QUESTIONS.map((question) => (
            <SelectMenu
              key={question.key}
              label={en ? question.en : question.es}
              placeholder={en ? 'Choose an option' : 'Selecciona una opción'}
              value={answers[question.key]}
              options={question.options.map(([value, es, english]) => ({
                value,
                label: en ? english : es,
              }))}
              onChange={(value) => setAnswers({ ...answers, [question.key]: value })}
              english={en}
            />
          ))}
          <p className="text-[11px] leading-relaxed text-text-faint">
            {en
              ? 'This is not a card application and does not guarantee availability, coverage, timing, or terms.'
              : 'Esto no es una solicitud de tarjeta ni garantiza disponibilidad, cobertura, fecha o condiciones.'}
          </p>
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saving || !complete}
            className="btn btn-primary btn-block"
          >
            {saving
              ? en
                ? 'Saving…'
                : 'Guardando…'
              : en
                ? 'Save my interest'
                : 'Guardar mi interés'}
          </button>
        </form>
      )}
    </Sheet>
  );
}

const pick = ({ country, use_case, monthly_spend, card_preference, wallet_pay }: Answers) => ({
  country,
  use_case,
  monthly_spend,
  card_preference,
  wallet_pay,
});
