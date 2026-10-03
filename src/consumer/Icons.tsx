import type { ReactNode } from 'react';

/** Original client icon geometry, shared by the Next.js account screens. */
function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function ReceiveIcon() { return <Icon><path d="M12 5v14m7-7-7 7-7-7" /></Icon>; }
export function SendIcon() { return <Icon><path d="M12 20V6m-6 6 6-6 6 6" /></Icon>; }
export function ScanIcon() { return <Icon><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18" /></Icon>; }
export function MoveIcon() { return <Icon><path d="M7 7h11m-3-3 3 3-3 3M17 17H6m3-3-3 3 3 3" /></Icon>; }
export function GrowIcon() { return <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>; }
export function ActivityIcon() { return <Icon><path d="M3 3v18h18m-14-6 4-4 3 3 5-6" /></Icon>; }
export function HomeIcon() { return <Icon><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" /></Icon>; }
export function BackIcon() { return <Icon><path d="M19 12H5m7 7-7-7 7-7" /></Icon>; }
export function ChevronIcon() { return <Icon size={18}><path d="m9 18 6-6-6-6" /></Icon>; }
export function SecurityIcon() { return <Icon><path d="m12 3 8 4v6c0 5-8 8-8 8s-8-3-8-8V7l8-4Z" /><path d="m8 12 3 3 5-6" /></Icon>; }
export function EyeIcon({ hidden }: { hidden: boolean }) {
  return <Icon size={18}>{hidden
    ? <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a16.9 16.9 0 0 1-3.3 4.1M6.6 6.6A16.8 16.8 0 0 0 2 12s3.5 7 10 7a10.3 10.3 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}</Icon>;
}
