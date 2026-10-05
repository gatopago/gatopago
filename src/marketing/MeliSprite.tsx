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
  'body-conveyor': bodyConveyor,
  'body-courier': bodyCourier,
  'body-peek-card': bodyPeekCard,
  'body-qr': bodyQr,
  'body-sitting': bodySitting,
  'body-sleeping': bodySleeping,
  'head-cautious': headCautious,
  'head-curious': headCurious,
  'head-excited': headExcited,
  'head-focused': headFocused,
  'head-happy': headHappy,
  'head-neutral': headNeutral,
  'head-peek': headPeek,
  'head-sleepy': headSleepy,
} satisfies Record<string, StaticImageData>;

const dimensions = {
  'body-conveyor': [477, 420],
  'body-courier': [430, 428],
  'body-peek-card': [435, 443],
  'body-qr': [348, 466],
  'body-sitting': [304, 429],
  'body-sleeping': [427, 343],
  'head-cautious': [376, 280],
  'head-curious': [366, 349],
  'head-excited': [332, 332],
  'head-focused': [330, 314],
  'head-happy': [329, 314],
  'head-neutral': [330, 314],
  'head-peek': [204, 343],
  'head-sleepy': [343, 314],
} as const satisfies Record<keyof typeof sprites, readonly [number, number]>;

export function MeliSprite({
  variant,
  className = '',
  loading = 'lazy',
  motion,
}: {
  variant: keyof typeof sprites;
  className?: string;
  loading?: 'eager' | 'lazy';
  /** The app's V2 motions (styled in consumer.css). */
  motion?: 'idle' | 'deliver' | 'purr' | 'peek';
}) {
  const [width, height] = dimensions[variant];
  return (
    <span
      className={`meli-sprite meli-sprite--${variant}${motion ? ` meli-motion-${motion}` : ''} ${className}`}
      data-meli-variant={variant}
      aria-hidden="true"
    >
      <Image
        className="meli-sprite__image"
        src={sprites[variant]}
        alt=""
        loading={loading}
        width={width}
        height={height}
        fetchPriority={loading === 'eager' ? 'high' : 'auto'}
        unoptimized
      />
    </span>
  );
}
