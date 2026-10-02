'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import type { BrowserAuth } from '../auth/browser';
import type { EnabledAuthConfig } from '../auth/config';
import { holdPageReload } from '../pwa/reload-guard';
import { clearTransferBookmark, type TransferBookmark } from './transfer-bookmark';
import { parseTransferRestoration } from './transfer-restoration';
import type { TransferSelection } from './transfer-preparation';
import { formatTransferAsset } from './transfer-form';
import type { parseTransferStatus } from './transfers';
import { TransferReceipt } from './TransferReceipt';

type Result = ReturnType<typeof parseTransferRestoration>;
type Props = { runtime: BrowserAuth; uid: string; selected: TransferSelection; bookmark: TransferBookmark;
  environment: EnabledAuthConfig['deployment']; english: boolean;
  onReconciled?: (status: ReturnType<typeof parseTransferStatus>) => void; onClosed?: () => void };

/** Resume a server-owned operation, not its signing ceremony. All mount/timer
 * work is GET-only. An explicit delivery locks this instance before the POST;
 * an ambiguous response never restores its Send button. */
export function TransferRestoration({ runtime, uid, selected, bookmark, environment, english: en, onReconciled, onClosed }: Props) {
  const [result, setResult] = useState<Result | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [closed, setClosed] = useState(false), [attempted, setAttempted] = useState(false);
  const active = useRef<AbortController | null>(null), locked = useRef(false), mounted = useRef(false);
  const session = useRef<ReturnType<BrowserAuth['transferRestoration']> | null>(null);
  const read = useCallback(async () => {
    if (active.current || !mounted.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(false);
    try {
      session.current ??= runtime.transferRestoration(uid); session.current.assertCurrent();
      const value = await session.current.restore(selected, bookmark, controller.signal);
      if (controller.signal.aborted || active.current !== controller || !mounted.current) return;
      session.current.assertCurrent();
      setResult(parseTransferRestoration(value.wire, selected, bookmark, environment));
    } catch {
      if (controller.signal.aborted || active.current !== controller || !mounted.current) return;
      try { session.current?.assertCurrent(); } catch { setClosed(true); setResult(null); return; }
      setError(true);
    } finally { if (active.current === controller) { active.current = null; if (mounted.current) setBusy(false); } }
  }, [runtime, uid, selected, bookmark, environment]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = runtime.subscribe(identity => {
      try { if (identity?.uid !== uid) throw new Error('Session changed'); session.current?.assertCurrent(); }
      catch { active.current?.abort(); active.current = null; session.current = null; setClosed(true); setResult(null); }
    });
    void read();
    return () => { mounted.current = false; unsubscribe(); active.current?.abort(); active.current = null; };
  }, [runtime, uid, read]);
  const status = result?.transfer?.status;
  const metadata = result?.transfer?.metadata;
  useEffect(() => { if (status?.status === 'reconciled') onReconciled?.(status); }, [status, onReconciled]);
  const terminal = !!result && (result.transfer ? !result.transfer.status.funds_reserved
    && ['reconciled','expired'].includes(result.transfer.status.status) : result.checked_at >= bookmark.expires_at);
  useEffect(() => {
    if (closed || busy || error || terminal || status?.status === 'review_required') return;
    const check = () => { if (document.visibilityState === 'visible') void read(); };
    const timer = window.setTimeout(check, 5_000); document.addEventListener('visibilitychange', check);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', check); };
  }, [closed, busy, error, terminal, status, read]);
  async function deliver() {
    if (!result || active.current || locked.current || closed || error || result.transfer?.status.status !== 'held') return;
    const controller = new AbortController(); active.current = controller; locked.current = true; setAttempted(true); setBusy(true); setError(false);
    const release = holdPageReload();
    try {
      session.current!.assertCurrent();
      await session.current!.deliver(selected, bookmark, result.wire, controller.signal);
    } catch { if (mounted.current && !controller.signal.aborted) setError(true); }
    finally {
      release();
      if (active.current === controller) { active.current = null; if (mounted.current) { setBusy(false); void read(); } }
    }
  }
  if (closed) return <p role="alert">{en ? 'Your session changed. Reopen this account.' : 'Tu sesión cambió. Vuelve a abrir esta cuenta.'}</p>;
  return <section aria-busy={busy}>
    <h3>{en ? 'Your existing transfer' : 'Tu envío existente'}</h3>
    <p>{en ? 'We are recovering the same transfer. This does not sign or create another one.' : 'Estamos recuperando el mismo envío. Esto no firma ni crea otro.'}</p>
    {error ? <p role="alert">{en ? 'We could not verify the result. Do not repeat the transfer.' : 'No pudimos verificar el resultado. No repitas el envío.'}</p> : null}
    {result?.transfer && metadata ? <>
      <TransferReceipt english={en} request={result.transfer.candidate.request} selected={selected} status={result.transfer.status}
        amountAtomic={result.transfer.candidate.funding.amount_atomic} metadata={metadata}
        onClose={!error && !busy ? () => { if (active.current) return; session.current!.assertCurrent(); clearTransferBookmark(bookmark); onClosed?.(); } : undefined} />
      {status?.status === 'held' ? <dl>
        <dt>{en ? 'Maximum network cost' : 'Coste máximo de red'}</dt>
        <dd>{result.transfer.review.context.sponsorship ? (en ? 'Covered by GatoPago' : 'Cubierto por GatoPago')
          : formatTransferAsset(result.transfer.review.context.budget.maximum_native_gas_atomic, result.transfer.review.context.native_asset_id, metadata)}</dd>
        <dt>{en ? 'Platform fee' : 'Comisión de plataforma'}</dt>
        <dd>{formatTransferAsset(result.transfer.review.context.budget.platform_fee.amount_atomic, result.transfer.candidate.request.asset_id, metadata)}</dd>
      </dl> : null}
      {status?.status === 'held' && !attempted && result.transfer.candidate.request.client_release_id === CLIENT_RELEASE_ID
        && result.checked_at < bookmark.expires_at ? <button type="button" className="auth-primary btn btn-primary btn-block"
          disabled={busy || error} onClick={() => void deliver()}>{en ? 'Send this transfer' : 'Enviar este envío'}</button> : null}
      {attempted && status?.status === 'held' ? <p role="status">{en ? 'Delivery was attempted. Check its result; it will not be sent again automatically.' : 'Se intentó la entrega. Consulta el resultado; no se enviará otra vez automáticamente.'}</p> : null}
    </> : result ? <p role="status">{terminal
      ? (en ? 'No saved transfer was found and its sending window has ended.' : 'No se encontró un envío guardado y ya venció su plazo de envío.')
      : (en ? 'The server has not found the reservation yet. Its result may still be pending.' : 'El servidor aún no encuentra la reserva. El resultado puede seguir pendiente.')}</p> : null}
    <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => void read()}>{en ? 'Check this transfer' : 'Consultar este envío'}</button>
    {terminal && !result?.transfer && !error ? <button type="button" className="auth-primary btn btn-primary btn-block"
      disabled={busy} onClick={() => { session.current!.assertCurrent(); clearTransferBookmark(bookmark); onClosed?.(); }}>{en ? 'Done' : 'Listo'}</button> : null}
  </section>;
}
