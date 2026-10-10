'use client';

import type { ReactNode } from 'react';
import { ChevronDownIcon } from './Icons';
import { BackHeader, Panel } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { MeliSprite } from '../marketing/MeliSprite';
import { useTranslations, useLocale } from 'next-intl';

/** `/settings/security/recovery`: how keys work, what to do if one is lost, and the questions. */
export function RecoveryScreen() {
  const locale = useLocale();
  const t = useTranslations('AccountScreens');
  return (
    <>
      <BackHeader title={t('howKeysWork')} to="/settings/security" />
      <MeliSprite variant="head-cautious" className="mx-auto mb-6 w-20" />
      <Panel>
        <ol className="space-y-5">
          {[t('stepDevices'), t('stepOneKey'), t('stepAllLost')].map((text, index) => (
            <li key={text} className="flex gap-4">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-text bg-cat-500 font-display"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <h2 className="meli-kicker mb-3 px-1">{t('frequentlyAskedQuestions')}</h2>
      <div className="meli-paper-card meli-paper-card--strong divide-y divide-border px-5 py-2">
        <Faq question={t('whatAccessKey')}>
          <p>{t('likeHouseKeyBut')}</p>
          <p>{t('eachPaymentAuthorizedSignature')}</p>
        </Faq>
        <Faq question={t('whatIfILose')}>
          <p>{t('ifSavedPasskeyGoogle')}</p>
          <p>
            {t.rich('withoutAnyOtherKey', {
              link: (chunks) => (
                <NavigationLink
                  href={localizedPath('/settings/security', locale)}
                  className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
                >
                  {chunks}
                </NavigationLink>
              ),
            })}
          </p>
        </Faq>
        <Faq question={t('whatGatopagoDoMy')}>
          <p>{t('gatopagoDoesNotHold')}</p>
        </Faq>
        <Faq question={t('whatIfGatopagoUnavailable')}>
          <p>{t('accountFundsBlockchainNot')}</p>
        </Faq>
      </div>
    </>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group px-0.5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-[14px] text-text">
        {question}
        <ChevronDownIcon className="shrink-0 text-text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 pb-2.5 text-[13px] leading-relaxed text-text-muted">
        {children}
      </div>
    </details>
  );
}
