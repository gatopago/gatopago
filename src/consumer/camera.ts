/**
 * The camera for scanning QR codes. `facingMode: 'environment'` alone may open any back lens: on
 * phones with several (the Galaxy S23, for one) Chrome can pick the ultra-wide, which has fixed
 * focus and blurs a QR held close. Android names its cameras `camera2 <n>, facing back`, and the
 * lowest number is the main lens: that one opens, once. Elsewhere (iPhone, computers) the browser's
 * own choice is already the main lens.
 */

// The first version chose by reported focus, which an ultra-wide can pass: its choice is ignored.
const STORAGE_KEY = 'gatopago.camera.v2';
// The sensor's own 4:3. A 16:9 frame turned upright is tall and narrow, and the square preview
// cropped almost half of it: the scan looked zoomed in.
const QUALITY = { width: { ideal: 1440 }, height: { ideal: 1080 } };

const open = (video: MediaTrackConstraints) =>
  navigator.mediaDevices.getUserMedia({ video: { ...video, ...QUALITY }, audio: false });

const androidIndex = (device: Pick<MediaDeviceInfo, 'label'>) =>
  Number(/camera2 (\d+)/.exec(device.label)?.[1]);

/** Android's main back lens, by name; none where cameras are not named that way. */
export function mainBackCamera<T extends Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>>(
  devices: readonly T[],
): T | undefined {
  return devices
    .filter(
      (device) =>
        device.kind === 'videoinput' &&
        /facing back/i.test(device.label) &&
        Number.isInteger(androidIndex(device)),
    )
    .sort((a, b) => androidIndex(a) - androidIndex(b))[0];
}

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(deviceId: string | null) {
  try {
    if (deviceId) localStorage.setItem(STORAGE_KEY, deviceId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Private mode: it chooses again next time. */
  }
}

/** Opens the main back camera, 4:3 in up to 1440×1080. */
export async function openScanCamera(): Promise<MediaStream> {
  const saved = remembered();
  if (saved) {
    try {
      return await open({ deviceId: { exact: saved } });
    } catch {
      remember(null);
    }
  }
  // With the permission already given, names are readable before opening anything.
  const known = mainBackCamera(await navigator.mediaDevices.enumerateDevices());
  if (known) {
    try {
      const stream = await open({ deviceId: { exact: known.deviceId } });
      remember(known.deviceId);
      return stream;
    } catch {
      /* Busy or gone: the browser's choice below. */
    }
  }
  const stream = await open({ facingMode: { ideal: 'environment' } });
  const main = mainBackCamera(await navigator.mediaDevices.enumerateDevices());
  const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
  if (!main || main.deviceId === current) {
    if (main) remember(main.deviceId);
    return stream;
  }
  // Android cannot keep two cameras open: release this one before opening the main lens.
  stream.getTracks().forEach((track) => track.stop());
  try {
    const next = await open({ deviceId: { exact: main.deviceId } });
    remember(main.deviceId);
    return next;
  } catch {
    return open({ facingMode: { ideal: 'environment' } });
  }
}

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};
let detector: Promise<Detector | null> | undefined;

/**
 * Chrome on Android reads QR codes natively: faster than jsQR and with blurrier or tilted frames.
 * Safari and most desktop browsers do not have it and use jsQR.
 */
export function qrDetector() {
  return (detector ??= (async () => {
    const Native = (window as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (!Native) return null;
    try {
      return (await Native.getSupportedFormats()).includes('qr_code')
        ? new Native({ formats: ['qr_code'] })
        : null;
    } catch {
      return null;
    }
  })());
}
