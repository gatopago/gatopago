'use client';

import { useEffect, useRef, useState } from 'react';
import { crosschainStatus, type CrosschainStage } from '@gatopago/shared/crosschain';
import { cctpNetwork, networkName } from '../wallet/account';
import type { StellarDelivery } from '../wallet/stellar';

type StepState = 'waiting' | 'active' | 'done' | 'error';

const POLL_MS = 5_000;
/** After this long the crossing is "taking longer", never lost: Circle keeps processing it. */
const DELAYED_MS = 10 * 60_000;

function Step({
  state,
  title,
  detail,
  last = false,
}: {
  state: StepState;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex min-h-16 gap-3.5">
      {!last ? (
        <span
          aria-hidden="true"
          className={`absolute top-6 bottom-0 left-[11px] w-1 ${state === 'done' ? 'bg-growth/55' : 'bg-border'}`}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={`relative z-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border ${
          state === 'done'
            ? 'border-growth bg-growth/20 text-growth'
            : state === 'active'
              ? 'border-cat-500/50 bg-cat-500/15 text-cat-300'
              : state === 'error'
                ? 'border-danger bg-danger/15 text-danger'
                : 'border-border bg-surface-2 text-text-faint'
        }`}
      >
        {state === 'done' ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : state === 'error' ? (
          <span className="text-[13px] leading-none">!</span>
        ) : (
          <span
            className={`h-1.5 w-1.5 rounded-[2px] ${state === 'active' ? 'bg-cat-500' : 'bg-text-faint'}`}
          />
        )}
      </span>
      <div className="min-w-0 pb-5">
        <p className={`text-[14px] ${state === 'waiting' ? 'text-text-faint' : 'text-text'}`}>
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-text-muted">{detail}</p>
      </div>
    </li>
  );
}

/** Follows a confirmed burn until Circle mints on the destination: V2's crossing timeline. */
export function CrosschainTimeline({
  from,
  to,
  hash,
  english: en,
  onDelivered,
  delivery,
}: {
  from: string;
  to: string;
  /** The confirmed burn on `from`. */
  hash: string;
  english: boolean;
  onDelivered?: () => void;
  /** Where Circle does not deliver (toward Stellar): where the attested burn stands. */
  delivery?: () => Promise<StellarDelivery>;
}) {
  const [stage, setStage] = useState<CrosschainStage>('burned');
  const [delayed, setDelayed] = useState(false);
  const delivered = useRef(onDelivered);
  const arrival = useRef(delivery);
  useEffect(() => {
    delivered.current = onDelivered;
    arrival.current = delivery;
  });
  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const status = await crosschainStatus(cctpNetwork(from), hash, controller.signal).catch(
        () => null,
      );
      // A failed check is asked again; a rejection is final.
      const delivery =
        status?.attested && arrival.current ? await arrival.current().catch(() => null) : null;
      if (controller.signal.aborted) return;
      const next =
        delivery === 'delivered' ? 'delivered' : delivery === 'rejected' ? 'failed' : status?.stage;
      if (next) setStage(next);
      if (next === 'delivered') return delivered.current?.();
      if (next === 'failed') return;
      setDelayed(Date.now() - started > DELAYED_MS);
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [from, hash]);

  const failed = stage === 'failed';
  const attested = stage === 'attested' || stage === 'delivered';
  const arrived = stage === 'delivered';
  const destination = networkName(to);
  return (
    <ol
      className="meli-paper-card meli-paper-card--strong w-full px-5 pt-5 pb-1 text-left"
      aria-live="polite"
    >
      <Step
        state="done"
        title={en ? 'Source-network confirmation' : 'Confirmación en la red de origen'}
        detail={
          en
            ? 'The source transaction is confirmed onchain.'
            : 'La salida quedó confirmada onchain.'
        }
      />
      <Step
        state={failed ? 'error' : attested ? 'done' : 'active'}
        title={en ? 'Circle attestation' : 'Atestación de Circle'}
        detail={
          attested
            ? en
              ? 'The attestation is available.'
              : 'La atestación ya está disponible.'
            : en
              ? 'Circle is verifying the CCTP message.'
              : 'Circle está verificando el mensaje de CCTP.'
        }
      />
      <Step
        last
        state={failed ? 'error' : arrived ? 'done' : attested ? 'active' : 'waiting'}
        title={en ? `Delivery on ${destination}` : `Entrega en ${destination}`}
        detail={
          failed
            ? en
              ? 'The operation needs review; do not submit it again.'
              : 'La operación necesita revisión; no la envíes otra vez.'
            : arrived
              ? en
                ? 'USDC arrived at the destination address.'
                : 'USDC llegó a la dirección de destino.'
              : delayed
                ? en
                  ? 'You can leave this screen. Processing will continue.'
                  : 'Puedes salir de esta pantalla. La operación seguirá procesándose.'
                : en
                  ? 'USDC minting starts after the attestation.'
                  : 'La acuñación de USDC comenzará después de la atestación.'
        }
      />
    </ol>
  );
}
