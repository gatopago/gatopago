import { OFFLINE_HTML, OFFLINE_HEADERS } from '../../pwa/offline';

export const dynamic = 'force-static';
export function GET() {
  return new Response(OFFLINE_HTML, { headers: OFFLINE_HEADERS });
}
