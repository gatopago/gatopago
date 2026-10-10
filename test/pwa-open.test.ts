import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('a tapped notification in an open app', () => {
  it('opens its screen only once the operation in flight has its result', async () => {
    vi.resetModules();
    let deliver: (event: MessageEvent) => void = () => {};
    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener: (_name: string, handle: (event: MessageEvent) => void) => {
          deliver = handle;
        },
        removeEventListener: () => {},
      },
    });
    const { onOpenRequest } = await import('../src/pwa/browser');
    const { holdPageReload } = await import('../src/pwa/reload-guard');
    const open = vi.fn();
    onOpenRequest(open);
    const release = holdPageReload();
    deliver({ data: { type: 'GATOPAGO_OPEN', link: '/statement' } } as MessageEvent);
    // Another site's path is never opened.
    deliver({ data: { type: 'GATOPAGO_OPEN', link: '//elsewhere.example' } } as MessageEvent);
    expect(open).not.toHaveBeenCalled();
    release();
    expect(open).toHaveBeenCalledExactlyOnceWith('/statement');
  });
});
