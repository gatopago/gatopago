import { afterEach, describe, expect, it, vi } from 'vitest';
import { mainBackCamera, scanCameras } from '../src/consumer/camera';

const camera = (deviceId: string, label: string, kind: MediaDeviceKind = 'videoinput') => ({
  deviceId,
  label,
  kind,
});

describe('Main back camera', () => {
  it("picks Android's lowest back camera, not the ultra-wide listed first", () => {
    const devices = [
      camera('wide', 'camera2 2, facing back'),
      camera('front', 'camera2 1, facing front'),
      camera('main', 'camera2 0, facing back'),
      camera('tele', 'camera2 3, facing back'),
      camera('mic', 'Default', 'audioinput'),
    ];
    expect(mainBackCamera(devices)?.deviceId).toBe('main');
  });
  it('leaves the choice to the browser where cameras are not named by Android', () => {
    // iPhone, a computer, and any device before the permission (labels are empty then).
    expect(
      mainBackCamera([camera('a', 'Back Ultra Wide Camera'), camera('b', 'Back Camera')]),
    ).toBeUndefined();
    expect(mainBackCamera([camera('c', 'Integrated Webcam')])).toBeUndefined();
    expect(mainBackCamera([camera('d', ''), camera('e', '')])).toBeUndefined();
  });
});

describe('Cameras to switch between', () => {
  it("lists Android's back lenses, main first, without the front one", () => {
    const devices = [
      camera('wide', 'camera2 2, facing back'),
      camera('front', 'camera2 1, facing front'),
      camera('main', 'camera2 0, facing back'),
      camera('tele', 'camera2 3, facing back'),
    ];
    expect(scanCameras(devices).map(({ deviceId }) => deviceId)).toEqual(['main', 'wide', 'tele']);
  });
  it('offers every camera when the browser hides their names, and never a front one', () => {
    expect(scanCameras([camera('a', ''), camera('b', '')]).map(({ deviceId }) => deviceId)).toEqual(
      ['a', 'b'],
    );
    const iphone = [
      camera('back', 'Back Camera'),
      camera('wide', 'Back Ultra Wide Camera'),
      camera('front', 'Front Camera'),
      camera('mic', 'iPhone Microphone', 'audioinput'),
    ];
    expect(scanCameras(iphone).map(({ deviceId }) => deviceId)).toEqual(['back', 'wide']);
  });
});

describe('Opening the scan camera', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns the camera it opened when listing cameras fails, never leaves it running', async () => {
    let stops = 0;
    const stream = {
      getTracks: () => [{ stop: () => stops++ }],
      getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'cam' }) }],
    };
    vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: () => Promise.reject(new Error('enumeration failed')),
        getUserMedia: () => Promise.resolve(stream),
      },
    });
    const { openScanCamera } = await import('../src/consumer/camera');
    await expect(openScanCamera()).resolves.toBe(stream);
    expect(stops).toBe(0);
  });
});
