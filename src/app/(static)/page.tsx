import { getMessages, setRequestLocale } from 'next-intl/server';
import { Landing } from '../../marketing/Landing';
import { publicMetadata } from '../../lib/metadata';
import '../../marketing/landing.css';

export const generateMetadata = () => publicMetadata('es');

export default async function Page() {
  setRequestLocale('es');
  const { Landing: copy } = await getMessages();
  return <Landing lang="es" copy={copy} />;
}
