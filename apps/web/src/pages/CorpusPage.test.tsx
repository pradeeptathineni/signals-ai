// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { CorpusPage } from './CorpusPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('does not attach an older model result after the user submits a new indexed query', async () => {
  let finishResearch: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    finishResearch = resolve;
  });
  const paths: string[] = [];
  const fetchMock = vi.fn((path: string) => {
    paths.push(path);
    if (path.endsWith('/research-runs')) return pending;
    if (path === '/api/v1/integrations')
      return Promise.resolve(
        Response.json({
          items: [
            {
              sourceClass: 'local_semantic',
              enabled: true,
              modelIdentifier: 'controlled-test-model',
            },
          ],
        }),
      );
    if (path === '/api/v1/explorer/sessions')
      return Promise.resolve(Response.json({ id: 'session-a' }));
    if (path.includes('/research/runs/'))
      return Promise.resolve(
        Response.json({
          id: 'old-run',
          state: 'completed',
          proposals: [],
          candidates: [],
          safeDetail: 'Obsolete result',
        }),
      );
    return Promise.resolve(
      Response.json({
        scope: { label: 'Local', statement: 'Controlled local index' },
        query: null,
        scoringApplied: false,
        corpusCount: 0,
        matchedCount: 0,
        filteredCount: 0,
        facets: { layers: [], states: [], sources: [], kinds: [] },
        items: [],
        nextCursor: null,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CorpusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const input = screen.getByLabelText('Search the corpus');
  fireEvent.change(input, { target: { value: 'alpha need' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
  const organize = await screen.findByRole('button', {
    name: 'Organize this need with the configured model',
  });
  fireEvent.click(organize);
  await waitFor(() => expect(paths).toContain('/api/v1/explorer/sessions/session-a/research-runs'));
  fireEvent.change(input, { target: { value: 'beta need' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search corpus' }));
  await act(async () => {
    finishResearch(Response.json({ id: 'old-run', state: 'queued', strategy: 'model' }));
    await pending;
  });
  expect(paths).not.toContain('/api/v1/research/runs/old-run');
  expect(screen.queryByText('Obsolete result')).toBeNull();
  client.clear();
});
