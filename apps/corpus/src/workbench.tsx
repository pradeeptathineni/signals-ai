import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  filterSearchItems,
  sourceHost,
  saveDecision,
  activeObservations,
  type SearchFilters,
} from '../../../packages/domain/src/search-score.js';
import { budgets, kinds, channels } from '../../../packages/domain/src/search-vocabulary.js';
import type { SearchItem, SearchResult } from '../../../packages/domain/src/search-contract.js';
import type { SearchSettings } from '../../../packages/corpus/src/search-settings.js';
import type { StoredEntity } from '../../../packages/corpus/src/search-store.js';
import type { QueryBatch } from '../../../packages/corpus/src/search-query-list.js';

const local = (window as Window & { __SIGNALS_LOCAL__?: boolean }).__SIGNALS_LOCAL__ === true;
const base = import.meta.env.BASE_URL;
export function Workbench({ legacyCorpus }: { legacyCorpus: ReactNode }) {
  const [tab, setTab] = useState(local ? 'Search' : 'Corpus');
  const [token, setToken] = useState(''),
    [ready, setReady] = useState('Checking runner…');
  const [settings, setSettings] = useState<SearchSettings | null>(null);
  const [query, setQuery] = useState(''),
    [result, setResult] = useState<SearchResult | null>(null);
  const [run, setRun] = useState(''),
    [events, setEvents] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<QueryBatch | null>(null);
  const [interestFilter, setInterestFilter] = useState('');
  const [batchHistory, setBatchHistory] = useState<
    { id: string; createdAt: string; total: number; pending: number; uncertain: number }[]
  >([]);
  const [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [corpus, setCorpus] = useState<StoredEntity[]>([]),
    [saved, setSaved] = useState(new Set<string>());
  const [selected, setSelected] = useState<string[]>([]),
    [filters, setFilters] = useState<SearchFilters>({});
  const [followup, setFollowup] = useState(''),
    [answer, setAnswer] = useState<null | {
      answer: string;
      statements: { entityId: string; evidenceId: string; statement: string }[];
    }>(null);
  const [history, setHistory] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);
  const [recentRuns, setRecentRuns] = useState<
    { runId: string; query: string; status: string; candidates: number }[]
  >([]);
  const [selections, setSelections] = useState<
    {
      id: string;
      query: string;
      kind: string;
      at: string;
      selected: string[];
      changed: string[];
      queryId?: string;
    }[]
  >([]);
  async function api<T>(route: string, body?: unknown): Promise<T> {
    const response = await fetch(
      `${base}__signals/api/${route}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-signals-token': token },
            body: JSON.stringify(body),
          },
    );
    const value: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        value && typeof value === 'object' && 'code' in value
          ? String(value.code)
          : 'Operation failed',
      );
    return value as T;
  }
  async function reloadCorpus() {
    const records = local
      ? await api<StoredEntity[]>('corpus')
      : await fetch(`${base}entities.json`).then((response) =>
          response.ok ? (response.json() as Promise<StoredEntity[]>) : [],
        );
    if (local) records.push(...(await api<StoredEntity[]>('private-corpus')));
    setCorpus(records);
    setSaved(new Set(records.map((record) => record.entity.id)));
  }
  useEffect(() => {
    void reloadCorpus().catch((failure: unknown) => setError(String(failure)));
    if (local) {
      void fetch(`${base}__signals/api/session`)
        .then(
          (response) =>
            response.json() as Promise<{
              token: string;
              capability: { available: boolean; reason: string; runner: string };
            }>,
        )
        .then((session) => {
          setToken(session.token);
          setReady(
            `${session.capability.available ? 'Ready' : 'Unavailable'}: ${session.capability.runner}. ${session.capability.reason}`,
          );
        })
        .catch(() => setReady('Local bridge unavailable.'));
      void api<SearchSettings>('settings')
        .then(setSettings)
        .catch((failure: unknown) => setError(String(failure)));
    }
  }, []);
  useEffect(() => {
    if (!run || !busy) return;
    let stopped = false;
    const poll = async () => {
      try {
        const state = await api<{
          events: string[];
          result: SearchResult | null;
          error: string | null;
          batch: QueryBatch | null;
        }>(`runs/${run}`);
        if (state.error) throw new Error(state.error);
        if (stopped) return;
        setEvents(state.events);
        if (state.batch) {
          setBatch(state.batch);
          setBusy(false);
          setMessage(
            `Query list: ${state.batch.jobs.filter((job) => job.status !== 'pending').length} of ${state.batch.jobs.length} processed. Recurrence stays as configured.`,
          );
          void reloadCorpus();
        }
        if (state.result) {
          setResult(state.result);
          setBusy(false);
          setMessage(`Research ${state.result.status}; ${state.result.items.length} candidates.`);
        }
      } catch (failure) {
        if (!stopped) {
          setError(String(failure));
          setBusy(false);
        }
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [run, busy]);
  const corpusItems: SearchItem[] = corpus.map((record) => ({
    entity: record.entity,
    match: {
      level: 'unknown',
      reason: 'Reusable saved entity; relevance depends on your current need.',
      sources: [],
    },
    eligible: false,
    reasons: [],
  }));
  const all = tab === 'Search' ? (result?.items ?? []) : corpusItems;
  const items = useMemo(() => filterSearchItems(all, filters, saved), [all, filters, saved]);
  const compared = all.filter((item) => selected.includes(item.entity.id)).slice(0, 2);
  function change(key: keyof SearchFilters, value: string | number | undefined) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }
  async function action(operation: () => Promise<void>) {
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  async function start(
    refreshId?: string,
    question = query,
    supplementalSites?: string[],
    context?: string,
  ) {
    const started = await api<{ id: string }>(
      refreshId ? 'refresh' : 'search',
      refreshId
        ? { id: refreshId }
        : {
            query: question,
            context,
            supplementalSites,
            profile: settings?.profile ?? 'wide',
            save: 'never',
            cache: 'private',
          },
    );
    setRun(started.id);
    setBusy(true);
    setResult(null);
    setSelected([]);
    setAnswer(null);
    setEvents(['Starting research…']);
    setTab('Search');
    if (!refreshId) setQuery(question);
  }
  async function save(ids: string[], mode: 'manual' | 'eligible') {
    if (!result) return;
    const response = await api<{ changed: string[]; skipped: string[] }>('save', {
      runId: result.runId,
      ids,
      mode,
    });
    await reloadCorpus();
    setMessage(
      `${response.changed.length} saved locally; ${response.skipped.length} skipped. Publication is separate.`,
    );
  }
  const eligible = items.filter(
    (item) =>
      saveDecision(item.entity, item.match, settings?.threshold ?? 75).eligible &&
      !saved.has(item.entity.id),
  );
  const Container = tab === 'Corpus' ? 'section' : 'main';
  return (
    <>
      <a className="skip-link" href={tab === 'Corpus' ? '#results' : '#workbench-content'}>
        Skip to {tab === 'Corpus' ? 'findings' : 'search'}
      </a>
      <nav className="workbench-nav" aria-label="Signals destinations">
        <a href={base} className="brand">
          Signals
        </a>
        {(local ? ['Search', 'Corpus', 'Settings'] : ['Corpus']).map((destination) => (
          <button
            key={destination}
            aria-current={tab === destination ? 'page' : undefined}
            onClick={() => {
              setTab(destination);
              setFilters({});
              setSelected([]);
            }}
          >
            {destination}
          </button>
        ))}
        <span>{local ? 'Local workbench' : 'Public corpus · read only'}</span>
      </nav>
      <Container id="workbench-content" className="workbench" aria-label="Native Signals entities">
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {tab === 'Settings' && settings ? (
          <section aria-labelledby="settings-title">
            <h1 id="settings-title">Settings</h1>
            <p>{ready}</p>
            <p>
              Your Codex credentials stay with Codex. Saved questions and settings stay private.
              Publication: {settings.publication}.
            </p>
            <div className="filters">
              <label>
                Model reference (blank uses installed configuration)
                <input
                  value={settings.model}
                  onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                />
              </label>
              <label>
                Reasoning effort reference
                <input
                  value={settings.effort}
                  onChange={(event) => setSettings({ ...settings, effort: event.target.value })}
                />
              </label>
              <label>
                Depth
                <select
                  value={settings.profile}
                  onChange={(event) =>
                    setSettings({ ...settings, profile: event.target.value as 'quick' | 'wide' })
                  }
                >
                  <option>quick</option>
                  <option>wide</option>
                </select>
              </label>
              <label>
                Evidence extraction model reference (blank inherits discovery)
                <input
                  value={settings.extractionModel ?? ''}
                  onChange={(event) =>
                    setSettings({ ...settings, extractionModel: event.target.value })
                  }
                />
              </label>
              <label>
                Evidence extraction effort reference (blank inherits discovery)
                <input
                  value={settings.extractionEffort ?? ''}
                  onChange={(event) =>
                    setSettings({ ...settings, extractionEffort: event.target.value })
                  }
                />
              </label>
              <label>
                Save threshold
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.threshold}
                  onChange={(event) =>
                    setSettings({ ...settings, threshold: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Retain temporary results (days)
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={settings.retentionDays}
                  onChange={(event) =>
                    setSettings({ ...settings, retentionDays: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Corpus destination
                <select
                  value={settings.destination}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      destination: event.target.value as 'public' | 'private',
                    })
                  }
                >
                  <option value="public">Git-visible local files</option>
                  <option value="private">Private corpus</option>
                </select>
              </label>
              <label>
                Publication policy
                <select
                  value={settings.publication}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      publication: event.target.value as SearchSettings['publication'],
                    })
                  }
                >
                  <option value="local-only">Local only</option>
                  <option value="reviewed-push">Reviewed CLI push</option>
                  <option value="unattended">Unattended Git push</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Source families</legend>
              <p>
                Search through the host's available public tools. Disabled or inaccessible families
                remain explicit gaps.
              </p>
              {channels.map((channel) => (
                <label className="check" key={channel}>
                  <input
                    type="checkbox"
                    checked={settings.sources.includes(channel)}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        sources: event.target.checked
                          ? [...settings.sources, channel]
                          : settings.sources.filter((value) => value !== channel),
                      })
                    }
                  />
                  {channel}
                </label>
              ))}
            </fieldset>
            <h2>Discovery</h2>
            <label>
              Supplemental websites and paths (one public HTTPS URL per line)
              <textarea
                defaultValue={(settings.supplementalSites ?? []).join('\n')}
                onBlur={(event) =>
                  setSettings({
                    ...settings,
                    supplementalSites: [
                      ...new Set(event.target.value.split(/\s+/).filter(Boolean)),
                    ],
                  })
                }
              />
            </label>
            <p>
              These add direct site/path searches when relevant, within the same budget. Public
              social posts may be inaccessible. A mirror or repeated recommendation earns no extra
              independence.
            </p>
            <p>
              Enabling a mode permits recurring inference while the local timer runs. Runner: Codex;
              UTC; one job at a time; {JSON.stringify(budgets[settings.profile])}; threshold{' '}
              {settings.threshold}; {settings.retentionDays} days temporary retention;{' '}
              {settings.destination} destination; {settings.publication} publication.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.queryDiscovery}
                onChange={(event) =>
                  setSettings({ ...settings, queryDiscovery: event.target.checked })
                }
              />
              Enable query discovery
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.corpusDiscovery}
                onChange={(event) =>
                  setSettings({ ...settings, corpusDiscovery: event.target.checked })
                }
              />
              Enable corpus discovery
            </label>
            <label>
              Corpus cadence (days)
              <input
                type="number"
                min="1"
                value={settings.corpusEveryDays}
                onChange={(event) =>
                  setSettings({ ...settings, corpusEveryDays: Number(event.target.value) })
                }
              />
            </label>
            <h3>Saved questions</h3>
            <label>
              Find saved questions
              <input
                value={interestFilter}
                onChange={(event) => setInterestFilter(event.target.value)}
              />
            </label>
            <p>
              {settings.queries.length} saved questions. Showing up to 20 matching questions; filter
              by name or wording to edit more.
            </p>
            {settings.queries
              .map((entry, index) => ({ entry, index }))
              .filter(({ entry }) =>
                `${entry.id} ${entry.query}`.toLowerCase().includes(interestFilter.toLowerCase()),
              )
              .slice(0, 20)
              .map(({ entry, index }) => (
                <fieldset key={entry.id}>
                  <legend>{entry.id}</legend>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          queries: settings.queries.map((value, i) =>
                            i === index ? { ...value, enabled: event.target.checked } : value,
                          ),
                        })
                      }
                    />
                    Participate
                  </label>
                  <label>
                    Question
                    <textarea
                      value={entry.query}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          queries: settings.queries.map((value, i) =>
                            i === index ? { ...value, query: event.target.value } : value,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Every (days)
                    <input
                      type="number"
                      min="1"
                      value={entry.everyDays}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          queries: settings.queries.map((value, i) =>
                            i === index
                              ? { ...value, everyDays: Number(event.target.value) }
                              : value,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Supplemental paths for {entry.id} (one URL per line)
                    <textarea
                      defaultValue={(entry.supplementalSites ?? []).join('\n')}
                      onBlur={(event) =>
                        setSettings({
                          ...settings,
                          queries: settings.queries.map((value, i) =>
                            i === index
                              ? {
                                  ...value,
                                  supplementalSites: [
                                    ...new Set(event.target.value.split(/\s+/).filter(Boolean)),
                                  ],
                                }
                              : value,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void action(() =>
                        start(undefined, entry.query, entry.supplementalSites, entry.context),
                      );
                    }}
                  >
                    Search {entry.id} now
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        queries: settings.queries.filter((value) => value.id !== entry.id),
                      })
                    }
                  >
                    Remove {entry.id}
                  </button>
                </fieldset>
              ))}
            <button
              onClick={() => {
                setSettings({
                  ...settings,
                  queries: [
                    ...settings.queries,
                    {
                      id: `query-${Date.now()}`,
                      query: 'My discovery question',
                      everyDays: 14,
                      offsetMinutes: 0,
                      enabled: true,
                      concepts: [],
                    },
                  ],
                });
              }}
            >
              Add question
            </button>
            <div className="actions">
              <button
                onClick={() => {
                  void action(async () => {
                    const validated = await api<SearchSettings>('settings', settings);
                    setSettings(validated);
                    setMessage(
                      'Settings saved. Start npm run discovery -- timer to run enabled modes while the laptop is awake.',
                    );
                  });
                }}
              >
                Save settings
              </button>
              <button
                onClick={() => {
                  void action(async () => {
                    const status = await api<unknown>('run-due', {});
                    setHistory(JSON.stringify(status, null, 2));
                    await reloadCorpus();
                  });
                }}
              >
                Run due once
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  void action(async () => {
                    const ids = settings.queries
                      .filter(
                        (entry) =>
                          entry.enabled &&
                          `${entry.id} ${entry.query}`
                            .toLowerCase()
                            .includes(interestFilter.toLowerCase()),
                      )
                      .map((entry) => entry.id);
                    const started = await api<{ id: string }>('run-list', { ids });
                    setRun(started.id);
                    setBusy(true);
                    setTab('Search');
                  });
                }}
              >
                Run matching enabled interests once
              </button>
              <p>
                One-shot research runs up to {settings.batchSize} interests per activation and saves
                eligible matches. It does not enable recurring discovery.
              </p>
              {batch && (
                <div>
                  <p>
                    {batch.jobs.filter((job) => job.status !== 'pending').length} of{' '}
                    {batch.jobs.length} interests processed.
                  </p>
                  <button
                    disabled={busy || !batch.jobs.some((job) => job.status === 'pending')}
                    onClick={() => {
                      void action(async () => {
                        const started = await api<{ id: string }>('run-list', { resume: batch.id });
                        setRun(started.id);
                        setBusy(true);
                        setTab('Search');
                      });
                    }}
                  >
                    Continue pending interests
                  </button>
                  <details>
                    <summary>Review processed interests</summary>
                    <ul>
                      {batch.jobs
                        .filter((job) => job.status !== 'pending')
                        .map((job) => (
                          <li key={job.id}>
                            {job.query}: {job.status}; {job.saved.length} saved.{' '}
                            {job.gaps.slice(-1).join(' ')}
                            {job.runId && (
                              <button
                                onClick={() => {
                                  void action(async () => {
                                    const opened = await api<{ id: string }>('history/open', {
                                      runId: job.runId,
                                    });
                                    setRun(opened.id);
                                    setBusy(true);
                                    setTab('Search');
                                  });
                                }}
                              >
                                Review {job.query}
                              </button>
                            )}
                          </li>
                        ))}
                    </ul>
                  </details>
                </div>
              )}
              <button
                onClick={() => {
                  void action(async () => {
                    const recent = await api<{
                      runs: typeof recentRuns;
                      selections: typeof selections;
                      discovery: unknown;
                      batches: typeof batchHistory;
                    }>('history');
                    setRecentRuns(recent.runs);
                    setSelections(recent.selections);
                    setBatchHistory(recent.batches);
                    setHistory(JSON.stringify(recent.discovery, null, 2));
                  });
                }}
              >
                Show history
              </button>
              <button
                onClick={() => {
                  void action(async () => {
                    await api('cleanup', {});
                    setMessage(
                      'Expired temporary runs removed. Retained historical snapshots preserved.',
                    );
                  });
                }}
              >
                Clean expired results
              </button>
            </div>
            {history && <pre>{history}</pre>}
            {batchHistory.length > 0 && (
              <section aria-label="Query list history">
                <h2>Query list history</h2>
                {batchHistory.map((savedBatch) => (
                  <article key={savedBatch.id}>
                    <p>
                      {savedBatch.createdAt}: {savedBatch.total} interests, {savedBatch.pending}{' '}
                      pending, {savedBatch.uncertain} interrupted or uncertain.
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => {
                        void action(async () => {
                          setBatch(await api<QueryBatch>(`batches/${savedBatch.id}`));
                        });
                      }}
                    >
                      Open query list
                    </button>
                  </article>
                ))}
              </section>
            )}
            {selections.length > 0 && (
              <section aria-label="Saved interest ledger">
                <h2>Saved interest ledger</h2>
                <p>
                  Private query and save provenance. Public entities keep reusable evidence; saving
                  and publication are separate.
                </p>
                <ul>
                  {selections.map((selection) => (
                    <li key={selection.id}>
                      {selection.query} · {selection.kind}
                      {selection.queryId ? ` (${selection.queryId})` : ''} ·{' '}
                      {selection.selected.length} selected, {selection.changed.length} changed ·{' '}
                      {selection.at}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {recentRuns.length > 0 && (
              <section aria-label="Recent research">
                <h2>Recent research</h2>
                {recentRuns.map((recent) => (
                  <article key={recent.runId}>
                    <p>{recent.query}</p>
                    <p>
                      {recent.status} · {recent.candidates} candidates
                    </p>
                    <button
                      onClick={() => {
                        void action(async () => {
                          const opened = await api<{ id: string }>('history/open', {
                            runId: recent.runId,
                          });
                          setRun(opened.id);
                          setBusy(true);
                          setSelected([]);
                          setFilters({});
                          setAnswer(null);
                          setTab('Search');
                        });
                      }}
                    >
                      Open result
                    </button>
                  </article>
                ))}
              </section>
            )}
          </section>
        ) : tab === 'Settings' ? (
          <p role="status">Loading settings…</p>
        ) : (
          <>
            <section className="intro">
              <h1>{tab === 'Search' ? 'Find useful knowledge.' : 'Your saved knowledge.'}</h1>
              <p>
                {tab === 'Search'
                  ? 'Ask your AI to discover sources, compare alternatives, and return evidence you can inspect.'
                  : 'Canonical entities preserve evidence and score history through Git.'}
              </p>
            </section>
            {tab === 'Search' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void action(() => start());
                }}
              >
                <label>
                  Research question
                  <textarea
                    required
                    maxLength={2000}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="What do you want to understand or find?"
                  />
                </label>
                <p>{ready}</p>
                <p>
                  {settings?.profile ?? 'wide'} budget:{' '}
                  {JSON.stringify(budgets[settings?.profile ?? 'wide'])}. Review before saving;
                  results retained privately.
                </p>
                <div className="actions">
                  <button disabled={busy || !token || !query.trim()} type="submit">
                    Start search
                  </button>
                  <button
                    disabled={busy || !result}
                    type="button"
                    onClick={() => {
                      void action(() => start());
                    }}
                  >
                    Search further
                  </button>
                  <button
                    disabled={!busy}
                    type="button"
                    onClick={() => {
                      void action(async () => {
                        await api(`cancel/${run}`, {});
                        setMessage('Cancellation requested.');
                      });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {tab === 'Search' && events.length > 0 && (
              <details open={busy}>
                <summary>{busy ? 'Research in progress' : 'Run progress'}</summary>
                <ol aria-live="polite">
                  {events.slice(-8).map((event, index) => (
                    <li key={index}>{event}</li>
                  ))}
                </ol>
              </details>
            )}
            <section className="controls" aria-label="Entity filters">
              <div className="filters">
                <label>
                  Filter results
                  <input
                    type="search"
                    value={filters.text ?? ''}
                    onChange={(event) => change('text', event.target.value)}
                  />
                </label>
                <label>
                  Kind
                  <select
                    value={filters.kind ?? ''}
                    onChange={(event) => change('kind', event.target.value)}
                  >
                    <option value="">All kinds</option>
                    {kinds.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Facet
                  <select
                    value={filters.facet ?? ''}
                    onChange={(event) => change('facet', event.target.value)}
                  >
                    <option value="">All facets</option>
                    {[...new Set(all.flatMap((item) => Object.values(item.entity.facets).flat()))]
                      .sort()
                      .map((facet) => (
                        <option key={facet}>{facet}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Source host
                  <select
                    value={filters.host ?? ''}
                    onChange={(event) => change('host', event.target.value)}
                  >
                    <option value="">All hosts</option>
                    {[
                      ...new Set(
                        all.flatMap((item) =>
                          item.entity.evidence.map((source) => sourceHost(source.uri)),
                        ),
                      ),
                    ]
                      .sort()
                      .map((host) => (
                        <option key={host}>{host}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Source family
                  <select
                    value={filters.family ?? ''}
                    onChange={(event) => change('family', event.target.value)}
                  >
                    <option value="">All families</option>
                    {[
                      ...new Set(
                        all.flatMap((item) => item.entity.evidence.map((source) => source.family)),
                      ),
                    ]
                      .sort()
                      .map((family) => (
                        <option key={family}>{family}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Minimum score (unknown stays visible)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.min ?? ''}
                    onChange={(event) =>
                      change('min', event.target.value ? Number(event.target.value) : undefined)
                    }
                  />
                </label>
                <label>
                  Match
                  <select
                    value={filters.match ?? ''}
                    onChange={(event) => change('match', event.target.value)}
                  >
                    <option value="">All matches</option>
                    {['direct', 'related', 'unknown', 'out-of-scope'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Maximum score (unknown stays visible)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={filters.max ?? ''}
                    onChange={(event) =>
                      change('max', event.target.value ? Number(event.target.value) : undefined)
                    }
                  />
                </label>
                <label>
                  Evidence state
                  <select
                    value={filters.state ?? ''}
                    onChange={(event) => change('state', event.target.value)}
                  >
                    <option value="">All states</option>
                    {['assessed', 'provisional', 'unassessed'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Saved
                  <select
                    value={filters.saved ?? ''}
                    onChange={(event) => change('saved', event.target.value)}
                  >
                    <option value="">All</option>
                    <option>saved</option>
                    <option>unsaved</option>
                  </select>
                </label>
                <label>
                  Sort
                  <select
                    value={filters.sort ?? 'match'}
                    onChange={(event) => change('sort', event.target.value)}
                  >
                    {['match', 'score', 'newest', 'type'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button onClick={() => setFilters({})}>Reset filters</button>
              <p aria-live="polite">
                {items.length} of {all.length} entities
              </p>
            </section>
            {local && result && tab === 'Search' && (
              <div className="actions">
                <button
                  disabled={!selected.length}
                  onClick={() => {
                    void action(() => save(selected, 'manual'));
                  }}
                >
                  Save selected ({selected.length})
                </button>
                <button
                  disabled={!eligible.length}
                  onClick={() => {
                    void action(() =>
                      save(
                        eligible.map((item) => item.entity.id),
                        'eligible',
                      ),
                    );
                  }}
                >
                  Save eligible remaining in filtered results ({eligible.length})
                </button>
                <button
                  disabled={!selected.length}
                  onClick={() => {
                    void action(async () => {
                      await api('dismiss', { ids: selected, dismissed: true });
                      setMessage('Selected identities dismissed from automatic saving.');
                    });
                  }}
                >
                  Dismiss selected
                </button>
                <button
                  disabled={!selected.length}
                  onClick={() => {
                    void action(async () => {
                      await api('dismiss', { ids: selected, dismissed: false });
                      setMessage('Dismissals reset.');
                    });
                  }}
                >
                  Reset dismissals
                </button>
              </div>
            )}
            {compared.length === 2 && (
              <section aria-label="Compare entities">
                <h2>Compare</h2>
                <div className="entity-grid">
                  {compared.map((item) => (
                    <article key={item.entity.id}>
                      <h3>{item.entity.name}</h3>
                      <p>{item.match.reason}</p>
                      <p>
                        Signal {item.entity.assessment.score ?? 'unknown'}; missing:{' '}
                        {item.entity.assessment.missing.join(', ') || 'all features observed'}
                      </p>
                      <ul>
                        {item.entity.limits.map((limit) => (
                          <li key={limit}>{limit}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section aria-label="Entity results" className="entity-grid">
              {items.map((item) => (
                <article className="entity-card" key={item.entity.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.entity.id)}
                      onChange={() => toggle(item.entity.id)}
                    />
                    Select {item.entity.name}
                  </label>
                  <h2>
                    <a href={item.entity.uri} rel="noreferrer">
                      {item.entity.name}
                    </a>
                  </h2>
                  <p>{item.entity.description}</p>
                  <p>
                    {item.entity.kind} · Signal {item.entity.assessment.score ?? 'unknown'} ·{' '}
                    {item.match.level} · {saved.has(item.entity.id) ? 'Saved' : 'Unsaved'}
                  </p>
                  <p>{item.match.reason}</p>
                  <details>
                    <summary>Score, limits and sources</summary>
                    <p>
                      {item.entity.assessment.policy}: evidence strength, not probability.{' '}
                      {Math.round(item.entity.assessment.coverage * 100)}% feature coverage.
                    </p>
                    <dl>
                      {Object.entries(item.entity.assessment.features).map(([name, feature]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>
                            {feature.contribution.toFixed(1)} points · {feature.state}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      Risk adjustment: −{item.entity.assessment.risk}. Missing:{' '}
                      {item.entity.assessment.missing.join(', ') || 'none'}
                    </p>
                    <ul>
                      {item.entity.limits.map((limit) => (
                        <li key={limit}>{limit}</li>
                      ))}
                    </ul>
                    <details>
                      <summary>Observation inputs ({item.entity.observations.length})</summary>
                      <p>
                        Model judgments are fallible. A matched span checks the quoted text, not
                        factual entailment.
                      </p>
                      <ul>
                        {item.entity.observations.map((observation) => (
                          <li key={observation.id}>
                            <strong>
                              {observation.feature}: {observation.indicator}
                            </strong>
                            {' · '}
                            {observation.status}
                            {' · '}
                            {observation.verified ? 'matched span' : 'unmatched span'}
                            {!activeObservations(item.entity, item.entity.assessment.policy).some(
                              (active) => active.id === observation.id,
                            ) && ' · inactive historical input'}
                            <p>{observation.statement}</p>
                            <q>{observation.quote}</q>
                            {' · '}
                            <a href={`#source-${item.entity.id}-${observation.evidenceId}`}>
                              Source:{' '}
                              {
                                item.entity.evidence.find(
                                  (source) => source.id === observation.evidenceId,
                                )?.title
                              }
                            </a>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <ul>
                      {item.entity.evidence.map((source) => (
                        <li key={source.id} id={`source-${item.entity.id}-${source.id}`}>
                          {source.state === 'fetched' ? (
                            <a href={source.uri} rel="noreferrer">
                              {source.title}
                            </a>
                          ) : (
                            <span>
                              {source.title} ({source.uri})
                            </span>
                          )}{' '}
                          · {source.family} · {source.state}
                          <p>{source.excerpt || source.reason || 'No verified span.'}</p>
                          <small>
                            Publication: {source.publishedAt ?? 'unknown'}; fetched:{' '}
                            {source.fetchedAt}
                            {item.entity.currentChecks?.[source.uri] &&
                              `; last successful check: ${item.entity.currentChecks[source.uri]}`}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {local && tab === 'Corpus' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        void action(() => start(item.entity.id));
                      }}
                    >
                      Refresh saved
                    </button>
                  )}
                </article>
              ))}
            </section>
            {!items.length && (
              <p>
                No entities in this view.{' '}
                {tab === 'Search'
                  ? 'Start a search or reset filters; unknown scores are retained.'
                  : 'Save an acquired result to add an entity.'}
              </p>
            )}
            {result && tab === 'Search' && (
              <>
                <details>
                  <summary>Source coverage and gaps</summary>
                  <ul>
                    {result.coverage.map((channel) => (
                      <li key={channel.channel}>
                        {channel.channel}: {channel.state} ({channel.searches}) — {channel.reason}
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {result.gaps.map((gap, index) => (
                      <li key={index}>{gap}</li>
                    ))}
                  </ul>
                  <p>
                    {result.usage.searches} tool calls; {result.usage.documents} fetched documents;{' '}
                    {(result.usage.elapsedMs / 1000).toFixed(1)} seconds. Subscription cost unknown.
                  </p>
                </details>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action(async () => {
                      setAnswerBusy(true);
                      try {
                        setAnswer(
                          await api('followup', {
                            runId: result.runId,
                            ids: selected,
                            question: followup,
                          }),
                        );
                      } finally {
                        setAnswerBusy(false);
                      }
                    });
                  }}
                >
                  <label>
                    Ask the frozen evidence
                    <textarea
                      value={followup}
                      required
                      onChange={(event) => setFollowup(event.target.value)}
                    />
                  </label>
                  <button disabled={answerBusy || busy}>
                    {answerBusy ? 'Reading frozen evidence…' : 'Answer from evidence'}
                  </button>
                  <p>
                    A bounded no-web AI call uses only this run and selected items. Search further
                    explicitly to acquire new evidence.
                  </p>
                </form>
                {answer && (
                  <section>
                    <p>{answer.answer}</p>
                    <ul>
                      {answer.statements.map((statement, index) => (
                        <li key={index}>
                          {statement.statement}{' '}
                          <small>
                            {statement.entityId} / {statement.evidenceId}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <a
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result))}`}
                  download="signal-search.json"
                >
                  Download JSON
                </a>
              </>
            )}
          </>
        )}
      </Container>
      {tab === 'Corpus' && legacyCorpus}
      <nav className="workbench-footer" aria-label="Data downloads">
        <p>
          {local
            ? 'Saving is local. Commit and push reviewed corpus changes separately to publish.'
            : 'This static public view can browse and compare saved knowledge. Run the local workbench for AI search, saving and discovery.'}
        </p>
        <a href={`${base}entities.json`}>Native entity download</a>
      </nav>
    </>
  );
}
