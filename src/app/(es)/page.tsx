import { Landing } from '../../marketing/Landing';
import { publicMetadata } from '../../lib/metadata';
import '../../marketing/landing.css';

export const metadata = publicMetadata('es');
export default function Page() {
  return <Landing lang="es" />;
}
