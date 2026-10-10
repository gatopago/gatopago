'use client';

import { AddressQRCard } from './AddressQRCard';
import { NavigationLink } from './NavigationLink';
import { Sheet } from './Sheet';
import { localizedPath } from './routes';

/** The account at a glance, from the header: its QR and address, and the way to the profile. */
export function AccountDetailsSheet({
  address,
  english: en,
  onClose,
}: {
  address: string;
  english: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet titleId="account-details-title" onClose={onClose}>
      <h2 id="account-details-title" className="meli-kicker mb-3">
        {en ? 'Your account' : 'Tu cuenta'}
      </h2>
      <AddressQRCard address={address} english={en} qrSize={172} />
      <p className="mt-4 text-center text-[12px] leading-relaxed text-text-muted">
        {en ? 'To receive from an exchange, use ' : 'Para recibir desde un exchange, usa '}
        <NavigationLink
          href={localizedPath('/receive', en)}
          onClick={onClose}
          className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
        >
          {en ? 'Receive' : 'Recibir'}
        </NavigationLink>
        {en ? ': it tells you which network to choose.' : ': te dice qué red elegir.'}
      </p>
      <NavigationLink
        href={localizedPath('/profile', en)}
        onClick={onClose}
        className="btn btn-ghost btn-block mt-5"
      >
        {en ? 'My profile' : 'Mi perfil'}
      </NavigationLink>
      <button type="button" data-sheet-close className="mt-3 min-h-11 w-full text-[13px]">
        {en ? 'Close' : 'Cerrar'}
      </button>
    </Sheet>
  );
}
