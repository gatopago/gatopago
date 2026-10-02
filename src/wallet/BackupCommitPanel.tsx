'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { BackupCommitFlow } from './backup-commit-flow';
import { requestPasskeyProof } from './passkeys';
import BackupProgress from './BackupProgress';

export default function BackupCommitPanel({ runtime, uid, pin, context, english: en }: {
  runtime: BrowserAuth; uid: string; pin: CreationProfilePin;
  context: ConstructorParameters<typeof BackupCommitFlow>[2]; english: boolean;
}) {
  const [flow] = useState(() => new BackupCommitFlow(() => runtime.backup(uid, pin), requestPasskeyProof, context));
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot), id = useId();
  const busy = ['loading', 'tracking', 'proving', 'submitting'].includes(state.phase);
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) flow.invalidate(); else flow.checkSession(); });
    return () => { unsubscribe(); flow.dispose(); };
  }, [runtime, uid, flow]);
  return <section aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h5 id={`${id}-title`}>{en ? 'Final security confirmation' : 'Confirmación final de seguridad'}</h5>
    <p>{en ? 'This separate consent can only be prepared after the proposal is observed onchain. Review it before signing. It does not transfer funds.'
      : 'Este consentimiento separado sólo se puede preparar cuando la propuesta se observa en red. Revísalo antes de firmar. No transfiere fondos.'}</p>
    {state.error ? <p role="alert" className="auth-error">{['cancelled', 'context', 'unsupported', 'busy', 'invalid-response', 'backup/verification-stopped'].includes(state.error)
      ? (en ? 'The key confirmation was cancelled or could not be verified. No consent was sent. This does not mean your key is missing; you can try again.'
        : 'La confirmación de llave se canceló o no pudo verificarse. No se envió consentimiento. No significa que falte tu llave; puedes volver a intentar.')
      : state.error === 'backup/status-unavailable'
        ? (en ? 'We could not read the latest status. Your consent is still recorded. You can check again without signing or resending.'
          : 'No pudimos consultar el estado reciente. Tu consentimiento sigue registrado. Puedes volver a consultar sin firmar ni reenviar.')
      : state.error === 'backup/status-stopped'
      ? (en ? 'Status lookup stopped. You can check again; no authorization was sent.' : 'Consulta de estado detenida. Puedes volver a consultar; no se envió una autorización.')
      : state.error === 'backup/expired'
      ? (en ? 'The signature window expired. Read this same request to check its recorded result.' : 'Venció el plazo de firma. Consulta esta misma solicitud para comprobar su resultado registrado.')
      : (en ? 'This step could not be completed. No backup is confirmed. Check the same request; do not create another one to resolve an uncertain result.'
        : 'No se pudo completar este paso. No hay activación confirmada. Consulta la misma solicitud; no crees otra para resolver un resultado incierto.')}</p> : null}
    {state.phase === 'idle' ? <>
      <button type="button" className="auth-primary btn btn-primary btn-block" onClick={() => void flow.prepare()}>{en ? 'Review final confirmation' : 'Revisar confirmación final'}</button>
      <details><summary>{en ? 'Resume a final confirmation' : 'Retomar una confirmación final'}</summary>
        <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('commit') as HTMLInputElement;
          const value = input.value; input.value = ''; void flow.restore(value); }}>
          <label htmlFor={`${id}-resume`}>{en ? 'Saved confirmation identifier' : 'Identificador de confirmación guardado'}</label>
          <input id={`${id}-resume`} name="commit" required maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <button className="auth-secondary btn btn-ghost btn-block" type="submit">{en ? 'Read confirmation' : 'Consultar confirmación'}</button>
        </form>
      </details>
    </> : null}
    {state.commitId ? <p>{en ? 'Keep this identifier together with the proposal locator to resume after closing this page:'
      : 'Conserva este identificador junto al localizador de la propuesta para retomar después de cerrar la página:'} <code>{state.commitId}</code></p> : null}
    {state.review ? <div className="initialization-review">
      <p>{en ? 'Account' : 'Cuenta'}: <code>{state.review.account}</code></p>
      <p>{en ? 'Network' : 'Red'}: <code>{state.review.network}</code></p>
      <p>{en ? 'Signature deadline' : 'Plazo de firma'}: <time dateTime={new Date(state.review.validUntil * 1000).toISOString()}>
        {new Date(state.review.validUntil * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}</time></p>
      <details><summary>{en ? 'Exact confirmation digest' : 'Digest exacto de confirmación'}</summary><code>{state.review.digest}</code></details>
    </div> : null}
    {state.phase === 'ready' ? <>
      <button className="auth-secondary btn btn-ghost btn-block" type="button" disabled={state.proofReady || state.submitted} onClick={() => void flow.confirm()}>
        {en ? 'Sign this confirmation with my key' : 'Firmar esta confirmación con mi llave'}</button>
      <button className="auth-primary btn btn-primary btn-block" type="button" disabled={!state.proofReady} onClick={() => void flow.authorize()}>
        {state.submitted ? (en ? 'Retry the same signed confirmation' : 'Reintentar la misma confirmación firmada')
          : (en ? 'Submit final consent' : 'Enviar consentimiento final')}</button>
    </> : null}
    {state.phase === 'absent' ? <button className="auth-secondary btn btn-ghost btn-block" type="button" onClick={() => void flow.prepare()}>
      {en ? 'Retry preparation with this identifier' : 'Reintentar preparación con este identificador'}</button> : null}
    {state.phase === 'authorized' && !state.progress ? <p role="status">{en
      ? 'Final consent recorded. This is not proof of onchain backup. Delivery and independent confirmation of the installed policy are still required.'
      : 'Consentimiento final registrado. Esto no prueba la activación onchain. Aún se requieren entrega y confirmación independiente de la política instalada.'}</p> : null}
    {state.progress ? <BackupProgress progress={state.progress} english={en} /> : null}
    {state.phase === 'authorized' ? <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => void flow.checkProgress()}>
      {en ? 'Check onchain backup' : 'Consultar activación en red'}</button> : null}
    {busy ? <><p role="status">{en ? 'Waiting for this step…' : 'Esperando este paso…'}</p>
      <button className="auth-secondary btn btn-ghost btn-block" type="button" onClick={() => flow.stop()}>{en ? 'Stop waiting' : 'Detener espera'}</button></>
      : state.commitId && !['closed', 'authorized'].includes(state.phase) ? <button className="auth-secondary btn btn-ghost btn-block" type="button" onClick={() => void flow.restore()}>
        {en ? 'Check this final consent' : 'Consultar este consentimiento final'}</button> : null}
    {state.phase === 'closed' ? <p role="status">{en ? 'Session closed. Sign in again to resume.' : 'Sesión cerrada. Vuelve a entrar para retomar.'}</p> : null}
  </section>;
}
