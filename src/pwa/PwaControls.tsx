'use client';

import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { getPwaSnapshot, getServerPwaSnapshot, requestInstall, subscribePwa } from './browser';
import {
  isReloadBlocked,
  reloadPage,
  serverReloadBlocked,
  subscribeReloadGuard,
} from './reload-guard';
import './pwa.css';

export function PwaControls({
  english: en = false,
  compact = false,
}: {
  english?: boolean;
  compact?: boolean;
}) {
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
      if (result === 'accepted')
        setNotice(
          en
            ? 'Open GatoPago from your device’s app launcher.'
            : 'Abre GatoPago desde el acceso de tu dispositivo.',
        );
      if (result === 'dismissed')
        setNotice(
          en
            ? 'Installation cancelled. You can keep using the browser.'
            : 'Instalación cancelada. Puedes seguir usando el navegador.',
        );
    } finally {
      setPrompting(false);
    }
  }
  const label = pwa.installed ? (en ? 'Reload' : 'Recargar') : en ? 'Install app' : 'Instalar app';
  return (
    <div className={`pwa-controls${compact ? ' pwa-controls--compact' : ''}`}>
      <button
        type="button"
        className="pwa-button"
        aria-label={label}
        title={
          guarded
            ? en
              ? 'Available after confirmation'
              : 'Disponible después de confirmar'
            : label
        }
        disabled={!pwa.ready || guarded || prompting}
        onClick={
          pwa.installed
            ? () => {
                reloadPage();
              }
            : () => {
                void install();
              }
        }
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
          {pwa.installed ? (
            <>
              <path d="M20 11a8 8 0 1 0-2.34 5.66" />
              <path d="M20 4v7h-7" />
            </>
          ) : (
            <>
              <path d="M12 3v11" />
              <path d="m8 10 4 4 4-4" />
              <path d="M5 14v5h14v-5" />
            </>
          )}
        </svg>
        <span className="pwa-button__label">{label}</span>
      </button>
      {notice ? (
        <div className="pwa-notices">
          <p className="pwa-note" role="status">
            {notice}
          </p>
          <button type="button" className="pwa-button" onClick={() => setNotice('')}>
            {en ? 'Close' : 'Cerrar'}
          </button>
        </div>
      ) : null}
      <dialog ref={dialog} className="pwa-dialog" aria-labelledby={titleId}>
        <h2 id={titleId}>{en ? 'Install GatoPago' : 'Instalar GatoPago'}</h2>
        <p>
          {en
            ? 'On iPhone or iPad: open this site in Safari, tap Share, then Add to Home Screen. If available, enable Open as Web App.'
            : 'En iPhone o iPad: abre este sitio en Safari, pulsa Compartir y luego Agregar a inicio. Si aparece, activa Abrir como app web.'}
        </p>
        <p>
          {en
            ? 'On Android or desktop: open the browser menu and look for Install app or Add to Home Screen. If unavailable, keep using GatoPago in your browser.'
            : 'En Android o computadora: abre el menú del navegador y busca Instalar aplicación o Agregar a inicio. Si no aparece, sigue usando GatoPago en el navegador.'}
        </p>
        <p>
          {en
            ? 'Installing does not create a wallet, save a passkey or move funds.'
            : 'Instalar no crea una wallet, guarda una passkey ni mueve fondos.'}
        </p>
        <form method="dialog">
          <button className="pwa-button" type="submit">
            {en ? 'Got it' : 'Entendido'}
          </button>
        </form>
      </dialog>
    </div>
  );
}
