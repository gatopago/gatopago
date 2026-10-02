'use client';

import type { BrowserAuth } from '../auth/browser';
import { ReceiveProfile } from './PublicUsername';
import { BackHeader, IntegrationNotice, Panel } from './Primitives';
import { MeliSprite } from '../marketing/MeliSprite';

export function ReceiveScreen({ english: en, runtime, uid }: { english: boolean; runtime?: BrowserAuth; uid?: string }) {
  if (runtime && uid) return <><BackHeader title={en ? 'Receive in my account' : 'Recibir en mi cuenta'} english={en} to="/move" /><ReceiveProfile key={uid} runtime={runtime} uid={uid} english={en} /></>;
  return <><BackHeader title={en ? 'Receive in my account' : 'Recibir en mi cuenta'} english={en} to="/move" />
    <p className="mb-6 text-text-muted">{en ? 'Share your verified account address or QR to receive from a wallet or exchange.' : 'Comparte el QR o dirección verificada de tu cuenta para recibir desde una wallet o exchange.'}</p>
    <Panel>
      <MeliSprite variant="body-courier" className="mx-auto mb-5 w-28" />
      <IntegrationNotice english={en} identityOnly />
      <p className="text-sm">{en ? 'Sign in so we can verify your account before showing a receiving address.' : 'Inicia sesión para que podamos verificar tu cuenta antes de mostrar una dirección de recepción.'}</p>
    </Panel></>;
}
