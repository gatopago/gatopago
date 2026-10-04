'use client';

import type { BrowserAuth } from '../auth/browser';
import { ReceiveProfile } from './PublicUsername';
import { BackHeader } from './Primitives';

export function ReceiveScreen({
  english: en,
  runtime,
  uid,
}: {
  english: boolean;
  runtime: BrowserAuth;
  uid: string;
}) {
  return (
    <>
      <BackHeader
        title={en ? 'Receive in my account' : 'Recibir en mi cuenta'}
        english={en}
        to="/move"
      />
      <ReceiveProfile key={uid} runtime={runtime} uid={uid} english={en} />
    </>
  );
}
