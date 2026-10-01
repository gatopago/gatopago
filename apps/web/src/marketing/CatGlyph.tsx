export function CatGlyph({ className = '', title = 'GatoPago', decorative = false }: { className?: string; title?: string; decorative?: boolean }) { return (
<svg
  className={`cat-glyph ${className}`}
  viewBox="0 0 64 64"
  xmlns="http://www.w3.org/2000/svg"
  role={decorative ? undefined : 'img'}
  aria-label={decorative ? undefined : title}
  aria-hidden={decorative ? 'true' : undefined}
  shapeRendering="crispEdges"
>
  <path fill="currentColor" d="M8 20V8h12v4h4v4h16v-4h4V8h12v12h4v28h-4v4h-8v4H16v-4H8v-4H4V20h4Z" />
  <path fill="var(--cat-glyph-shadow, #cf3433)" d="M12 12h8v4h4v8h-4v-4h-8V12Zm32 4h4v-4h8v8h-8v4h-4v-8ZM24 16h4v8h-4v-8Zm12 0h4v8h-4v-8ZM16 48h32v4h-4v4H20v-4h-4v-4Z" />
  <path fill="var(--cat-glyph-ink, #0b0b0f)" d="M16 32h8v8h-8v-8Zm24 0h8v8h-8v-8ZM28 40h8v4h-8v-4Zm-4 4h4v4h-8v-4h4Zm12 0h4v4h-8v-4h4ZM4 36h12v4H4v-4Zm0 8h12v4H4v-4Zm44-8h12v4H48v-4Zm0 8h12v4H48v-4Z" />
</svg>
); }
