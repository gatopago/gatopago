/** Pixel progress rail from V2. It signals activity, never a fabricated percentage. */
export function PixelRail({
  className = '',
  state = 'idle',
}: {
  className?: string;
  state?: 'idle' | 'active' | 'done' | 'future';
}) {
  return (
    <span className={`pixel-rail pixel-rail-${state} ${className}`} aria-hidden="true">
      <span />
    </span>
  );
}
