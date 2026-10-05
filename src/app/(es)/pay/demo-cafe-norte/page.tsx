import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'GatoPago — Links de cobro',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main className="web-notice">
      <h1>Links de cobro, muy pronto</h1>
      <p>
        Así se verán tus links de cobro de GatoPago. Mientras tanto, ya puedes cobrar con tu
        @usuario.
      </p>
      <p lang="en">
        This is how your GatoPago payment links will look. Meanwhile, you can already get paid with
        your @username.
      </p>
      <Link href="/login">Crear mi cuenta</Link>
    </main>
  );
}
