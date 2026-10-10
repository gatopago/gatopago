'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ClientSettings } from '../lib/settings';
import { api } from '../wallet/api';
import { useFailureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { SelectMenu } from './SelectMenu';
import { Sheet } from './Sheet';
import { useTranslations } from 'next-intl';

type Answers = {
  country: string;
  use_case: string;
  monthly_spend: string;
  card_preference: string;
  wallet_pay: string;
};

/** The survey's questions and their answers' values; the words live in the texts. */
const QUESTIONS = [
  {
    key: 'use_case',
    options: ['subscriptions', 'online', 'travel', 'advertising', 'daily', 'other'],
  },
  {
    key: 'monthly_spend',
    options: ['under-100', '100-500', '500-1000', 'over-1000', 'prefer-not'],
  },
  { key: 'card_preference', options: ['virtual', 'physical', 'both'] },
  { key: 'wallet_pay', options: ['essential', 'important', 'not-important'] },
] as const satisfies { key: Exclude<keyof Answers, 'country'>; options: readonly string[] }[];

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
  onClose,
  onSaved,
}: {
  settings: ClientSettings;
  session: Session;
  onClose: () => void;
  onSaved: () => void;
}) {
  const messageFor = useFailureMessage();
  const t = useTranslations('CardInterestSheet');
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
      .catch((failure: unknown) => setError(`${t('couldNotSaveAnswers')} ${messageFor(failure)}`))
      .finally(() => setSaving(false));
  }

  return (
    <Sheet titleId="card-interest-title" onClose={onClose} busy={saving}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="meli-kicker mb-2">GatoPago Card</p>
          <h2 id="card-interest-title" className="font-display text-[24px] leading-tight">
            {t('helpDesignGatopagoCard')}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            {t('notAvailableYetAnswers')}
          </p>
        </div>
        <button
          type="button"
          data-sheet-close
          aria-label={t('close')}
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
          {t('loading')}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="block text-[13px] text-text-muted">
            <span className="mb-2 block">{t('countryResidence')}</span>
            <input
              required
              name="country"
              autoComplete="country-name"
              maxLength={80}
              value={answers.country}
              onChange={(event) => setAnswers({ ...answers, country: event.target.value })}
              className="meli-field h-12 text-[15px]"
              placeholder={t('eGBolivia')}
            />
          </label>
          {QUESTIONS.map((question) => (
            <SelectMenu
              key={question.key}
              label={t(`questions.${question.key}`)}
              placeholder={t('chooseOption')}
              value={answers[question.key]}
              options={question.options.map((value) => ({
                value,
                label: t(`answers.${value}`),
              }))}
              onChange={(value) => setAnswers({ ...answers, [question.key]: value })}
            />
          ))}
          <p className="text-[11px] leading-relaxed text-text-faint">
            {t('notCardApplicationDoes')}
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
            {saving ? t('saving') : t('saveMyInterest')}
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
