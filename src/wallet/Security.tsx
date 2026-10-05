'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { encodeFunctionData, type Hex } from 'viem';
import { walletContracts } from '@gatopago/shared/networks';
import {
  gatopagoAccountAbi,
  ownersAfter,
  passkeyOwner,
  signApproval,
} from '@gatopago/shared/wallet';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader } from '../consumer/Primitives';
import { localizedPath } from '../consumer/routes';
import { Sheet } from '../consumer/Sheet';
import { ScreenLoading } from '../consumer/Skeleton';
import { StageOverlay } from '../consumer/StageOverlay';
import type { ClientSettings } from '../lib/settings';
import { MeliSprite } from '../marketing/MeliSprite';
import {
  applyApprovals,
  appliedApprovals,
  gatopagoAccount,
  networkName,
  publicClient,
} from './account';
import { api, type Approvals } from './api';
import { failureMessage } from './messages';
import { createPasskey } from './passkey';
import type { Session, Wallet } from './session';

type State = { owners: Hex[]; total: number; applied: Record<string, number | null> };

/**
 * `/settings/security`, as V2's security center: the passkeys that own the account. Adding or
 * removing one is an approval signed once and applied on every network: now where the account
 * exists, later where it is first used.
 */
export function Security({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { wallet } = session;
  const current = passkeyOwner(walletContracts.webAuthnVerifier, wallet.publicKey).toLowerCase();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [dialog, setDialog] = useState<'stored' | 'options' | { remove: Hex } | null>(null);

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    readKeys(settings, wallet)
      .then((value) => {
        if (active) setState(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failureMessage(failure, en));
      });
    return () => {
      active = false;
    };
  }, [settings, wallet, en, revision]);

  function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    action()
      .then(() => {
        setDialog(null);
        setRevision((value) => value + 1);
      })
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  /**
   * Signs `call` as the next approval and stores it. It is applied where the account exists, or on
   * every network when removing a key, so the removed key cannot use a network first.
   */
  async function approve(call: Hex, everywhere: boolean) {
    const account = await gatopagoAccount(settings, wallet, settings.homeNetwork);
    const signature = await signApproval(account, BigInt(state!.total), call);
    await api(settings.apiOrigin, `approvals/${wallet.address}`, {
      token: session.token,
      body: { call, signature, initial_owners: wallet.initialOwners },
    });
    for (const id of settings.networks)
      if (everywhere || (await publicClient(settings, id).getCode({ address: wallet.address })))
        await applyApprovals(settings, session, id);
  }

  const addKey = (attachment?: AuthenticatorAttachment) =>
    perform(async () => {
      const backup = await createPasskey('GatoPago backup', wallet.address, attachment);
      await approve(
        encodeFunctionData({
          abi: gatopagoAccountAbi,
          functionName: 'addOwners',
          args: [[passkeyOwner(walletContracts.webAuthnVerifier, backup.publicKey)]],
        }),
        false,
      );
    });

  const keyCount = state?.owners.length ?? null;
  const backedUp = (keyCount ?? 0) > 1;
  const removing = dialog && typeof dialog === 'object' ? dialog.remove : null;
  return (
    <>
      <BackHeader title={en ? 'Security' : 'Seguridad'} english={en} to="/settings" />
      <StageOverlay
        label={
          busy
            ? en
              ? 'Confirm the change on your device…'
              : 'Confirma el cambio en tu dispositivo…'
            : null
        }
        spinner={false}
      />
      {!state && !error ? (
        <ScreenLoading kind="form" english={en} />
      ) : (
        <div className="animate-fade-up">
          <section
            className="meli-ink-card relative mb-6 min-h-[196px] overflow-hidden p-5"
            aria-labelledby="security-hero-title"
          >
            <div className="relative z-1 max-w-[270px] pr-10">
              <p className="meli-kicker mb-3 !text-cat-500">
                {en ? 'Security center' : 'Centro de seguridad'}
              </p>
              <h2
                id="security-hero-title"
                className="font-display text-[25px] leading-[1.02] text-[#fff8f0]"
              >
                {en ? 'Your money answers to your keys.' : 'Tu dinero responde a tus llaves.'}
              </h2>
              <p className="mt-3 text-[12px] leading-relaxed text-[rgb(255_248_240/.68)]">
                {en
                  ? 'Your device or passkey manager keeps the private part of a cryptographic key. Your fingerprint, face or PIN unlocks it to authorize each movement. GatoPago never receives that private part.'
                  : 'Tu dispositivo o gestor de passkeys guarda la parte privada de una llave criptográfica. Tu huella, rostro o PIN la desbloquea para autorizar cada movimiento. GatoPago nunca recibe esa parte privada.'}
              </p>
              <span className="mt-4 inline-flex items-center gap-2 border border-[rgb(255_248_240/.3)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#fff8f0]">
                <i className={`h-2 w-2 ${state ? 'bg-growth' : 'bg-pending'}`} aria-hidden="true" />
                {state
                  ? en
                    ? 'Protection active'
                    : 'Protección activa'
                  : en
                    ? 'Status not verified'
                    : 'Estado no verificado'}
              </span>
            </div>
            <MeliSprite
              variant="head-focused"
              motion="idle"
              className="pointer-events-none absolute -right-3 -bottom-2 w-28 opacity-95"
            />
          </section>

          {error ? (
            <div className="mb-6 border-2 border-pending bg-pending/10 p-4" role="alert">
              <p className="font-display text-[15px] text-pending">{error}</p>
              {!state ? (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setRevision((value) => value + 1);
                  }}
                  className="btn btn-ghost mt-3 min-h-10 px-4 text-[12px]"
                >
                  {en ? 'Try again' : 'Reintentar'}
                </button>
              ) : null}
            </div>
          ) : null}

          {state ? (
            <>
              <section
                className="meli-paper-card meli-paper-card--strong mb-6 overflow-hidden"
                aria-labelledby="security-keys-title"
              >
                <div className="flex items-start gap-3 border-b-2 border-text p-5">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border-2 border-text bg-cat-500 text-text shadow-[3px_3px_0_var(--color-cat-700)]">
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 1a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2V5a4 4 0 0 0-4-4Z" />
                      <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p id="security-keys-title" className="meli-kicker mb-2">
                      {en ? 'Your keys' : 'Tus llaves'}
                    </p>
                    <h3 className="font-display text-[18px] leading-tight">
                      {en ? 'Your device protects your key' : 'Tu dispositivo protege tu llave'}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                      {en
                        ? 'Your fingerprint, face or PIN unlocks the private part that authorizes each payment. GatoPago only records the public key.'
                        : 'Tu huella, rostro o PIN desbloquea la parte privada que autoriza cada pago. GatoPago solo registra la llave pública.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 border-b border-text">
                  <div className="border-r border-text bg-surface-2 px-4 py-4">
                    <p className="type-mono text-[25px] font-bold leading-none text-growth">
                      {keyCount}
                    </p>
                    <p className="mt-2 text-[11px] leading-tight text-text-muted">
                      {keyCount === 1
                        ? en
                          ? 'Active key'
                          : 'Llave activa'
                        : en
                          ? 'Active keys'
                          : 'Llaves activas'}
                    </p>
                  </div>
                  <div className="bg-surface-2 px-4 py-4">
                    <p className="font-display text-[25px] leading-none text-pending">
                      {backedUp ? (en ? 'Yes' : 'Sí') : '—'}
                    </p>
                    <p className="mt-2 text-[11px] leading-tight text-text-muted">
                      {en ? 'Backup' : 'Respaldo'}
                    </p>
                  </div>
                </div>

                <div className="p-5">
                  <button
                    type="button"
                    onClick={() => addKey()}
                    disabled={busy}
                    aria-describedby="add-passkey-help"
                    className="btn btn-primary btn-block"
                  >
                    {busy
                      ? en
                        ? 'Adding…'
                        : 'Agregando…'
                      : en
                        ? 'Add a backup passkey'
                        : 'Agregar passkey de respaldo'}
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog('stored')}
                      className="btn-text min-h-11 px-2 text-[12px]"
                    >
                      {en ? 'Where is it stored?' : '¿Dónde se guarda?'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog('options')}
                      disabled={busy}
                      className="btn-text min-h-11 px-2 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {en ? 'Other options' : 'Otras opciones'}
                    </button>
                  </div>
                  <p
                    id="add-passkey-help"
                    className="mt-3 px-0.5 text-[12px] leading-relaxed text-text-faint"
                  >
                    {en
                      ? 'Save it in another password manager or on a security key. Every key has full control of the account.'
                      : 'Guárdala en otro gestor de contraseñas o en una llave física. Cada llave tiene control total de la cuenta.'}
                  </p>
                </div>

                <div className="border-t border-border">
                  <div className="px-5 pt-5 pb-2">
                    <h4 className="font-display text-[16px]">
                      {en ? 'Registered keys' : 'Llaves registradas'}
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                      {en
                        ? 'You can remove one without affecting the others.'
                        : 'Puedes retirar una sin afectar las demás.'}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {state.owners.map((owner, index) => {
                      const mine = owner.toLowerCase() === current;
                      return (
                        <div key={owner} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-text">
                                {mine
                                  ? en
                                    ? 'This device'
                                    : 'Este dispositivo'
                                  : en
                                    ? `Key ${index + 1}`
                                    : `Llave ${index + 1}`}
                              </p>
                              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-text-faint">
                                …{owner.slice(-8)}
                                {mine ? (en ? ' · in use' : ' · en uso') : ''}
                              </p>
                            </div>
                            {!mine ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setDialog({ remove: owner })}
                                className="min-h-11 px-1 text-[12px] text-danger underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {en ? 'Remove' : 'Quitar'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {state.owners.length === 1 ? (
                    <p className="mx-5 mb-4 border-l-4 border-pending bg-pending/10 px-3 py-2 text-[11px] leading-relaxed text-pending">
                      {en
                        ? 'This is your only key. Add a backup before you need it.'
                        : 'Esta es tu única llave. Agrega una de respaldo antes de necesitarla.'}
                    </p>
                  ) : null}
                </div>
              </section>

              {state.total > 0 ? (
                <section
                  className="meli-paper-card meli-paper-card--strong mb-6 overflow-hidden"
                  aria-labelledby="chain-security-title"
                >
                  <div className="border-b-2 border-text p-5">
                    <p className="meli-kicker mb-2">
                      {en ? 'Multi-network protection' : 'Protección multired'}
                    </p>
                    <h3 id="chain-security-title" className="font-display text-[18px]">
                      {en
                        ? 'The same keys, authorized per network'
                        : 'Las mismas llaves, autorizadas por red'}
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                      {en
                        ? 'You sign each key change once. It applies on a network automatically the next time you use it there.'
                        : 'Cada cambio de llaves se firma una vez. Se aplica en cada red automáticamente la próxima vez que la usas.'}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {settings.networks.map((id) => {
                      const applied = state.applied[id];
                      const synced = applied === null || applied >= state.total;
                      return (
                        <div key={id} className="flex items-start justify-between gap-3 p-5">
                          <div>
                            <p className="font-display text-[15px]">{networkName(id)}</p>
                            <p
                              className={`mt-1 font-mono text-[9px] uppercase tracking-[0.07em] ${synced ? 'text-growth' : 'text-pending'}`}
                            >
                              {applied === null
                                ? en
                                  ? 'Applied on first use'
                                  : 'Se aplica al primer uso'
                                : synced
                                  ? en
                                    ? 'Keys synced'
                                    : 'Llaves sincronizadas'
                                  : en
                                    ? 'Needs sync'
                                    : 'Requiere sincronización'}
                            </p>
                          </div>
                          {!synced ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => perform(() => applyApprovals(settings, session, id))}
                              className="btn btn-primary min-h-10 px-4 text-[12px]"
                            >
                              {en ? 'Sync' : 'Sincronizar'}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          <NavigationLink
            href={localizedPath('/settings/security/recovery', en)}
            className="meli-path-card-app interactive-surface mb-6 min-h-[104px] p-4 text-left"
          >
            <span aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <span className="min-w-0">
              <strong className="block font-display text-[17px]">
                {en ? 'Recovery and access' : 'Recuperación y acceso'}
              </strong>
              <small className="mt-1 block text-[11px] leading-relaxed text-text-muted">
                {en
                  ? 'What to do if you lose a key, and why a backup matters.'
                  : 'Qué hacer si pierdes una llave y por qué importa tener respaldo.'}
              </small>
              <small className="mt-2 block font-mono text-[9px] uppercase tracking-[0.06em] text-cat-700">
                {backedUp
                  ? en
                    ? 'Backup plan active'
                    : 'Plan de respaldo activo'
                  : en
                    ? 'Set up your backup plan'
                    : 'Configura tu plan de respaldo'}
              </small>
            </span>
            <span aria-hidden="true" className="font-mono text-[18px] font-bold">
              →
            </span>
          </NavigationLink>

          <div className="meli-paper-card mb-6 grid grid-cols-[36px_1fr] gap-3 border-l-4 !border-l-info p-4">
            <div
              className="flex h-9 w-9 items-center justify-center border border-info bg-info/10 text-info"
              aria-hidden="true"
            >
              ✦
            </div>
            <div>
              <p className="font-display text-[14px]">
                {en ? 'You stay in control' : 'El control sigue siendo tuyo'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
                {en
                  ? 'GatoPago does not keep your keys and cannot sign for you. Every movement requires an active key of your account.'
                  : 'GatoPago no guarda tus llaves ni puede firmar por ti. Cada movimiento requiere una llave activa de tu cuenta.'}
              </p>
            </div>
          </div>

          <section aria-labelledby="security-learn-title">
            <p id="security-learn-title" className="meli-kicker mb-3 px-1">
              {en ? 'Understand your security' : 'Entiende tu seguridad'}
            </p>
            <div className="meli-paper-card meli-paper-card--strong divide-y divide-border px-5 py-2">
              <Faq question={en ? 'What is your access key?' : '¿Qué es tu llave de acceso?'}>
                <p>
                  {en
                    ? 'It is like your house key, but digital: your device or passkey manager protects its private part and you unlock it with your fingerprint, face or PIN. There is no GatoPago password to steal or forget.'
                    : 'Es como la llave de tu casa, pero digital: tu dispositivo o gestor de passkeys protege su parte privada y tú la desbloqueas con tu huella, rostro o PIN. No hay una contraseña de GatoPago que robar u olvidar.'}
                </p>
                <p>
                  {en
                    ? 'Each payment is authorized with a signature made by that key. You can have several (phone, computer); adding a backup lowers the risk of losing access.'
                    : 'Cada pago se autoriza con una firma creada por esa llave. Puedes tener varias (teléfono, computadora); agregar una de respaldo reduce el riesgo de perder el acceso.'}
                </p>
              </Faq>
              <Faq question={en ? 'What if I lose my phone?' : '¿Qué pasa si pierdo mi teléfono?'}>
                <p>
                  {en
                    ? 'If you saved the passkey in Google Password Manager, it can appear on Android, Chrome and iOS when Google is enabled as a manager. If you saved it in iCloud, it syncs across your Apple devices.'
                    : 'Si guardaste la passkey en Google Password Manager, puede aparecer en Android, Chrome y también en iOS cuando Google está habilitado como gestor. Si la guardaste en iCloud, se sincroniza entre tus dispositivos Apple.'}
                </p>
                <p>
                  {en
                    ? 'Without any other key, access cannot be recovered: nobody, not even GatoPago, can reset it. That is why a backup key matters.'
                    : 'Sin otra llave, el acceso no se puede recuperar: nadie, ni siquiera GatoPago, puede restablecerlo. Por eso importa tener una llave de respaldo.'}
                </p>
              </Faq>
              <Faq
                question={
                  en
                    ? 'What can GatoPago do with my account?'
                    : '¿Qué puede hacer GatoPago con mi cuenta?'
                }
              >
                <p>
                  {en
                    ? 'GatoPago does not hold your keys and cannot sign movements. It only pays the network fee of your operations; your account and your money stay on the blockchain even if GatoPago is unavailable.'
                    : 'GatoPago no posee tus llaves ni puede firmar movimientos. Solo paga la comisión de red de tus operaciones; tu cuenta y tu dinero siguen en la blockchain aunque GatoPago no esté disponible.'}
                </p>
              </Faq>
            </div>
          </section>
        </div>
      )}

      {dialog === 'stored' ? (
        <Sheet titleId="passkey-storage-title" onClose={() => setDialog(null)}>
          <div className="sheet-handle mb-5" aria-hidden="true" />
          <h2 id="passkey-storage-title" className="font-display text-[22px]">
            {en ? 'Where your passkey lives' : 'Dónde vive tu passkey'}
          </h2>
          <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-text-muted">
            <p>
              {en
                ? 'Your device, browser or password manager chooses where to keep the private part. GatoPago cannot see it, download it or pick a manager behind your back.'
                : 'Tu dispositivo, navegador o gestor de contraseñas elige dónde guardar la parte privada. GatoPago no puede verla, descargarla ni elegir un gestor a escondidas.'}
            </p>
            <p>
              {en
                ? 'When you create it you will see the system secure window. If your device offers Google Password Manager, Apple Passwords or another manager, you can choose there.'
                : 'Al crearla verás la ventana segura del sistema. Si tu dispositivo ofrece Google Password Manager, Apple Passwords u otro gestor, allí podrás elegir entre las opciones disponibles.'}
            </p>
            <p className="border-l-4 border-info bg-info/8 px-3 py-2">
              {en
                ? 'GatoPago keeps only the public key.'
                : 'GatoPago conserva solamente la clave pública.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialog(null)}
            className="btn btn-primary btn-block mt-5"
          >
            {en ? 'Close' : 'Cerrar'}
          </button>
        </Sheet>
      ) : null}

      {dialog === 'options' ? (
        <Sheet titleId="passkey-options-title" onClose={() => setDialog(null)} busy={busy}>
          <div className="sheet-handle mb-5" aria-hidden="true" />
          <h2 id="passkey-options-title" className="font-display text-[22px]">
            {en ? 'Another way to keep a key' : 'Otra forma de guardar una llave'}
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
            {en
              ? 'The main option uses this device or its passkey manager. If you prefer a separate device, you can register a physical key.'
              : 'La opción principal usa este dispositivo o su gestor de passkeys. Si prefieres un dispositivo separado, puedes registrar una llave física.'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => addKey('cross-platform')}
            className="btn btn-primary btn-block mt-5"
          >
            {en ? 'Add a physical key' : 'Agregar llave física'}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
            {en
              ? 'Plug in or tap a compatible USB, NFC or Bluetooth key when the system asks.'
              : 'Conecta o acerca una llave compatible con USB, NFC o Bluetooth cuando el sistema lo solicite.'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog(null)}
            className="btn-text mt-2 w-full"
          >
            {en ? 'Cancel' : 'Cancelar'}
          </button>
        </Sheet>
      ) : null}

      {removing ? (
        <Sheet titleId="remove-key-title" onClose={() => setDialog(null)} busy={busy}>
          <div className="sheet-handle mb-5" aria-hidden="true" />
          <h2 id="remove-key-title" className="font-display text-[22px]">
            {en ? 'Remove this key' : 'Quitar esta llave'}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
            {en
              ? `You are about to remove the key …${removing.slice(-8)} from your account.`
              : `Vas a retirar la llave …${removing.slice(-8)} de tu cuenta.`}
          </p>
          <p className="mt-4 border-l-4 border-danger bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
            {en
              ? 'Once you confirm with an active key, this key can no longer authorize movements.'
              : 'Después de confirmarlo con una llave activa, esta llave ya no podrá autorizar movimientos.'}
          </p>
          {error ? (
            <p className="mt-3 text-[12px] leading-relaxed text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              perform(() =>
                approve(
                  encodeFunctionData({
                    abi: gatopagoAccountAbi,
                    functionName: 'removeOwners',
                    args: [[removing]],
                  }),
                  true,
                ),
              )
            }
            className="btn btn-danger btn-block mt-5"
          >
            {busy
              ? en
                ? 'Removing…'
                : 'Quitando…'
              : en
                ? 'Confirm and remove'
                : 'Confirmar y quitar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDialog(null)}
            className="btn-text mt-1 w-full"
          >
            {en ? 'Cancel' : 'Cancelar'}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group px-0.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-[14px] text-text">
        {question}
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-text-faint transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-2 pb-2.5 text-[12px] leading-relaxed text-text-muted">
        {children}
      </div>
    </details>
  );
}

async function readKeys(settings: ClientSettings, wallet: Wallet): Promise<State> {
  const { approvals } = await api<Approvals>(settings.apiOrigin, `approvals/${wallet.address}`);
  const applied = await Promise.all(
    settings.networks.map((id) => appliedApprovals(settings, wallet.address, id)),
  );
  return {
    owners: ownersAfter(
      wallet.initialOwners,
      approvals.map((approval) => approval.call),
    ),
    total: approvals.length,
    applied: Object.fromEntries(settings.networks.map((id, i) => [id, applied[i]])),
  };
}
