import Image from 'next/image';

export function CatGlyph({
  className = '',
  title = 'GatoPago',
  decorative = false,
}: {
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/Logo_gatopago.svg"
      className={`cat-glyph ${className}`}
      alt={decorative ? '' : title}
      aria-hidden={decorative ? true : undefined}
      width={60}
      height={46}
      unoptimized
    />
  );
}
