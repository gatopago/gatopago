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
        title={label}
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
        <span aria-hidden="true">{pwa.installed ? '↻' : '↓'}</span>
        <span className="pwa-button__label">{label}</span>
      </button>
      {guarded || pwa.waiting || pwa.workerError || notice ? (
        <div className="pwa-notices">
          {guarded ? (
            <p className="pwa-note" role="status">
              {en
                ? 'Finish the current operation before reloading or installing.'
                : 'Termina la operación actual antes de recargar o instalar.'}
            </p>
          ) : null}
          {pwa.waiting ? (
            <p className="pwa-note" role="status">
              {en
                ? 'An update is ready. Finish your operations, close all GatoPago windows and reopen the app to apply it. Reloading this page alone will not apply it.'
                : 'Hay una actualización lista. Termina tus operaciones, cierra todas las ventanas de GatoPago y vuelve a abrir la app para aplicarla. Recargar sólo esta página no la aplicará.'}
            </p>
          ) : null}
          {pwa.workerError ? (
            <p className="pwa-note" role="status">
              {en
                ? 'Offline support could not start. You can keep using the app online.'
                : 'No se pudo preparar el modo offline. Puedes seguir usando la app con conexión.'}
            </p>
          ) : null}
          {notice ? (
            <p className="pwa-note" role="status">
              {notice}
            </p>
          ) : null}
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
