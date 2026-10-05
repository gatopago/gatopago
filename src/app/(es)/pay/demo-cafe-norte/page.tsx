import type { Metadata } from 'next';
import { ConsumerFrame } from '../../../../consumer/ConsumerFrame';
import { NavigationLink } from '../../../../consumer/NavigationLink';
import { Panel } from '../../../../consumer/Primitives';

export const metadata: Metadata = {
  title: 'Ejemplo de cobro · GatoPago',
  robots: { index: false, follow: false },
};

/** What a GatoPago payment request looks like, with example data (linked from the landing). */
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const en = (await searchParams).lang === 'en';
  return (
    <ConsumerFrame english={en}>
      <div className="auth-content">
        <Panel className="meli-paper-card--strong text-center">
          <p className="mb-2 text-[13px] text-text-muted">
            {en ? 'Payment to' : 'Pago a'} Café Norte
          </p>
          <p className="type-mono text-[44px] font-bold leading-none">
            18.00 <span className="text-[18px] text-text-muted">USDC</span>
          </p>
          <p className="mt-3 text-[14px]">{en ? 'Breakfast' : 'Desayuno'}</p>
        </Panel>
        <p className="mb-5 text-center text-[13px] text-text-muted">
          {en
            ? 'This is how your customers see your payment requests. Create yours from your account.'
            : 'Así ven tus clientes tus cobros. Crea los tuyos desde tu cuenta.'}
        </p>
        <NavigationLink
          href={en ? '/login?lang=en' : '/login'}
          className="btn btn-primary btn-block"
        >
          {en ? 'Create my account' : 'Crear mi cuenta'}
        </NavigationLink>
      </div>
    </ConsumerFrame>
  );
}
