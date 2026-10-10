'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { networkName } from '../wallet/account';
import { useProfile } from '../wallet/useProfile';
import type { Session } from '../wallet/session';
import { AddressQRCard } from './AddressQRCard';
import { openScanCamera, qrDetector } from './camera';
import { BackHeader, MoneyPanel, NoticeCard, SectionLabel, TransactionActions } from './Primitives';
import { parseConsumerQr, qrReviewPath } from './qr';
import { localizedPath } from './routes';
import { NavigationLink } from './NavigationLink';
import { PixelRail } from './PixelRail';
import { SelectMenu } from './SelectMenu';
import { MeliSprite } from '../marketing/MeliSprite';
import { useTranslations, useLocale } from 'next-intl';

type Scanned = { address: string; chain: string | null };

export default function ScanScreen({
  settings,
  session,
}: {
  settings: ClientSettings;
  session: Session;
}) {
  const locale = useLocale();
  const t = useTranslations('Scan');
  const router = useRouter();
  const [view, setView] = useState<'scan' | 'myqr'>('scan');
  const [scanned, setScanned] = useState<Scanned | null>(null);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(true);
  const [reading, setReading] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scanCanvas = useRef<HTMLCanvasElement | null>(null);
  const generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const parse = useCallback(
    (raw: string) => {
      const found = parseConsumerQr(raw, window.location.origin);
      // A Stellar address only where GatoPago has Stellar on.
      const parsed = found?.kind === 'stellar' && !settings.stellar ? null : found;
      setError(parsed ? '' : found ? t('qrStellarAddressStellar') : t('qrNoAddressGatopago'));
      if (parsed?.kind === 'address') setScanned(parsed);
      else if (parsed) router.push(localizedPath(qrReviewPath(parsed), locale));
      return !!parsed;
    },
    [t, locale, router, settings.stellar],
  );
  /** Reads a QR from an image, or from the centered square the preview shows (`square`). */
  const decode = useCallback(
    async (
      source: CanvasImageSource,
      width: number,
      height: number,
      max: number,
      square = false,
    ) => {
      if (!width || !height || width * height > 40_000_000) throw new Error('Image too large');
      const side = Math.min(width, height);
      const [cropWidth, cropHeight] = square ? [side, side] : [width, height];
      const scale = Math.min(1, max / Math.max(cropWidth, cropHeight));
      const canvas = (scanCanvas.current ??= document.createElement('canvas'));
      const scaledWidth = Math.max(1, Math.round(cropWidth * scale));
      const scaledHeight = Math.max(1, Math.round(cropHeight * scale));
      if (canvas.width !== scaledWidth) canvas.width = scaledWidth;
      if (canvas.height !== scaledHeight) canvas.height = scaledHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(
        source,
        (width - cropWidth) / 2,
        (height - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const detector = await qrDetector();
      if (detector) {
        try {
          return (await detector.detect(canvas))[0]?.rawValue ?? null;
        } catch {
          /* jsQR below. */
        }
      }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const { default: jsQR } = await import('jsqr');
      return jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
    },
    [],
  );
  const start = useCallback(async () => {
    stop();
    const current = generation.current;
    timer.current = setTimeout(() => {
      if (current === generation.current) {
        stop();
        setBusy(false);
        setCamera(false);
        setError(t('cameraPermissionTookToo'));
      }
    }, 15000);
    try {
      const media = await openScanCamera();
      if (generation.current !== current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      stream.current = media;
      if (!video.current) throw new Error('Video unavailable');
      video.current.srcObject = media;
      await video.current.play();
      if (generation.current !== current) return;
      setCamera(true);
      setBusy(false);
      const scan = async () => {
        if (generation.current !== current || !video.current) return;
        try {
          if (video.current.readyState >= 2) {
            const raw = await decode(
              video.current,
              video.current.videoWidth,
              video.current.videoHeight,
              // The native reader takes the full 1080p; jsQR stays fast on a smaller frame.
              (await qrDetector()) ? 1080 : 720,
              true,
            );
            if (generation.current !== current) return;
            if (raw && parse(raw)) {
              stop();
              setCamera(false);
              return;
            }
          }
        } catch {
          /* empty */
        }
        if (generation.current === current) timer.current = setTimeout(() => void scan(), 180);
      };
      void scan();
    } catch {
      if (generation.current === current) {
        stop();
        setBusy(false);
        setCamera(false);
        setError(t('couldNotUseCamera'));
      }
    }
  }, [t, stop, parse, decode]);
  const scanning = view === 'scan' && !scanned;
  useEffect(() => {
    if (!scanning) return;
    // Paint the preview before the browser opens its camera permission prompt.
    const frame = requestAnimationFrame(() => {
      void start();
    });
    // Leaving the app frees the camera (the system ends it anyway); coming back opens it again.
    const visibility = () => {
      if (document.hidden) {
        stop();
        setCamera(false);
        setBusy(false);
      } else {
        setBusy(true);
        setError('');
        void start();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      stop();
    };
  }, [start, stop, scanning]);
  async function image(file?: File) {
    if (!file) return;
    stop();
    const current = generation.current;
    setCamera(false);
    setBusy(true);
    setReading(true);
    setError('');
    let bitmap: ImageBitmap | undefined;
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error('Unsupported image');
      bitmap = await createImageBitmap(file);
      if (generation.current !== current) return;
      const raw = await decode(bitmap, bitmap.width, bitmap.height, 1600);
      if (generation.current !== current) return;
      if (!raw) throw new Error('No QR');
      parse(raw);
    } catch {
      if (generation.current === current) setError(t('couldNotReadQr'));
    } finally {
      bitmap?.close();
      setReading(false);
      if (generation.current === current) setBusy(false);
    }
  }
  if (scanned)
    return <Review scanned={scanned} settings={settings} onRestart={() => setScanned(null)} />;
  return (
    <>
      <BackHeader title={t('scanQr')} />
      <div className="seg-track seg-track-block mb-5">
        {(['scan', 'myqr'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className="seg-item"
            aria-pressed={view === tab}
            data-active={view === tab}
            onClick={() => {
              if (tab === 'scan' && view !== 'scan') setError('');
              setView(tab);
            }}
          >
            {tab === 'scan' ? t('scan') : t('myQr')}
          </button>
        ))}
      </div>
      {view === 'myqr' ? (
        <MyQr settings={settings} session={session} />
      ) : (
        <div className="mx-auto flex w-full max-w-[340px] flex-1 flex-col items-center">
          <div
            className={`relative mb-6 aspect-square w-full overflow-hidden border-2 ${error && !camera ? 'border-danger bg-surface shadow-[6px_6px_0_var(--color-danger)]' : 'border-text bg-black shadow-[7px_7px_0_var(--color-cat-700)]'}`}
          >
            <video
              ref={video}
              muted
              playsInline
              aria-label={t('cameraPreview')}
              className={`${camera ? 'block' : 'hidden'} h-full w-full object-cover`}
            />
            {camera ? (
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <span className="absolute top-4 left-4 h-7 w-7 border-t-2 border-l-2 border-cat-500" />
                <span className="absolute top-4 right-4 h-7 w-7 border-t-2 border-r-2 border-cat-500" />
                <span className="absolute bottom-4 left-4 h-7 w-7 border-b-2 border-l-2 border-cat-500" />
                <span className="absolute right-4 bottom-4 h-7 w-7 border-r-2 border-b-2 border-cat-500" />
                {!busy ? (
                  <div className="absolute inset-x-5 top-4 bottom-4 overflow-hidden">
                    {/* Moves on the compositor, so it stays smooth while jsQR decodes. */}
                    <div
                      className="scan-line animate-qr-scan h-full w-full"
                      style={{ willChange: 'transform' }}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
                {error ? (
                  <p role="alert" className="text-[15px] text-danger">
                    {error}
                  </p>
                ) : (
                  <>
                    <MeliSprite variant="body-qr" className="w-20" loading="eager" />
                    <PixelRail state={busy ? 'active' : 'idle'} className="max-w-[180px]" />
                  </>
                )}
              </div>
            )}
          </div>
          <p
            className={`min-h-10 text-center text-[14px] ${error && camera ? 'text-danger' : 'text-text-muted'}`}
          >
            {error && camera ? error : t('pointGatopagoQrAny')}
          </p>
          <div className="mt-4 flex w-full flex-col gap-3">
            {!busy && !camera ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  setBusy(true);
                  setError('');
                  void start();
                }}
              >
                {t('tryCameraAgain')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={reading}
              onClick={() => fileInput.current?.click()}
            >
              {reading ? t('readingPhoto') : t('choosePhotoQr')}
            </button>
            <NavigationLink href={localizedPath('/send', locale)} className="btn-text w-full">
              {t('sendWithoutQr')}
            </NavigationLink>
          </div>
          <input
            ref={fileInput}
            type="file"
            aria-label={t('readPhoto')}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              void image(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      )}
    </>
  );
}

/** Your QR to get paid: your @username page, or your address before you choose one. */
function MyQr({ settings, session }: { settings: ClientSettings; session: Session }) {
  const t = useTranslations('Scan');
  const { profile } = useProfile();
  return (
    <div className="flex flex-1 flex-col items-center">
      <MoneyPanel className="w-full max-w-[340px] p-6">
        {profile?.username ? (
          <>
            <div className="mb-4 flex justify-center">
              <div className="border-2 border-text bg-white p-3 shadow-[6px_6px_0_var(--color-cat-700)]">
                <QRCodeSVG
                  value={`${settings.webOrigin}/@${profile.username}`}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0A0A0B"
                  level="M"
                />
              </div>
            </div>
            <p className="mb-1 text-center font-display text-[18px]">@{profile.username}</p>
            <p className="text-center text-[12px] leading-relaxed text-text-muted">
              {t('anyonePayScanningCode')}
            </p>
          </>
        ) : (
          <>
            <p className="mb-4 text-center text-[13px] text-text-muted">
              {t('addressReceiveUsdc')}
            </p>
            <AddressQRCard
              address={session.wallet.address}
              chainId={walletNetwork(settings.homeNetwork).chain.id}
              qrSize={200}
            />
          </>
        )}
      </MoneyPanel>
    </div>
  );
}

/** V2's review of a scanned address: the network to send on, then the transfer. */
function Review({
  scanned,
  settings,
  onRestart,
}: {
  scanned: Scanned;
  settings: ClientSettings;
  onRestart: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('Scan');
  const requested = scanned.chain ? `eip155:${scanned.chain}` : null;
  const supported = !requested || settings.networks.includes(requested);
  const [networkId, setNetworkId] = useState(
    requested && supported ? requested : settings.homeNetwork,
  );
  const transfer = new URLSearchParams({
    recipient: scanned.address,
    chain: String(walletNetwork(networkId).chain.id),
  });
  return (
    <>
      <BackHeader title={t('reviewRecipient')} onBack={onRestart} />
      <MoneyPanel className="mb-5">
        <p className="mb-2 text-[13px] text-text-muted">{t('send')}</p>
        <p className="break-all font-mono text-[13px] leading-relaxed text-text">
          {scanned.address}
        </p>
      </MoneyPanel>
      <SectionLabel>{t('whichNetwork')}</SectionLabel>
      <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
        {t('sameAddressExistSeveral')}
      </p>
      <SelectMenu
        label={t('chooseNetwork')}
        showLabel={false}
        value={networkId}
        options={settings.networks.map((id) => ({
          value: id,
          label: networkName(id),
          network: id,
        }))}
        onChange={setNetworkId}
        className="mb-5"
      />
      {!supported ? (
        <NoticeCard tone="warning" className="mb-4" title={t('unsupportedNetwork')}>
          {t('qrAsksNetworkGatopago', { chain: scanned.chain ?? '' })}
        </NoticeCard>
      ) : null}
      <TransactionActions>
        <NavigationLink
          href={localizedPath(`/send?${transfer}`, locale)}
          className="btn btn-primary btn-block"
        >
          {t('continueTransfer')}
        </NavigationLink>
        <button type="button" onClick={onRestart} className="btn btn-ghost btn-block mt-3">
          {t('scanAnotherQr')}
        </button>
      </TransactionActions>
    </>
  );
}
