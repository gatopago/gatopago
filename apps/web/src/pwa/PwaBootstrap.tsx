'use client';

import { useEffect } from 'react';
import { startPwa } from './browser';

export function PwaBootstrap({ canonicalOrigin, release }: { canonicalOrigin: string; release: boolean }) {
  useEffect(() => { startPwa(canonicalOrigin, release); }, [canonicalOrigin, release]);
  return null;
}
