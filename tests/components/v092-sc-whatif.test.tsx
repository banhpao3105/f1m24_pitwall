// @vitest-environment jsdom
/**
 * v0.9.2 — the Tyre Lab carries the SC/VSC what-if card: real track columns
 * in the context line, re-priced rows ("97.1s → 87.8s", "−9.3s · 1 pit trong
 * cửa sổ"), labelled assumptions, and an honest no-columns fallback. The
 * green hero plan must stay untouched by the scenario card.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TyreLabView — the SC/VSC what-if card (v0.9.2, MarinaBay)', () => {
  const model: SaveModel = buildMarinaBayModel();

  it('off by default; the toggle reveals context, re-priced rows and assumptions', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />));

    const card = screen.getByTestId('tyre-whatif-sc');
    expect(within(card).getByText('What-if SC/VSC')).toBeInTheDocument();
    expect(screen.queryByTestId('sc-rows')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sc-toggle'));

    // context line — the REAL MarinaBay columns (chance 2/3, pit 29 / green 27 / SC 16)
    const context = screen.getByTestId('sc-context');
    expect(context.textContent).toContain('66.7%');
    expect(context.textContent).toContain('pit 29');
    expect(context.textContent).toContain('SC 16');

    // default window starts at the plan's own first pit (lap 17): the lead
    // S(17)/S(18)/M(27) re-prices 97.1s → 87.8s, saving 9.3s
    const row0 = screen.getByTestId('sc-row-0');
    expect(row0.textContent).toContain('97.1s → 87.8s');
    expect(row0.textContent).toContain('−9.3s · 1 pit trong cửa sổ');

    // the labelled assumption spells out the real-column arithmetic
    // the v0.9.1 set-law assumption stays on the card
    expect(card.textContent).toContain('luật khả thi số bộ lốp');
  });

  it('switching to VSC re-prices through the labelled midpoint (92.5s)', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />));
    fireEvent.click(screen.getByTestId('sc-toggle'));
    fireEvent.click(screen.getByTestId('sc-mode-vsc'));

    const row0 = screen.getByTestId('sc-row-0');
    expect(row0.textContent).toContain('92.5s');
    expect(row0.textContent).toContain('−4.6s');
    expect(screen.getByTestId('tyre-whatif-sc').textContent).toContain('trung điểm green↔SC');
  });

  it('the green hero plan is untouched while the scenario card is on', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />));
    fireEvent.click(screen.getByTestId('sc-toggle'));

    const hero = screen.getByTestId('tyre-stint-table');
    expect(hero.closest('section')!.querySelector('h3')!.textContent).toContain(
      'S(17) → S(18) → M(27)',
    );
  });

  it('renders the same card in English', () => {
    useSaveStore.setState({ status: 'ready', model, error: null, progress: null });
    render(withI18n(<TyreLabView model={model} raceId={204} />, 'en'));
    fireEvent.click(screen.getByTestId('sc-toggle'));
    expect(screen.getByTestId('tyre-whatif-sc').textContent).toContain('SC/VSC what-if');
    expect(screen.getByTestId('sc-row-0').textContent).toContain('1 pit in window');
  });
});
