// @vitest-environment jsdom
/**
 * Component tests — Phase 1 (docs/05 §9.2: RecommendationCard +
 * ConfidenceBadge render đúng + confidence badge hiện).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ConfidenceBadge } from '@/components/pitwall/ConfidenceBadge';
import { RecommendationCard } from '@/components/pitwall/RecommendationCard';
import { CompoundBadge } from '@/components/pitwall/CompoundBadge';
import { StintTimeline } from '@/components/pitwall/StintTimeline';
import { messages } from '@/lib/i18n/config';

afterEach(cleanup);

function withI18n(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      {ui}
    </NextIntlClientProvider>
  );
}

const sampleRec = {
  id: 'rec-1',
  title: 'Chiến thuật đề xuất: S(12) → M(18) — 1 pit',
  action: 'Pit ở vòng 10–14 — chuyển sang Medium',
  why: 'Soft đã qua optimal window, deg tăng nhanh về cuối đời lốp.',
  confidence: 'MEDIUM' as const,
  evidence: [{ source: 'Races_PitStopTimings', label: 'Pit history tại track, 3 chặng' }],
  assumptions: [{ text: 'Thời tiết khô, không Safety Car' }],
  riskIfIgnored: 'Ở lại thêm 3 vòng mất ~1.8s + risk undercut.',
  expectedGain: '+2.3s vs 1-stop (ước lượng mô hình)',
};

describe('ConfidenceBadge', () => {
  it('renders HIGH with text and icon', () => {
    render(withI18n(<ConfidenceBadge confidence="HIGH" />));
    const badge = screen.getByTestId('confidence-high');
    expect(badge).toHaveTextContent('HIGH');
  });

  it('renders LOW for model fallbacks', () => {
    render(withI18n(<ConfidenceBadge confidence="LOW" />));
    expect(screen.getByTestId('confidence-low')).toBeInTheDocument();
  });
});

describe('RecommendationCard', () => {
  it('shows only title + action before the evidence toggle (v0.6.0 compact rule)', () => {
    render(withI18n(<RecommendationCard recommendation={sampleRec} />));
    expect(screen.getByText(sampleRec.action)).toBeInTheDocument();
    expect(screen.getByTestId('confidence-medium')).toBeInTheDocument();
    // v0.6.0: why / risk / expected gain are hidden until the toggle opens
    expect(screen.queryByText(sampleRec.why)).toBeNull();
    expect(screen.queryByText(sampleRec.riskIfIgnored)).toBeNull();
    expect(screen.queryByText(sampleRec.expectedGain)).toBeNull();
  });

  it('hides evidence until expanded, then shows why + risk + sources + assumptions', () => {
    render(withI18n(<RecommendationCard recommendation={sampleRec} />));
    expect(screen.queryByTestId('evidence-list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Xem bằng chứng/ }));
    expect(screen.getByTestId('evidence-list')).toBeInTheDocument();
    expect(screen.getByText(sampleRec.why)).toBeInTheDocument();
    expect(screen.getByText(sampleRec.riskIfIgnored)).toBeInTheDocument();
    expect(screen.getByText(sampleRec.expectedGain)).toBeInTheDocument();
    expect(screen.getByText(/Races_PitStopTimings/)).toBeInTheDocument();
    expect(screen.getByText(/Thời tiết khô/)).toBeInTheDocument();
  });

  it('feedback tooltip states it rates the suggestion, not an in-game vote', () => {
    render(withI18n(<RecommendationCard recommendation={sampleRec} />));
    const up = screen.getByTestId(`fb-up-${sampleRec.id}`);
    expect(up.getAttribute('title')).toContain('không phải vote trong game');
  });
});

describe('CompoundBadge + StintTimeline', () => {
  it('renders compound dot + letter with title', () => {
    render(<CompoundBadge compound="S" showLabel />);
    expect(screen.getByTitle('Soft tyre')).toHaveTextContent('S');
    expect(screen.getByText('Soft')).toBeInTheDocument();
  });

  it('renders stint timeline proportional blocks with pit laps', () => {
    const stints = [
      { compound: 'S' as const, laps: 12, fromLap: 1, toLap: 12 },
      { compound: 'M' as const, laps: 18, fromLap: 13, toLap: 30 },
    ];
    render(withI18n(<StintTimeline stints={stints} totalLaps={30} pitLaps={[12]} />));
    expect(screen.getByTestId('stint-timeline')).toBeInTheDocument();
    expect(screen.getByText('Pit: 12')).toBeInTheDocument();
    // v0.6.3: two-line labels — stint length on top, pit lap below; the
    // final stint reads "về đích" instead of a pit lap
    expect(screen.getByTestId('stint-label-0')).toHaveTextContent('S 12v');
    expect(screen.getByTestId('stint-pit-0')).toHaveTextContent('pit V12');
    expect(screen.getByTestId('stint-label-1')).toHaveTextContent('M 18v');
    expect(screen.getByTestId('stint-pit-1')).toHaveTextContent('về đích');
  });

  /* v0.6.3 regression — the v0.6.0 pit flags dropped `flex` from the bar
   * container, stacking the stints into one row per stint (last one clipped).
   * The container must be flex again and every stint must carry its own pit
   * lap label (stint i pits at its toLap). Montreal plan S(21)→S(22)→M(27). */
  it('keeps the stints on ONE flex row and labels every pit lap (v0.6.3)', () => {
    const stints = [
      { compound: 'S' as const, laps: 21, fromLap: 1, toLap: 21 },
      { compound: 'S' as const, laps: 22, fromLap: 22, toLap: 43 },
      { compound: 'M' as const, laps: 27, fromLap: 44, toLap: 70 },
    ];
    render(withI18n(<StintTimeline stints={stints} totalLaps={70} pitLaps={[21, 43]} />));
    const bar = screen.getByTestId('stint-timeline').firstElementChild as HTMLElement;
    // the bar's scroll wrapper is first, the flex bar is its child
    const flexBar = bar.firstElementChild as HTMLElement;
    expect(flexBar.className).toContain('flex');
    expect(flexBar.className).toContain('relative');
    // Montreal labels: S 21v / pit V21, S 22v / pit V43, M 27v / về đích
    expect(screen.getByTestId('stint-label-0')).toHaveTextContent('S 21v');
    expect(screen.getByTestId('stint-pit-0')).toHaveTextContent('pit V21');
    expect(screen.getByTestId('stint-label-1')).toHaveTextContent('S 22v');
    expect(screen.getByTestId('stint-pit-1')).toHaveTextContent('pit V43');
    expect(screen.getByTestId('stint-label-2')).toHaveTextContent('M 27v');
    expect(screen.getByTestId('stint-pit-2')).toHaveTextContent('về đích');
    expect(screen.getByText('Pit: 21, 43')).toBeInTheDocument();
  });

  it('falls back to compact labels on narrow segments but keeps the pit lap', () => {
    // 6 laps of 70 ≈ 8.6% < 12% → compact "S·6" / "V6"; 58 laps ≈ 83% → full
    const stints = [
      { compound: 'S' as const, laps: 6, fromLap: 1, toLap: 6 },
      { compound: 'M' as const, laps: 58, fromLap: 7, toLap: 64 },
      { compound: 'S' as const, laps: 6, fromLap: 65, toLap: 70 },
    ];
    render(withI18n(<StintTimeline stints={stints} totalLaps={70} pitLaps={[6, 64]} />));
    expect(screen.getByTestId('stint-label-0')).toHaveTextContent('S·6');
    expect(screen.getByTestId('stint-pit-0')).toHaveTextContent('V6');
    expect(screen.getByTestId('stint-label-1')).toHaveTextContent('M 58v');
    expect(screen.getByTestId('stint-pit-1')).toHaveTextContent('pit V64');
  });
});
