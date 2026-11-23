import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TxResult } from '../src/consumer/TxResult';
import { SwapText } from '../src/consumer/SwapText';
import { leadsElsewhere } from '../src/consumer/transition';

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: () => createElement('span', { 'aria-hidden': true }),
}));

afterEach(() => vi.unstubAllGlobals());

describe('the app in motion', () => {
  it('stages a success in parts, 100ms apart, and nothing else', () => {
    const success = renderToStaticMarkup(
      createElement(TxResult, {
        state: 'success',
        lead: 'Enviaste',
        amount: '10,00',
        unit: 'USDC',
        body: 'Ya le llegó.',
      }),
    );
    // The cat, the check, what happened, how much and the detail.
    expect(success.match(/stage-in/g)).toHaveLength(5);
    for (const step of [0, 1, 2, 3, 4]) expect(success).toContain(`--stage:${step}`);
    const failed = renderToStaticMarkup(
      createElement(TxResult, { state: 'failed', lead: 'No salió', amount: '10,00', body: 'x' }),
    );
    expect(failed).not.toContain('stage-in');
  });

  it('shows the first text still: only a change rises into place', () => {
    expect(renderToStaticMarkup(createElement(SwapText, null, '14.350,03'))).toBe(
      '<span>14.350,03</span>',
    );
  });

  it('animates a change of screen, never a change on the same one', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/en/app', origin: 'https://gatopago.com' },
    });
    expect(leadsElsewhere('/send')).toBe(true);
    expect(leadsElsewhere('/app')).toBe(false);
    // The menu's GatoPago Card opens a sheet on the same screen.
    expect(leadsElsewhere('/app?card')).toBe(false);
    expect(leadsElsewhere('#activity')).toBe(false);
  });
});
