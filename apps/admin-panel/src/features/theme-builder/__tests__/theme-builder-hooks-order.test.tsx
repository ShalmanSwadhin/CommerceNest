/**
 * Regression test for a Rules-of-Hooks crash discovered while live-testing
 * the Premium Image Support feature: `handleSelectSection`,
 * `handleSectionsChange`, and `handleAddSection` (all `useCallback`) were
 * declared AFTER `if (themeQ.isLoading || !doc) return <PageSkeleton />;`.
 *
 * On the first render `doc` is null, so that early return fires and those
 * three hooks are never called. Once the theme finishes loading, `doc` is
 * set and the component re-renders without returning early — calling three
 * MORE hooks than the previous render. React detects this and throws
 * "Rendered more hooks than during the previous render", which crashes the
 * whole Theme Builder to a blank screen every single time a store's theme
 * finishes loading. This was never caught by earlier component-level tests
 * because they exercised SectionList/ThemeLivePreview directly rather than
 * ThemeBuilder's own loading -> loaded transition.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@commercenest/ui';

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getTheme: vi.fn().mockResolvedValue({
        draft: {
          id: 'draft-1',
          status: 'DRAFT',
          versionNumber: 3,
          layout: {
            sections: [
              { id: 'hero-1', type: 'hero', visible: true, settings: { title: 'Hello' } },
            ],
          },
          themeSettings: {},
        },
        published: null,
      }),
      listStores: vi.fn().mockResolvedValue({ items: [{ id: 'store-1', name: 'Test Store', slug: 'test-store' }] }),
      themeVersions: vi.fn().mockResolvedValue({ items: [] }),
    },
  };
});

const { ThemeBuilder } = await import('../ThemeBuilder');

function renderThemeBuilder() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <ThemeBuilder storeId="store-1" />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ThemeBuilder — hook order across the loading -> loaded transition', () => {
  it('renders through loading into the loaded editor without a "Rendered more hooks" crash', async () => {
    const consoleErrors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args[0]);
    });

    renderThemeBuilder();

    // Loaded state: the toolbar's "Save Draft" button only renders once
    // `doc` is set, proving the loading -> loaded transition completed
    // without React bailing out of the tree.
    await waitFor(() => expect(screen.getByText('Save Draft')).toBeInTheDocument());

    const hookOrderErrors = consoleErrors.filter((msg) =>
      typeof msg === 'string' && msg.includes('Rendered more hooks'),
    );
    expect(hookOrderErrors).toEqual([]);

    spy.mockRestore();
  });
});
