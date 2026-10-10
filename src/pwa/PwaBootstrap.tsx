'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onOpenRequest, startPwa } from './browser';

export function PwaBootstrap({
  canonicalOrigin,
  release,
}: {
  canonicalOrigin: string;
  release: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    startPwa(canonicalOrigin, release);
  }, [canonicalOrigin, release]);
  useEffect(() => onOpenRequest((path) => router.push(path)), [router]);
  return null;
}
