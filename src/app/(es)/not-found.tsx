import Link from 'next/link';
import { ConsumerFrame } from '../../consumer/ConsumerFrame';
import { MeliSprite } from '../../marketing/MeliSprite';

export default function NotFound() {
  return (
    <ConsumerFrame english={false} presentation="public">
      <div className="auth-content flex flex-1 flex-col items-center justify-center pb-16 text-center">
        <MeliSprite variant="head-cautious" className="mb-5 w-24" loading="eager" />
        <h1 className="mb-2 font-display text-[26px] leading-tight">No encontramos esta página</h1>
        <p className="mb-7 max-w-[300px] text-[14px] leading-relaxed text-text-muted">
          Revisa el link: puede estar incompleto o haber vencido. No se hizo ninguna operación.
        </p>
        <Link href="/" className="btn btn-primary btn-block max-w-[320px]">
          Ir a GatoPago
        </Link>
        <Link href="/app" className="btn-text mt-1">
          Abrir mi cuenta
        </Link>
      </div>
    </ConsumerFrame>
  );
}
