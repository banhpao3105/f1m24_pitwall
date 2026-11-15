// @vitest-environment jsdom
/**
 * v0.8.1 component tests — WallSidebar footer save/reload states (DoD b):
 *   auto → "Tự động đọc lại khi F5" line; needs-permission → one-click
 *   button that calls requestAndReloadSave exactly once per click;
 *   unsupported → the honest browser note; foreign saveId → nothing.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NextIntlClientProvider } from 'next-intl';
import { messages } from '@/lib/i18n/config';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('@/lib/save-reload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/save-reload')>();
  return { ...actual, requestAndReloadSave: vi.fn() };
});

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { WallSidebar } from '@/components/pitwall/WallSidebar';
import { requestAndReloadSave } from '@/lib/save-reload';
import { toast } from '@/hooks/use-toast';
import { useSaveStore } from '@/store/save.store';
import { useSaveReloadStore } from '@/store/save-reload.store';
import { makeTestModel } from '../helpers/model';

afterEach(cleanup);

const model = makeTestModel('sha-a', { day: 46636, fileName: 'save4.sav' });

function renderSidebar(): void {
  render(
    <NextIntlClientProvider locale="vi" messages={messages.vi} timeZone="Asia/Shanghai">
      <WallSidebar />
    </NextIntlClientProvider>,
  );
}

function openSave(): void {
  useSaveStore.setState({ status: 'ready', model, progress: null, error: null });
}

describe('WallSidebar — save reload states (v0.8.1)', () => {
  it('renders the file name + change save button (baseline intact)', () => {
    openSave();
    useSaveReloadStore.getState().set('none', null, null);
    renderSidebar();
    expect(screen.getByTestId('sidebar-save')).toHaveTextContent('save4.sav');
    expect(screen.getByTestId('sidebar-change-save')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-reload-auto')).toBeNull();
    expect(screen.queryByTestId('sidebar-reload-permission')).toBeNull();
    expect(screen.queryByTestId('sidebar-reload-unsupported')).toBeNull();
  });

  it('auto capability → auto line, no permission button', () => {
    openSave();
    useSaveReloadStore.getState().set('auto', 'sha-a', 'save4.sav');
    renderSidebar();
    expect(screen.getByTestId('sidebar-reload-auto')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-reload-auto')).toHaveAttribute(
      'title',
      'save4.sav',
    );
    expect(screen.queryByTestId('sidebar-reload-permission')).toBeNull();
  });

  it('needs-permission → one-click button calling requestAndReloadSave once', async () => {
    openSave();
    useSaveReloadStore.getState().set('needs-permission', 'sha-a', 'save4.sav');
    vi.mocked(requestAndReloadSave).mockResolvedValue({
      kind: 'granted-reloaded',
      day: 46636,
      fileName: 'save4.sav',
    });

    renderSidebar();
    const button = screen.getByTestId('sidebar-reload-permission');
    expect(button).toHaveTextContent(messages.vi.wall.sidebar.reloadPermission);

    fireEvent.click(button);
    await waitFor(() => expect(requestAndReloadSave).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: messages.vi.library.reloadedTitle }),
      ),
    );
  });

  it('unsupported → honest browser note, no button', () => {
    openSave();
    useSaveReloadStore.getState().set('unsupported', 'sha-a', 'save4.sav');
    renderSidebar();
    expect(screen.getByTestId('sidebar-reload-unsupported')).toHaveTextContent(
      messages.vi.wall.sidebar.reloadUnsupported,
    );
    expect(screen.queryByTestId('sidebar-reload-permission')).toBeNull();
  });

  it('state scoped to another saveId renders nothing (drag-drop switch)', () => {
    openSave();
    useSaveReloadStore.getState().set('auto', 'sha-other', 'autosave.sav');
    renderSidebar();
    expect(screen.queryByTestId('sidebar-reload-auto')).toBeNull();
    expect(screen.queryByTestId('sidebar-reload-permission')).toBeNull();
    expect(screen.queryByTestId('sidebar-reload-unsupported')).toBeNull();
  });

  it('denied outcome stays silent (no toast)', async () => {
    openSave();
    useSaveReloadStore.getState().set('needs-permission', 'sha-a', 'save4.sav');
    vi.mocked(requestAndReloadSave).mockResolvedValue({ kind: 'denied' });

    renderSidebar();
    fireEvent.click(screen.getByTestId('sidebar-reload-permission'));
    await waitFor(() => expect(requestAndReloadSave).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(toast).not.toHaveBeenCalled();
  });
});
