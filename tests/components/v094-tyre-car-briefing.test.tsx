// @vitest-environment jsdom
/**
 * v0.9.4 — the Tyre Lab UI on the REAL Vegas save (save1.sav numbers):
 *
 *   · the trail card names the trail car's OWN worn sets —
 *     "bộ #0 · đã dùng · đời 18" / "bộ #3 · đã dùng · đời 18" — and no
 *     locked set (#1) or foreign fresh soft ever appears there;
 *   · the fresh/used label reads `fresh` (the v0.9.1 `spare` gate is gone):
 *     both plan cards together carry exactly 4 "mới" rows (lead 3 + trail M);
 *   · the cards are per-car briefings: "Xe 1 — O'Ward (P10)" and
 *     "Xe 2 — Ricciardo (P19): …";
 *   · the trail card shows its wear cost "mòn lốp: +0.2s" (the lead's wear
 *     is 0 → no line on the hero);
 *   · the ranking table names its basis (cap đội + kho Xe 1).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { buildVegasModel } from '../helpers/vegas-fixture';
import type { SaveModel } from '@/domain/types';

afterEach(cleanup);

function withI18n(ui: React.ReactElement, locale: 'vi' | 'en' = 'vi') {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Bangkok">
      {ui}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TyreLabView — per-car briefing + wear cost (v0.9.4, Vegas save)', () => {
  const model: SaveModel = buildVegasModel();

  it('the lead card reads "Xe 1 — O\'Ward (P10)" and shows 3 fresh sets', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={208} />));

    const chip = screen.getByTestId('lead-plan-driver');
    expect(chip.textContent).toBe("Xe 1 — O'Ward (P10)");

    const hero = screen.getByTestId('tyre-stint-table');
    expect(within(hero).getByText('bộ #0 · mới · đời 20')).toBeInTheDocument();
    expect(within(hero).getByText('bộ #1 · mới · đời 20')).toBeInTheDocument();
    expect(within(hero).getByText('bộ #8 · mới · đời 31')).toBeInTheDocument();
    // the lead's wear is 0 → no wear line on the hero card
    expect(screen.queryByTestId('hero-wear-cost')).not.toBeInTheDocument();
  });

  it('the trail card reads "Xe 2 — Ricciardo (P19): S(13) → M(24) → S(13)" with the worn sets', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={208} />));

    const trailSection = screen.getByTestId('trail-plan');
    expect(trailSection.querySelector('h3')!.textContent).toBe(
      'Xe 2 — Ricciardo (P19): S(13) → M(24) → S(13)',
    );

    const trail = screen.getByTestId('trail-stint-table');
    // the trail car's OWN stock: the S stints WORN #0/#3, the M stint fresh #8
    expect(within(trail).getByText('bộ #8 · mới · đời 31')).toBeInTheDocument();
    expect(within(trail).getByText('bộ #0 · đã dùng · đời 18')).toBeInTheDocument();
    expect(within(trail).getByText('bộ #3 · đã dùng · đời 18')).toBeInTheDocument();
    // no "mới" soft can appear on the trail card — car 2 owns none
    expect(within(trail).queryAllByText(/mới · đời 20/)).toHaveLength(0);
    // the locked S #1 never shows up on the PLAN CARDS — the guarantee is
    // about the per-car briefings; the v0.9.7 simulator is a sandbox that
    // seeds its own table from the lead plan, so #1 legitimately appears
    // THERE and the count stays scoped to the cards
    expect(within(trail).queryAllByText(/bộ #1/)).toHaveLength(0);
    expect(within(screen.getByTestId('tyre-stint-table')).queryAllByText(/bộ #1/)).toHaveLength(1);

    // the wear cost line on the trail card
    expect(screen.getByTestId('trail-wear-cost').textContent).toBe('mòn lốp: +0.2s');
  });

  it('both plan cards together carry exactly 4 "mới" rows (lead 3 + trail M)', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={208} />));
    const hero = screen.getByTestId('tyre-stint-table');
    const trail = screen.getByTestId('trail-stint-table');
    const freshRows = [
      ...within(hero).queryAllByText(/· mới ·/),
      ...within(trail).queryAllByText(/· mới ·/),
    ];
    expect(freshRows).toHaveLength(4);
    // and the used rows live on the trail only
    const usedRows = [
      ...within(hero).queryAllByText(/· đã dùng ·/),
      ...within(trail).queryAllByText(/· đã dùng ·/),
    ];
    expect(usedRows).toHaveLength(2);
  });

  it('the ranking table names its basis (cap đội + kho Xe 1)', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={208} />));
    expect(screen.getByText(/Bảng xếp hạng tính trên cap đội với kho Xe 1/)).toBeInTheDocument();
  });

  it('English locale mirrors the car label + wear line', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={208} />, 'en'));
    expect(screen.getByTestId('lead-plan-driver').textContent).toBe("Xe 1 — O'Ward (P10)");
    expect(screen.getByTestId('trail-wear-cost').textContent).toBe('tyre wear: +0.2s');
  });
});
