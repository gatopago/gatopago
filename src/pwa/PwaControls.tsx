'use client';

import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { getPwaSnapshot, getServerPwaSnapshot, requestInstall, subscribePwa } from './browser';
import { isReloadBlocked, serverReloadBlocked, subscribeReloadGuard } from './reload-guard';
import './pwa.css';
import { useTranslations } from 'next-intl';

/** Installing the app; once installed (opened from the home screen) there is nothing to show. */
export function PwaControls({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('PwaControls');
  const pwa = useSyncExternalStore(subscribePwa, getPwaSnapshot, getServerPwaSnapshot);
  const guarded = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  const [prompting, setPrompting] = useState(false);
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  async function install() {
    if (guarded || prompting) return;
    setPrompting(true);
    setNotice('');
    try {
      const result = await requestInstall();
      if (result === 'instructions') dialog.current?.showModal();
      if (result === 'accepted') setNotice(t('openGatopagoDevicesApp'));
      if (result === 'dismissed') setNotice(t('installationCancelledKeepUsing'));
    } finally {
      setPrompting(false);
    }
  }
  if (pwa.installed) return null;
  const label = t('installApp');
  return (
    <div className={`pwa-controls${compact ? ' pwa-controls--compact' : ''}`}>
      <button
        type="button"
        className="pwa-button"
        aria-label={label}
        title={guarded ? t('availableAfterConfirmation') : label}
        disabled={!pwa.ready || guarded || prompting}
        onClick={() => void install()}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden="true"
        >
          <path d="M12 3v11" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 14v5h14v-5" />
        </svg>
        <span className="pwa-button__label">{label}</span>
      </button>
      {notice ? (
        <div className="pwa-notices">
          <p className="pwa-note" role="status">
            {notice}
          </p>
          <button type="button" className="pwa-button" onClick={() => setNotice('')}>
            {t('close')}
          </button>
        </div>
      ) : null}
      <dialog ref={dialog} className="pwa-dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{t('installGatopago')}</h2>
        <p>{t('iphoneIpadOpenSite')}</p>
        <p>{t('androidDesktopOpenBrowser')}</p>
        <p>{t('installingDoesNotCreate')}</p>
        <form method="dialog">
          <button className="pwa-button" type="submit">
            {t('got')}
          </button>
        </form>
      </dialog>
    </div>
  );
}
