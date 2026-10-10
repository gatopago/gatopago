'use client';

import { AddressQRCard } from './AddressQRCard';
import { NavigationLink } from './NavigationLink';
import { Sheet } from './Sheet';
import { localizedPath } from './routes';
import { useTranslations, useLocale } from 'next-intl';

/** The account at a glance, from the header: its QR and address. The profile is in the menu. */
export function AccountDetailsSheet({
  address,
  onClose,
}: {
  address: string;
  onClose: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('AccountDetailsSheet');
  return (
    <Sheet titleId="account-details-title" onClose={onClose}>
      <h2 id="account-details-title" className="meli-kicker mb-3">
        {t('account')}
      </h2>
      <AddressQRCard address={address} qrSize={172} />
      <p className="mt-4 text-center text-[12px] leading-relaxed text-text-muted">
        {t.rich('exchangeHint', {
          link: (chunks) => (
            <NavigationLink
              href={localizedPath('/receive', locale)}
              onClick={onClose}
              className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
            >
              {chunks}
            </NavigationLink>
          ),
        })}
      </p>
      <button type="button" data-sheet-close className="btn btn-ghost btn-block mt-5">
        {t('close')}
      </button>
    </Sheet>
  );
}
