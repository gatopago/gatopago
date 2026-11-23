import type { ReactNode } from 'react';

function Icon({
  children,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  children: ReactNode;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function SendIcon() {
  return (
    <Icon>
      <path d="M12 20V6m-6 6 6-6 6 6" />
    </Icon>
  );
}
export function ReceiveIcon() {
  return (
    <Icon>
      <path d="M12 4v14m-6-6 6 6 6-6" />
    </Icon>
  );
}
export function GroupIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5" />
      <path d="M16 11a3 3 0 1 0 0-6" />
      <path d="M21 19c0-2-1.5-3.6-4-4.4" />
    </Icon>
  );
}
export function CardIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <path d="M3 10h18M7 15h4" />
    </Icon>
  );
}
export function ScanIcon() {
  return (
    <Icon>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18" />
    </Icon>
  );
}
export function RequestIcon() {
  return (
    <Icon size={18}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  );
}
/** A choice that is selected, or a step that is done. */
export function CheckIcon({
  size = 18,
  strokeWidth = 2.5,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <Icon size={size} strokeWidth={strokeWidth} className={className}>
      <path d="m5 12 4 4L19 6" />
    </Icon>
  );
}
export function SwapIcon() {
  return (
    <Icon size={18}>
      <path d="M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4" />
    </Icon>
  );
}
export function HomeIcon() {
  return (
    <Icon>
      <path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" />
    </Icon>
  );
}
export function BackIcon() {
  return (
    <Icon>
      <path d="M19 12H5m7 7-7-7 7-7" />
    </Icon>
  );
}
export function ChevronIcon() {
  return (
    <Icon size={18}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}
/** Opens a list or a section; `className` turns it while open. */
export function ChevronDownIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <Icon size={size} className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}
export function SecurityIcon() {
  return (
    <Icon>
      <path d="m12 3 8 4v6c0 5-8 8-8 8s-8-3-8-8V7l8-4Z" />
      <path d="m8 12 3 3 5-6" />
    </Icon>
  );
}
/** Both drawings stay on the page and cross-fade (`.icon-swap` in consumer.css). */
export function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <span className="icon-swap" data-on={hidden}>
      <Icon size={18}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </Icon>
      <Icon size={18}>
        <path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a16.9 16.9 0 0 1-3.3 4.1M6.6 6.6A16.8 16.8 0 0 0 2 12s3.5 7 10 7a10.3 10.3 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
      </Icon>
    </span>
  );
}

export function GrowIcon() {
  return (
    <Icon>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Icon>
  );
}

export function ActivityIcon() {
  return (
    <Icon>
      <path d="M3 3v18h18m-14-6 4-4 3 3 5-6" />
    </Icon>
  );
}

export function ProfileIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </Icon>
  );
}

export function ContactsIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 13.6a6.5 6.5 0 0 1 3 5.4v1" />
    </Icon>
  );
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="15" cy="17" r="3" />
    </Icon>
  );
}

export function BellIcon() {
  return (
    <Icon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </Icon>
  );
}

export function BusinessIcon() {
  return (
    <Icon>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </Icon>
  );
}

export function SupportIcon() {
  return (
    <Icon>
      <path d="M21 11.5a8 8 0 0 1-8 8H5l-4 3V11.5a8 8 0 0 1 8-8h4a8 8 0 0 1 8 8Z" />
      <path d="M7 11h10" />
    </Icon>
  );
}
export function RefreshIcon() {
  return (
    <Icon size={14}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
    </Icon>
  );
}
