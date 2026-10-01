import { environment } from '../lib/brand';
import { pwaManifest } from '../pwa/manifest';

export default function manifest() { return pwaManifest(environment.environment === 'staging'); }
