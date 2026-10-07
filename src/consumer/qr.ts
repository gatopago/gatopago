const addressPattern = /^0x[a-fA-F0-9]{40}$/;
export type QrDestination =
  { kind: 'address'; address: string; chain: string | null } | { kind: 'link'; path: string };

export function parseConsumerQr(raw: string, origin: string): QrDestination | null {
  const text = raw.trim();
  if (
    !text ||
    text.length > 2048 ||
    text.includes('\\') ||
    [...text].some((char) => char.charCodeAt(0) < 32)
  )
    return null;
  if (addressPattern.test(text)) return { kind: 'address', address: text, chain: null };
  const caip = /^eip155:([1-9][0-9]*):(0x[a-fA-F0-9]{40})$/.exec(text);
  if (caip && Number.isSafeInteger(Number(caip[1])))
    return { kind: 'address', address: caip[2], chain: caip[1] };
  const eip =
    /^ethereum:(?:pay-)?(0x[a-fA-F0-9]{40})(?:@([1-9][0-9]*))?(?:\/(transfer))?(?:\?(.*))?$/.exec(
      text,
    );
  if (eip) {
    if (eip[2] && !Number.isSafeInteger(Number(eip[2]))) return null;
    const recipient = eip[3] ? new URLSearchParams(eip[4]).getAll('address') : [eip[1]];
    if (recipient.length !== 1 || !addressPattern.test(recipient[0])) return null;
    return { kind: 'address', address: recipient[0], chain: eip[2] ?? null };
  }
  try {
    const url = new URL(text, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (/^\/(@[a-zA-Z][a-zA-Z0-9_]{2,29}|pay\/pi_[0-9a-f]{32})$/.test(url.pathname)) {
      return { kind: 'link', path: url.pathname };
    }
    // GatoPago Business's sign-in QR: only its request id is kept.
    const request = url.searchParams.get('request');
    if (url.pathname === '/approve' && request && /^[0-9a-f]{32}$/.test(request))
      return { kind: 'link', path: `/approve?request=${request}` };
  } catch {
    /* empty */
  }
  return null;
}

export function qrReviewPath(destination: QrDestination): string {
  if (destination.kind === 'link')
    return destination.path.startsWith('/pay/') || destination.path.startsWith('/approve?')
      ? destination.path
      : `/send?username=${encodeURIComponent(destination.path.slice(2))}`;
  const query = new URLSearchParams({ recipient: destination.address });
  if (destination.chain) query.set('chain', destination.chain);
  return `/send?${query}`;
}

export function reviewedRecipient(
  params: Pick<URLSearchParams, 'get'> | null,
  networkId: string,
): string {
  if (!params) return '';
  const address = params.get('recipient'),
    chain = params.get('chain');
  if (!address || !addressPattern.test(address)) return '';
  if (chain && `eip155:${chain}` !== networkId) return '';
  return address;
}
