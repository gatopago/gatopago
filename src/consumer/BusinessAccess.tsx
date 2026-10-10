'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Hex } from 'viem';
import type { ClientSettings } from '../lib/settings';
import { listBusinessKeys, removeBusinessKey, type BusinessKey } from '../wallet/businessKeys';
import type { Session } from '../wallet/session';
import { useAction } from '../wallet/useAction';

/**
 * Security's "Business access": the keys that sign in to GatoPago Business, each removable. An
 * access belongs to a passkey, not to a computer: a synced passkey gives the same key on all its
 * devices, so removing it can sign out several. Hidden while there is none.
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
  const [keys, setKeys] = useState<BusinessKey[]>([]);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  /** The access asked to be removed, waiting for the confirmation. */
  const [removing, setRemoving] = useState<Hex | null>(null);
  // A list read before a removal succeeded would show the removed access again.
  const revision = useRef(0);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let active = true;
    const asked = revision.current;
    listBusinessKeys(settings, session)
      .then((list) => {
        if (active && asked === revision.current) setKeys(list);
      })
      .catch(() => {
        if (active && asked === revision.current) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [settings, session, reload]);

  function remove(publicKey: Hex) {
    void run(async () => {
      await removeBusinessKey(settings, session, publicKey);
      revision.current++;
      setKeys((current) => current.filter((key) => key.public_key !== publicKey));
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
  if (keys.length === 0) return null;
  return (
    <section className="mb-6" aria-labelledby="business-access">
      <h3 id="business-access" className="meli-kicker mb-2 px-1">
        {t('title')}
      </h3>
      <p className="mb-3 px-1 text-[12px] leading-relaxed text-text-muted">{t('what')}</p>
      <div className="meli-paper-card divide-y divide-border">
        {keys.map((key) => (
          <div key={key.public_key} className="px-4 py-3">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px]">{t('access')}</p>
                <p className="text-[12px] text-text-muted">
                  {t('since', {
                    date: new Date(key.created_at * 1000).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                    key: key.owner.slice(-8),
                  })}
                </p>
              </div>
              {removing === key.public_key ? null : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRemoving(key.public_key)}
                  className="min-h-11 shrink-0 px-1 text-[13px] text-danger underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('remove')}
                </button>
              )}
            </div>
            {removing === key.public_key ? (
              <div className="mt-2 border-l-4 border-danger bg-danger/8 px-3 py-2">
                <p className="text-[12px] leading-relaxed">{t('removeWarning')}</p>
                {error ? (
                  <p role="alert" className="mt-1 text-[12px] text-danger">
                    {error}
                  </p>
                ) : null}
                <div className="mt-1 flex gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(key.public_key)}
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
