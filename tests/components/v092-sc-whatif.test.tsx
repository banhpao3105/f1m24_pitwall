// @vitest-environment jsdom
/**
 * v0.11.0 — the scenario recommendation card (the old `tyre-whatif-sc`
 * section is DELETED — these tests now target its replacement inside the
 * one simulator workspace, on the MarinaBay fixture with its REAL track
 * columns pit 29 / green 27 / SC 16, chance 2/3):
 *
 *   · adding an SC event (defaults to the draft's first pit, 3 laps) shows
 *     the card with the SEARCH result — the lead's own order kept, its pit
 *     17 inside the window: 87.9s, delta −9.2s, "Giữ plan" verdict;
 *   · switching the window to VSC re-searches through the labelled
 *     midpoint: 92.5s, assumption cost 16.1;
 *   · applying an alternate writes its stints into the editor and the hero;
 *   · the green hero plan (lead card) stays untouched by the card;
 *   · deleting the event removes the card again.
 *
 * Every number flows THROUGH recommendUnderScenario + priceManualPlan —
 * never around the engine.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';
import { useSaveStore } from '@/store/save.store';
import { TyreLabView } from '@/components/pitwall/TyreLabView';
import { buildMarinaBayModel } from '../helpers/marinabay-fixture';
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
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TyreLabView — the scenario recommendation card (v0.11.0, MarinaBay)', () => {
  const model: SaveModel = buildMarinaBayModel();

  function renderLab(locale: 'vi' | 'en' = 'vi') {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />, locale));
    // the old card is gone for good
    expect(screen.queryByTestId('tyre-whatif-sc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tyre-whatif')).not.toBeInTheDocument();
    expect(screen.getByTestId('tyre-simulator')).toBeInTheDocument();
  }

  it('adding an SC event shows the search result: 87.9s, −9.2s, "Giữ plan"', () => {
    renderLab();
    expect(screen.queryByTestId('tyre-scenario-recommendation')).not.toBeInTheDocument();

    // the add-event button defaults to the draft's first pit (17), 3 laps,
    // and COMMITS the scenario on click
    fireEvent.click(screen.getByTestId('sim-add-event'));

    const card = screen.getByTestId('tyre-scenario-recommendation');
    expect(within(card).getByTestId('scenario-summary').textContent).toContain('SC V17–19');
    expect(within(card).getByTestId('scenario-verdict').textContent).toContain('Giữ plan');
    expect(within(card).getByTestId('scenario-verdict').textContent).toContain('V17');
    expect(within(card).getByTestId('scenario-verdict').textContent).toContain('tiết kiệm 9.2s');
    expect(within(card).getByTestId('scenario-time').textContent).toBe('87.9s');
    expect(within(card).getByTestId('scenario-delta').textContent).toBe('−9.2s');
    // the current plan re-priced under the scenario is the same 87.9s
    expect(within(card).getByTestId('scenario-current').textContent).toContain('87.9s');
  });

  it('switching the window to VSC re-searches through the labelled midpoint (92.5s)', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sim-add-event'));
    fireEvent.change(screen.getByTestId('sim-event-0-mode'), { target: { value: 'vsc' } });

    const card = screen.getByTestId('tyre-scenario-recommendation');
    expect(within(card).getByTestId('scenario-time').textContent).toBe('92.5s');
    expect(within(card).getByTestId('scenario-delta').textContent).toBe('−4.6s');
    fireEvent.click(within(card).getByText('Xem bằng chứng'));
    expect(within(card).getByTestId('scenario-assumptions').textContent).toContain(
      'trung điểm green↔SC',
    );
    expect(within(card).getByTestId('scenario-assumptions').textContent).toContain('16.1');
  });

  it('the SC evidence names the real-column arithmetic (cost 11.4)', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sim-add-event'));
    const card = screen.getByTestId('tyre-scenario-recommendation');
    fireEvent.click(within(card).getByText('Xem bằng chứng'));
    const assumptions = within(card).getByTestId('scenario-assumptions').textContent ?? '';
    expect(assumptions).toContain('cột thật của track');
    expect(assumptions).toContain('11.4');
  });

  it('applying an alternate writes its stints into the editor and the hero', async () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sim-add-event'));
    const card = screen.getByTestId('tyre-scenario-recommendation');
    // alternate 0: S→M→S, pit 17/44 — stints 17/27/18 at the same 87.9s
    expect(within(card).getByTestId('scenario-alt-0').textContent).toContain('S→M→S');
    expect(within(card).getByTestId('scenario-alt-0').textContent).toContain('87.9s');
    fireEvent.click(within(card).getByTestId('scenario-apply-alt-0'));

    // the replaced seed rows leave through AnimatePresence's exit cycle
    // (instant under reduced motion, but still one frame) — waitFor the
    // duplicates to unmount before asserting the editor values
    await waitFor(() => {
      expect(screen.getAllByTestId('sim-stint-0-laps').length).toBe(1);
    });
    expect((screen.getByTestId('sim-stint-0-laps') as HTMLInputElement).value).toBe('17');
    expect((screen.getByTestId('sim-stint-1-laps') as HTMLInputElement).value).toBe('27');
    expect((screen.getByTestId('sim-stint-2-laps') as HTMLInputElement).value).toBe('18');
    expect(screen.getByTestId('sim-total')?.textContent).toContain('87.9');
    // events survive the apply — the card stays
    expect(screen.getByTestId('tyre-scenario-recommendation')).toBeInTheDocument();
  });

  it('the green hero plan is untouched while the scenario card is on', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sim-add-event'));
    const hero = screen.getByTestId('tyre-stint-table');
    expect(hero.closest('section')!.querySelector('h3')!.textContent).toContain(
      'S(17) → S(18) → M(27)',
    );
  });

  it('deleting the event removes the card again', () => {
    renderLab();
    fireEvent.click(screen.getByTestId('sim-add-event'));
    expect(screen.getByTestId('tyre-scenario-recommendation')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sim-event-0-delete'));
    expect(screen.queryByTestId('tyre-scenario-recommendation')).not.toBeInTheDocument();
  });

  it('renders the same card in English', () => {
    renderLab('en');
    fireEvent.click(screen.getByTestId('sim-add-event'));
    const card = screen.getByTestId('tyre-scenario-recommendation');
    expect(within(card).getByTestId('scenario-verdict').textContent).toContain('Keep the plan');
    expect(within(card).getByTestId('scenario-apply').textContent).toContain('Apply this plan');
    expect(within(card).getByTestId('scenario-summary').textContent).toContain('SC V17–19');
  });
});
