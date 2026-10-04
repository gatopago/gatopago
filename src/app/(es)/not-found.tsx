import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="mb-4 font-display text-3xl">Página no encontrada</h1>
      <p className="mb-6">El enlace no corresponde a una página disponible de GatoPago.</p>
      <Link href="/app" className="font-semibold underline">
        Volver a mi cuenta
      </Link>
    </main>
  );
}
