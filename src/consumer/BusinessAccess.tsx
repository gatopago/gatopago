'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import {
  listBusinessAccess,
  removeBusinessKey,
  removeBusinessSession,
} from '../wallet/businessKeys';
import type { Session } from '../wallet/session';
import { useAction } from '../wallet/useAction';

/** One access as Security shows it: a Business key, or a console session a QR opened without one. */
interface Access {
  id: string;
  title: string;
  detail: string;
  warning: string;
  remove: () => Promise<unknown>;
}

/**
 * Security's "Business access": the keys that sign in to GatoPago Business and the console sessions
 * a QR opened without a key, each removable. A key belongs to a passkey, not to a computer: a synced
 * passkey gives the same key on all its devices, so removing it can sign out several. Hidden while
 * there is none.
 */
export function BusinessAccess({
  settings,
  session,
}: {
  settings: ClientSettings;
  session: Session;
}) {
  const t = useTranslations('BusinessAccess');
  const locale = useLocale();
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  /** The access asked to be removed, waiting for the confirmation. */
  const [removing, setRemoving] = useState<string | null>(null);
  // A list read before a removal succeeded would show the removed access again.
  const revision = useRef(0);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let active = true;
    const asked = revision.current;
    const date = (seconds: number) =>
      new Date(seconds * 1000).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    listBusinessAccess(settings, session)
      .then(({ keys, sessions }) => {
        if (!active || asked !== revision.current) return;
        setAccesses([
          ...keys.map((key) => ({
            id: key.public_key,
            title: t('access'),
            detail: t('since', { date: date(key.created_at), key: key.owner.slice(-8) }),
            warning: t('removeWarning'),
            remove: () => removeBusinessKey(settings, session, key.public_key),
          })),
          ...sessions.map((opened) => ({
            id: opened.id,
            title: t('qrSession'),
            detail: t('qrDetail', {
              device: opened.place ? `${opened.device}, ${opened.place}` : opened.device,
              // Twelve hours at most: the time says more than the day.
              date: new Date(opened.ends_at * 1000).toLocaleString(locale, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }),
            }),
            warning: t('removeSessionWarning'),
            remove: () => removeBusinessSession(settings, session, opened.id),
          })),
        ]);
      })
      .catch(() => {
        if (active && asked === revision.current) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [settings, session, reload, locale, t]);

  function remove(access: Access) {
    void run(async () => {
      await access.remove();
      revision.current++;
      setAccesses((current) => current.filter((item) => item.id !== access.id));
      setRemoving(null);
    });
  }

  if (failed)
    return (
      <p role="alert" className="mb-6 px-1 text-[12px] leading-relaxed text-pending">
        {t('couldNotLoad')}{' '}
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setReload((current) => current + 1);
          }}
          className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
        >
          {t('tryAgain')}
        </button>
      </p>
    );
  if (accesses.length === 0) return null;
  return (
    <section className="mb-6" aria-labelledby="business-access">
      <h3 id="business-access" className="meli-kicker mb-2 px-1">
        {t('title')}
      </h3>
      <p className="mb-3 px-1 text-[12px] leading-relaxed text-text-muted">{t('what')}</p>
      <div className="meli-paper-card divide-y divide-border">
        {accesses.map((access) => (
          <div key={access.id} className="px-4 py-3">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px]">{access.title}</p>
                <p className="text-[12px] text-text-muted">{access.detail}</p>
              </div>
              {removing === access.id ? null : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRemoving(access.id)}
                  className="min-h-11 shrink-0 px-1 text-[13px] text-danger underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('remove')}
                </button>
              )}
            </div>
            {removing === access.id ? (
              <div className="mt-2 border-l-4 border-danger bg-danger/8 px-3 py-2">
                <p className="text-[12px] leading-relaxed">{access.warning}</p>
                {error ? (
                  <p role="alert" className="mt-1 text-[12px] text-danger">
                    {error}
                  </p>
                ) : null}
                <div className="mt-1 flex gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(access)}
                    className="min-h-11 text-[13px] font-semibold text-danger underline underline-offset-2"
                  >
                    {busy ? t('removing') : t('confirmRemove')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                    className="min-h-11 text-[13px] text-text-muted"
                  >
                    {t('keep')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
