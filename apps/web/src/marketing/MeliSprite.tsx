import Image, { type StaticImageData } from 'next/image';
import bodyConveyor from '@gatopago/brand/meli/body-conveyor.webp';
import bodyCourier from '@gatopago/brand/meli/body-courier.webp';
import bodyPeekCard from '@gatopago/brand/meli/body-peek-card.webp';
import bodyQr from '@gatopago/brand/meli/body-qr.webp';
import bodySitting from '@gatopago/brand/meli/body-sitting.webp';
import bodySleeping from '@gatopago/brand/meli/body-sleeping.webp';
import headCautious from '@gatopago/brand/meli/head-cautious.webp';
import headCurious from '@gatopago/brand/meli/head-curious.webp';
import headExcited from '@gatopago/brand/meli/head-excited.webp';
import headFocused from '@gatopago/brand/meli/head-focused.webp';
import headHappy from '@gatopago/brand/meli/head-happy.webp';
import headNeutral from '@gatopago/brand/meli/head-neutral.webp';
import headPeek from '@gatopago/brand/meli/head-peek.webp';
import headSleepy from '@gatopago/brand/meli/head-sleepy.webp';

const sprites = {
  'body-conveyor': bodyConveyor, 'body-courier': bodyCourier, 'body-peek-card': bodyPeekCard,
  'body-qr': bodyQr, 'body-sitting': bodySitting, 'body-sleeping': bodySleeping,
  'head-cautious': headCautious, 'head-curious': headCurious, 'head-excited': headExcited,
  'head-focused': headFocused, 'head-happy': headHappy, 'head-neutral': headNeutral,
  'head-peek': headPeek, 'head-sleepy': headSleepy,
} satisfies Record<string, StaticImageData>;

export function MeliSprite({ variant, className = '', loading = 'lazy' }: {
  variant: keyof typeof sprites; className?: string; loading?: 'eager' | 'lazy';
}) {
  return <span className={`meli-sprite meli-sprite--${variant} ${className}`} data-meli-variant={variant} aria-hidden="true">
    <Image className="meli-sprite__image" src={sprites[variant]} alt="" loading={loading}
      fetchPriority={loading === 'eager' ? 'high' : 'auto'} unoptimized />
  </span>;
}
