import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { NavigationLink } from '../consumer/NavigationLink';
import { Panel } from '../consumer/Primitives';

/** What a GatoPago payment request looks like, with example data (linked from the landing). */
export function DemoPayment({ english: en }: { english: boolean }) {
  return (
    <ConsumerFrame english={en} presentation="public">
      <div className="auth-content">
        <p className="meli-chip mx-auto mb-4 w-fit border-pending bg-pending/10 text-pending">
          {en ? 'Example' : 'Ejemplo'}
        </p>
        <Panel className="meli-paper-card--strong text-center">
          <p className="mb-2 text-[13px] text-text-muted">
            {en ? 'Café Norte requests' : 'Café Norte te cobra'}
          </p>
          <p className="type-mono text-[44px] font-bold leading-none">
            {en ? '18.00' : '18,00'} <span className="text-[18px] text-text-muted">USDC</span>
          </p>
          <p className="mt-3 text-[14px]">
            {en ? '2 coffees + cheese bread' : '2 cafés + pan de queso'}
          </p>
        </Panel>
        <p className="mb-5 text-center text-[13px] leading-relaxed text-text-muted">
          {en
            ? 'This is how your customers see your payment links. They pay from GatoPago or from any wallet. Create yours from your account.'
            : 'Así ven tus clientes tus links de cobro: pagan desde GatoPago o desde cualquier wallet. Crea los tuyos desde tu cuenta.'}
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
