import { getMessages, setRequestLocale } from 'next-intl/server';
import { Landing } from '../../../marketing/Landing';
import { publicMetadata } from '../../../lib/metadata';
import '../../../marketing/landing.css';

export const generateMetadata = () => publicMetadata('en');

export default async function Page() {
  setRequestLocale('en');
  const { Landing: copy } = await getMessages();
  return <Landing lang="en" copy={copy} />;
}
