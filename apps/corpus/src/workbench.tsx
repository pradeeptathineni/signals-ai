import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import {
  filterSearchItems,
  sourceHost,
  saveDecision,
  activeObservations,
  type SearchFilters,
} from '../../../packages/domain/src/search-score.js';
import { budgets, kinds, channels } from '../../../packages/domain/src/search-vocabulary.js';
import type {
  SearchItem,
  SearchResult,
  ProvisionalLead,
} from '../../../packages/domain/src/search-contract.js';
import type { SearchSettings } from '../../../packages/corpus/src/search-settings.js';
import type { StoredEntity } from '../../../packages/corpus/src/search-store.js';
import type { QueryBatch } from '../../../packages/corpus/src/search-query-list.js';
import type { DirectSearchResult } from '../../../packages/corpus/src/search-direct.js';
import { PersonalEditor } from './workbench-personal.js';
import { SourceManager } from './workbench-sources.js';
import type { PersonalState } from '../../../packages/domain/src/search-priority.js';
import type { InboxEntry } from '../../../packages/corpus/src/search-inbox.js';
import type { runDueOnce } from '../../../packages/corpus/src/search-scheduler.js';
import { rejectedNativeLeads } from '../../../packages/domain/src/search-rejected.js';
import { ScoreView } from './candidate-views.js';

const local = (window as Window & { __SIGNALS_LOCAL__?: boolean }).__SIGNALS_LOCAL__ === true;
const base = import.meta.env.BASE_URL;
const settingsTabs = ['Settings', 'Interests', 'Sources', 'Jobs'];
export function Workbench({
  legacyCorpus,
  embedded = false,
  requestedTab,
  question,
  reopenRun,
  onCompleted,
  onOpenResult,
  providedContext,
  providedContextKey,
  providedContextLabel,
  providedProfile,
  monitorRun,
}: {
  legacyCorpus: ReactNode;
  embedded?: boolean;
  requestedTab?: string;
  question?: string;
  reopenRun?: string;
  onCompleted?: (runId: string) => void;
  onOpenResult?: (runId: string, restoredQuery?: string) => void;
  providedContext?: string;
  providedContextKey?: string;
  providedContextLabel?: string;
  providedProfile?: 'quick' | 'wide';
  monitorRun?: string;
}) {
  const [tab, setTab] = useState(local ? 'Search' : 'Corpus');
  const [token, setToken] = useState(''),
    [ready, setReady] = useState('Checking runner…');
  const [settings, setSettings] = useState<SearchSettings | null>(null);
  const [providers, setProviders] = useState<
    { provider: string; configured: boolean; state: string }[]
  >([]);
  const [query, setQuery] = useState(''),
    [result, setResult] = useState<SearchResult | null>(null);
  const [earlyBrief, setEarlyBrief] = useState<SearchResult['brief']>();
  const [captureUrl, setCaptureUrl] = useState('');
  const [manualContext, setManualContext] = useState('');
  const [editedContext, setEditedContext] = useState<{
    key: string | undefined;
    text: string;
    label: string;
  } | null>(null);
  const [heldContexts, setHeldContexts] = useState<
    { key: string | undefined; text: string; label: string }[]
  >([]);
  const context =
    providedContext === undefined
      ? manualContext
      : editedContext && editedContext.key === providedContextKey
        ? editedContext.text
        : providedContext;
  function setContext(text: string) {
    if (providedContext !== undefined)
      setEditedContext({
        key: providedContextKey,
        text,
        label: providedContextLabel ?? 'An approved project question',
      });
    else setManualContext(text);
  }
  useEffect(() => {
    if (editedContext && editedContext.key !== providedContextKey) {
      // An edited project preview stays held; withdrawal never promotes it into general egress.
      setHeldContexts((current) => [
        ...current.filter((draft) => draft.key !== editedContext.key),
        editedContext,
      ]);
      setEditedContext(null);
    }
  }, [editedContext, providedContextKey]);
  const [groupPlan, setGroupPlan] = useState('[]');
  const [personal, setPersonal] = useState<Record<string, PersonalState>>({});
  const [inbox, setInbox] = useState<InboxEntry[]>([]);
  const [preview, setPreview] = useState<{
    statement: string;
    quote: string;
    title: string;
    uri: string;
  } | null>(null);
  const evidenceDialog = useRef<HTMLDialogElement>(null);
  const reopening = useRef(false);
  useEffect(() => {
    if (preview && evidenceDialog.current && !evidenceDialog.current.open)
      evidenceDialog.current.showModal();
  }, [preview]);
  const [run, setRun] = useState(''),
    [events, setEvents] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<QueryBatch | null>(null);
  const [interestFilter, setInterestFilter] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceResult, setSourceResult] = useState<DirectSearchResult | null>(null);
  const [provisional, setProvisional] = useState<ProvisionalLead[]>([]);
  const [batchHistory, setBatchHistory] = useState<
    { id: string; createdAt: string; total: number; pending: number; uncertain: number }[]
  >([]);
  const [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [corpus, setCorpus] = useState<(StoredEntity & { destination: 'public' | 'private' })[]>(
      [],
    ),
    [saved, setSaved] = useState(new Set<string>());
  const [selected, setSelected] = useState<string[]>([]),
    [filters, setFilters] = useState<SearchFilters>({});
  const [corpusSelection, setCorpusSelection] = useState<string[]>([]);
  const [followup, setFollowup] = useState(''),
    [answer, setAnswer] = useState<null | {
      answer: string;
      statements: {
        entityId: string;
        evidenceId: string;
        observationId: string;
        statement: string;
        quote: string;
      }[];
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
  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
    if (requestedTab === 'Jobs') void action(loadHistory);
  }, [requestedTab]);
  useEffect(() => {
    if (question !== undefined) setQuery(question);
  }, [question]);
  useEffect(() => {
    if (reopenRun) void action(() => openRun(reopenRun));
  }, [reopenRun]);
  useEffect(() => {
    if (monitorRun) {
      setRun(monitorRun);
      setBusy(true);
      setTab('Search');
      setResult(null);
      setEarlyBrief(undefined);
      setEvents(['Opening active research…']);
    }
  }, [monitorRun]);
  useEffect(() => {
    if (result && onCompleted) onCompleted(result.runId);
  }, [result?.runId]);
  async function api<T>(route: string, body?: unknown): Promise<T> {
    let requestToken = token;
    if (body !== undefined && !requestToken) {
      const session = await fetch(`${base}__signals/api/session`).then(
        (response) => response.json() as Promise<{ token: string }>,
      );
      requestToken = session.token;
      setToken(requestToken);
    }
    const response = await fetch(
      `${base}__signals/api/${route}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-signals-token': requestToken },
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
    const scoped = records.map((record) => ({ ...record, destination: 'public' as const }));
    const privateRecords = local ? await api<StoredEntity[]>('private-corpus') : [];
    const combined = [
      ...scoped,
      ...privateRecords.map((record) => ({ ...record, destination: 'private' as const })),
    ];
    setCorpus(combined);
    setSaved(new Set(combined.map((record) => record.entity.id)));
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
              providers: { provider: string; configured: boolean; state: string }[];
            }>,
        )
        .then((session) => {
          setToken(session.token);
          setProviders(session.providers);
          setReady(
            `${session.capability.available ? 'Ready' : 'Unavailable'}: ${session.capability.runner}. ${session.capability.reason}`,
          );
        })
        .catch(() => setReady('Local bridge unavailable.'));
      void api<SearchSettings>('settings')
        .then((value) => {
          setSettings(value);
          setGroupPlan(JSON.stringify(value.acquisitionGroups ?? [], null, 2));
        })
        .catch((failure: unknown) => setError(String(failure)));
      void api<Record<string, PersonalState>>('personal')
        .then(setPersonal)
        .catch((failure: unknown) => setError(String(failure)));
      void api<InboxEntry[]>('inbox')
        .then(setInbox)
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
          provisional: ProvisionalLead[];
          result: SearchResult | null;
          error: string | null;
          batch: QueryBatch | null;
          due?: Awaited<ReturnType<typeof runDueOnce>>;
          brief?: SearchResult['brief'] | null;
        }>(`runs/${run}`);
        if (state.error) throw new Error(state.error);
        if (stopped) return;
        setEvents(state.events);
        if (state.brief) setEarlyBrief(state.brief);
        setProvisional(state.provisional ?? []);
        if (state.due) {
          setBusy(false);
          setHistory(JSON.stringify(state.due, null, 2));
          setMessage(
            state.due.enabled
              ? `Due activation finished; ${state.due.jobs.length} jobs recorded. Inspect statuses below. Recurrence stays as configured.`
              : 'Recurring research modes are off. No due jobs activated.',
          );
          void reloadCorpus();
        }
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
          if (reopening.current) {
            setQuery(state.result.query);
            onOpenResult?.(state.result.runId, state.result.query);
            reopening.current = false;
          }
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
  const corpusDestinations = useMemo(
    () => new Map(corpus.map((record) => [record.entity, record.destination])),
    [corpus],
  );
  const all = tab === 'Search' ? (result?.items ?? []) : corpusItems;
  const items = useMemo(() => filterSearchItems(all, filters, saved), [all, filters, saved]);
  const selection = tab === 'Corpus' ? corpusSelection : selected;
  const compared = all.filter((item) => selection.includes(entityAnchor(item.entity))).slice(0, 2);
  function entityAnchor(entity: SearchItem['entity']) {
    return `${tab === 'Corpus' ? `${corpusDestinations.get(entity)}-` : ''}${entity.id}`;
  }
  function change(key: keyof SearchFilters, value: string | number | undefined) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function toggle(id: string) {
    const update = tab === 'Corpus' ? setCorpusSelection : setSelected;
    update((current) =>
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
    captureUrls?: string[],
    destination?: 'public' | 'private',
  ) {
    reopening.current = false;
    setSourceResult(null);
    setProvisional([]);
    const started = await api<{ id: string }>(
      refreshId ? 'refresh' : captureUrls ? 'capture' : 'search',
      refreshId
        ? { id: refreshId, destination }
        : {
            query: question,
            context,
            captureUrls,
            supplementalSites,
            profile: providedProfile ?? settings?.profile ?? 'wide',
            save: 'never',
            cache: 'private',
          },
    );
    setRun(started.id);
    setBusy(true);
    setResult(null);
    setEarlyBrief(undefined);
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
  async function openRun(runId: string) {
    const opened = await api<{ id: string }>('history/open', { runId });
    onOpenResult?.(runId);
    setRun(opened.id);
    reopening.current = true;
    setBusy(true);
    setResult(null);
    setEarlyBrief(undefined);
    setTab('Search');
    setSelected([]);
    setEvents(['Opening frozen evidence…']);
  }
  async function loadHistory() {
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
  }
  async function askEvidence(question = followup) {
    setAnswerBusy(true);
    try {
      if (tab === 'Corpus') {
        const chosen = corpus.filter((record) =>
          corpusSelection.includes(`${record.destination}-${record.entity.id}`),
        );
        setAnswer(
          await api('followup', {
            ids: chosen.map((record) => record.entity.id),
            destinations: chosen.map((record) => record.destination),
            question,
          }),
        );
      } else if (result) {
        setAnswer(await api('followup', { runId: result.runId, ids: selected, question }));
      }
    } finally {
      setAnswerBusy(false);
    }
  }
  const Container = embedded || tab === 'Corpus' ? 'section' : 'main';
  return (
    <>
      {!embedded && (
        <a className="skip-link" href={tab === 'Corpus' ? '#results' : '#workbench-content'}>
          Skip to {tab === 'Corpus' ? 'findings' : 'search'}
        </a>
      )}
      {!embedded && (
        <nav className="workbench-nav" aria-label="Signals destinations">
          <a href={base} className="brand">
            Signals
          </a>
          {(local
            ? ['Search', 'Inbox', 'Corpus', 'Interests', 'Sources', 'Jobs', 'Settings']
            : ['Corpus']
          ).map((destination) => (
            <button
              key={destination}
              aria-current={tab === destination ? 'page' : undefined}
              onClick={() => {
                setTab(destination);
                setFilters({});
                setSelected([]);
                setAnswer(null);
                if (destination === 'Jobs') void action(loadHistory);
              }}
            >
              {destination === 'Search' ? 'Search Signals' : destination}
            </button>
          ))}
          <span>{local ? 'Local workbench' : 'Public corpus · read only'}</span>
        </nav>
      )}
      <Container id="workbench-content" className="workbench" aria-label="Native Signals entities">
        <dialog ref={evidenceDialog} aria-label="Evidence preview" onClose={() => setPreview(null)}>
          {preview && (
            <>
              <h2>Supporting passage</h2>
              <p>{preview.statement}</p>
              <blockquote>{preview.quote}</blockquote>
              <a href={preview.uri} target="_blank" rel="noreferrer">
                {preview.title}
              </a>
              <p>A matched passage records text occurrence; the semantic judgment may be wrong.</p>
              <button onClick={() => evidenceDialog.current?.close()}>
                Close evidence preview
              </button>
            </>
          )}
        </dialog>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {settingsTabs.includes(tab) && settings ? (
          <section aria-labelledby="settings-title">
            <h1 id="settings-title">{tab}</h1>
            {tab === 'Jobs' && busy && (
              <section aria-label="Active job">
                <h2>Activation in progress</h2>
                <ol aria-live="polite">
                  {events.slice(-8).map((event, index) => (
                    <li key={index}>{event}</li>
                  ))}
                </ol>
                <button
                  onClick={() =>
                    void action(async () => {
                      await api(`cancel/${run}`, {});
                      setMessage('Cancellation requested. Completed work remains retained.');
                    })
                  }
                >
                  Cancel active job
                </button>
              </section>
            )}
            <div hidden={tab !== 'Settings'}>
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
                <fieldset>
                  <legend>Research intent</legend>
                  <button
                    onClick={() =>
                      setSettings({
                        ...settings,
                        profile: 'quick',
                        route: 'native',
                        model: 'gpt-6.1-sol',
                        effort: 'low',
                        groundedReview: false,
                      })
                    }
                  >
                    Fast
                  </button>
                  <button
                    onClick={() =>
                      setSettings({
                        ...settings,
                        profile: 'wide',
                        route: 'native',
                        model: 'gpt-6.1-sol',
                        effort: 'low',
                        groundedReview: false,
                      })
                    }
                  >
                    Balanced
                  </button>
                  <button
                    onClick={() =>
                      setSettings({
                        ...settings,
                        profile: 'wide',
                        route: 'native',
                        model: 'gpt-6.1-sol',
                        effort: 'high',
                        groundedReview: false,
                      })
                    }
                  >
                    Deep
                  </button>
                  <p>
                    Fast allows {budgets.quick.searches} searches, {budgets.quick.documents} reads
                    and {budgets.quick.seconds} seconds. Balanced allows {budgets.wide.searches}{' '}
                    searches, {budgets.wide.documents} reads and {budgets.wide.seconds} seconds.
                    Both use one native research session with Sol low. Deep uses the same native
                    session with Sol high. Each may return partial findings. Save settings to apply
                    this selection.
                  </p>
                </fieldset>
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
            </div>
            <div hidden={tab !== 'Sources'}>
              <fieldset>
                <legend>Source families</legend>
                <p>
                  Search through the host's available public tools. Disabled or inaccessible
                  families remain explicit gaps.
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
              <SourceManager
                settings={settings}
                onChange={setSettings}
                scan={() => api('source-scan', {})}
              />
              <details>
                <summary>Configured acquisition and extraction providers</summary>
                <p>
                  Optional providers are selected in private .signals/providers.json. Configuration
                  is separate from a successful runtime probe; failures appear as research gaps.
                </p>
                <ul>
                  {providers.map((provider) => (
                    <li key={provider.provider}>
                      {provider.provider}: {provider.state}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            <div hidden={tab !== 'Settings'}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.promisingInbox?.enabled ?? false}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      promisingInbox: {
                        enabled: event.target.checked,
                        minimumPriority: settings.promisingInbox?.minimumPriority ?? 70,
                      },
                    })
                  }
                />
                Keep promising results in a private inbox
              </label>
              <label>
                Minimum contextual priority for inbox
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.promisingInbox?.minimumPriority ?? 70}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      promisingInbox: {
                        enabled: settings.promisingInbox?.enabled ?? false,
                        minimumPriority: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <div hidden={tab !== 'Sources'}>
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
            </div>
            <div hidden={tab !== 'Interests' && tab !== 'Jobs'}>
              <p>
                Enabling a mode permits recurring inference while the local timer runs. Runner:
                Codex; UTC; one job at a time; {JSON.stringify(budgets[settings.profile])};
                threshold {settings.threshold}; {settings.retentionDays} days temporary retention;{' '}
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
              <label>
                Interests per activation
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.batchSize}
                  onChange={(event) =>
                    setSettings({ ...settings, batchSize: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            <div hidden={tab !== 'Interests'}>
              <h3>Saved questions</h3>
              <label>
                Find saved questions
                <input
                  value={interestFilter}
                  onChange={(event) => setInterestFilter(event.target.value)}
                />
              </label>
              <p>
                {settings.queries.length} saved questions. Showing up to 20 matching questions;
                filter by name or wording to edit more.
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
                      Context and constraints for {entry.id}
                      <textarea
                        maxLength={5000}
                        value={entry.context ?? ''}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            queries: settings.queries.map((value, i) =>
                              i === index ? { ...value, context: event.target.value } : value,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={entry.shareAcquisition !== false}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            queries: settings.queries.map((value, i) =>
                              i === index
                                ? { ...value, shareAcquisition: event.target.checked }
                                : value,
                            ),
                          })
                        }
                      />
                      Allow shared source acquisition for {entry.id}
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
              <details>
                <summary>Shared acquisition plan</summary>
                <p>
                  A native agent may propose compatible interest groups. Paste its plan and inspect
                  the query, members and reason before saving. Groups share source acquisition only;
                  each interest keeps separate reasoning and delivery. Unchecked interests opt out.
                </p>
                <label>
                  Native-proposed acquisition groups (JSON)
                  <textarea
                    aria-label="Native-proposed acquisition groups (JSON)"
                    spellCheck={false}
                    value={groupPlan}
                    onChange={(event) => setGroupPlan(event.target.value)}
                  />
                </label>
                <p>
                  Use an array of groups with id, members (interest IDs), query, reason and
                  proposedBy: "native". Empty [] disables grouping. Saving validates the complete
                  plan and compatible scopes are checked during activation.
                </p>
              </details>
            </div>
            <div className="actions">
              <button
                onClick={() => {
                  void action(async () => {
                    let acquisitionGroups: unknown;
                    try {
                      acquisitionGroups = JSON.parse(groupPlan);
                    } catch {
                      throw new Error(
                        'Shared acquisition plan must be valid JSON. Your edits are still here.',
                      );
                    }
                    const validated = await api<SearchSettings>('settings', {
                      ...settings,
                      acquisitionGroups,
                      route: 'native',
                      groundedReview: false,
                      extractionModel: '',
                      extractionEffort: '',
                    });
                    setSettings(validated);
                    setMessage(
                      'Settings saved. Start npm run discovery -- timer to run enabled modes while the laptop is awake.',
                    );
                  });
                }}
              >
                Save settings
              </button>
              <div hidden={tab !== 'Jobs'}>
                <button
                  disabled={busy}
                  onClick={() => {
                    void action(async () => {
                      const started = await api<{ id: string }>('run-due', {});
                      setRun(started.id);
                      setEvents(['Starting finite due-interest and maintenance activation…']);
                      setBusy(true);
                    });
                  }}
                >
                  Run due once
                </button>
              </div>
              <div hidden={tab !== 'Interests' && tab !== 'Jobs'}>
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
                      setTab('Jobs');
                    });
                  }}
                >
                  Run matching enabled interests once
                </button>
                <p>
                  One-shot research runs up to {settings.batchSize} interests per activation and
                  saves eligible matches. It does not enable recurring discovery.
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
                          const started = await api<{ id: string }>('run-list', {
                            resume: batch.id,
                          });
                          setRun(started.id);
                          setBusy(true);
                          setTab('Jobs');
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
                                    void action(() => openRun(job.runId!));
                                  }}
                                >
                                  Review {job.query}
                                </button>
                              )}
                            </li>
                          ))}
                      </ul>
                    </details>
                    {batch.acquisitionPlan && batch.acquisitionPlan.length > 0 && (
                      <details>
                        <summary>Applied shared acquisition plan</summary>
                        <ul>
                          {batch.acquisitionPlan.map((group) => (
                            <li key={group.id}>
                              <strong>{group.query}</strong>
                              <p>{group.reason}</p>
                              <p>Interests: {group.members.join(', ')}.</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
              <div hidden={tab !== 'Jobs'}>
                <button
                  onClick={() => {
                    void action(async () => {
                      await loadHistory();
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
            </div>
            <div hidden={tab !== 'Jobs'}>
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
                    Private query and save provenance. Public entities keep reusable evidence;
                    saving and publication are separate.
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
                          void action(() => openRun(recent.runId));
                        }}
                      >
                        Open result
                      </button>
                    </article>
                  ))}
                </section>
              )}
            </div>
          </section>
        ) : settingsTabs.includes(tab) ? (
          <p role="status">Loading settings…</p>
        ) : tab === 'Inbox' ? (
          <section aria-labelledby="inbox-title">
            <div className="intro">
              <h1 id="inbox-title">Capture & inbox</h1>
              <p>
                Keep promising leads privately, inspect their evidence, and choose what to save.
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void action(() =>
                  start(
                    undefined,
                    'Capture this resource and describe its supported uses and limits.',
                    undefined,
                    undefined,
                    [captureUrl],
                  ),
                );
              }}
            >
              <label>
                Capture a public URL
                <input
                  type="url"
                  required
                  value={captureUrl}
                  onChange={(event) => setCaptureUrl(event.target.value)}
                  placeholder="https://…"
                />
              </label>
              <button disabled={busy || !captureUrl.trim()}>Capture URL</button>
            </form>
            {inbox.length === 0 ? (
              <p>No pending leads. Capture a URL or keep selected search results in your inbox.</p>
            ) : (
              <ul className="inbox-list">
                {inbox.map((entry) => (
                  <li key={entry.id}>
                    <a href={entry.uri} rel="noreferrer">
                      {entry.name}
                    </a>
                    <div className="actions">
                      <button onClick={() => void action(() => openRun(entry.runId))}>
                        Reopen {entry.name}
                      </button>
                      <button
                        onClick={() =>
                          void action(async () => {
                            setInbox(await api<InboxEntry[]>('inbox', { remove: [entry.id] }));
                            setMessage(
                              'Lead removed from inbox. Its original research and saved evidence remain available.',
                            );
                          })
                        }
                      >
                        Remove {entry.name} from inbox
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            {!embedded && (
              <section className="intro">
                <h1>{tab === 'Search' ? 'Search Signals' : 'Your saved knowledge.'}</h1>
                <p>
                  {tab === 'Search'
                    ? 'Find worthwhile possibilities for your question, with a practical brief and evidence you can inspect.'
                    : 'Search, compare and follow up on retained findings. Filtering works without AI.'}
                </p>
              </section>
            )}
            {tab === 'Search' && (
              <>
                {inbox.length > 0 && (
                  <button onClick={() => setTab('Inbox')}>Promising inbox ({inbox.length})</button>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action(() => start(undefined, query, undefined, context));
                  }}
                >
                  <label hidden={embedded}>
                    Research question
                    <textarea
                      required={!embedded}
                      maxLength={2000}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="What do you want to understand or find?"
                    />
                  </label>
                  <details>
                    <summary>Project context and constraints</summary>
                    <label>
                      Context for this question
                      <textarea
                        aria-label="Context for this question"
                        maxLength={4000}
                        value={context}
                        onChange={(event) => setContext(event.target.value)}
                        placeholder="What should these findings help you do? Include requirements, exclusions and operating constraints."
                      />
                    </label>
                    <p>This context stays in private research history.</p>
                    {heldContexts.length > 0 && (
                      <section aria-label="Held project drafts">
                        <p>
                          Edited project drafts are retained in this browser session for inspection.
                          They are not included in current or general research requests.
                        </p>
                        {heldContexts.map((draft, index) => (
                          <details key={draft.key ?? index}>
                            <summary>Held project draft: {draft.label}</summary>
                            <pre>{draft.text}</pre>
                          </details>
                        ))}
                      </section>
                    )}
                  </details>
                  <details className="desk-research-options" open={Boolean(providedContext)}>
                    <summary>Research options</summary>
                    <p>{ready}</p>
                    <label>
                      Capture a public URL
                      <input
                        type="url"
                        value={captureUrl}
                        onChange={(event) => setCaptureUrl(event.target.value)}
                        placeholder="https://…"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || sourceBusy || !token || !captureUrl.trim()}
                      onClick={() =>
                        void action(() =>
                          start(
                            undefined,
                            query.trim() ||
                              'Capture this resource and describe its supported uses and limits.',
                            undefined,
                            context,
                            [captureUrl],
                          ),
                        )
                      }
                    >
                      Capture URL
                    </button>
                    <p>
                      {providedProfile ?? settings?.profile ?? 'wide'} budget:{' '}
                      {JSON.stringify(budgets[providedProfile ?? settings?.profile ?? 'wide'])}.
                      Review before saving; results retained privately.
                    </p>
                  </details>
                  <div className="actions">
                    <button disabled={busy || sourceBusy || !token || !query.trim()} type="submit">
                      {embedded ? 'Start online research' : 'Start search'}
                    </button>
                    <button
                      disabled={busy || sourceBusy || !result}
                      type="button"
                      onClick={() => {
                        void action(() => start(undefined, query, undefined, context));
                      }}
                    >
                      Search further
                    </button>
                    <button
                      disabled={busy || sourceBusy || !token || !query.trim()}
                      type="button"
                      onClick={() => {
                        void action(async () => {
                          setSourceBusy(true);
                          setSourceResult(null);
                          try {
                            setSourceResult(await api<DirectSearchResult>('sources', { query }));
                          } finally {
                            setSourceBusy(false);
                          }
                        });
                      }}
                    >
                      {sourceBusy ? 'Finding sources…' : 'Find sources without AI'}
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
              </>
            )}
            {tab === 'Search' && sourceResult && (
              <section aria-label="Source links">
                <h2>Source links for {sourceResult.query}</h2>
                <p>
                  Ranked links from GitHub, Hacker News and Wikipedia. No AI calls or saved
                  assessments. Start search to review and score candidates.
                </p>
                <ol>
                  {sourceResult.hits.map((hit) => (
                    <li key={`${hit.provider}:${hit.uri}`}>
                      <a href={hit.uri} target="_blank" rel="noreferrer">
                        {hit.title}
                      </a>
                      <p>
                        {hit.provider} · rank {hit.rank}
                      </p>
                      <p>{hit.summary}</p>
                    </li>
                  ))}
                </ol>
                {sourceResult.gaps.length > 0 && (
                  <details>
                    <summary>Source access gaps</summary>
                    <ul>
                      {sourceResult.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
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
            {tab === 'Search' && result?.interpretation && (
              <details className="desk-interpretation">
                <summary>How your question was understood</summary>
                <p>{result.interpretation.need}</p>
                <p>
                  Resource types: {result.interpretation.resourceTypes.join(', ') || 'Unspecified'}.
                  Time window: {result.interpretation.timeWindow ?? 'Unspecified'}.
                </p>
                <ul>
                  {result.interpretation.constraints.map((constraint) => (
                    <li key={constraint.text}>
                      {constraint.text} · {constraint.required ? 'required' : 'preferred'}
                    </li>
                  ))}
                </ul>
                <p>
                  Edit your question and start again to correct this. The earlier result is kept.
                </p>
              </details>
            )}
            {tab === 'Search' && result?.provisionalLeads && result.provisionalLeads.length > 0 && (
              <section aria-label="Leads with metadata gaps">
                <h2>Leads with metadata gaps</h2>
                <p>
                  These leads remain unassessed. Save a link privately now; inspect its evidence
                  when useful.
                </p>
                <ul>
                  {result.provisionalLeads.map((lead, index) => (
                    <li key={index}>
                      <strong>{lead.name}</strong>
                      <p>{lead.description}</p>
                      <p>{lead.uri}</p>
                      <p>{lead.limits.join(' ')}</p>
                      {local && (
                        <button
                          onClick={() =>
                            void action(async () => {
                              await api('save-lead', { runId: result.runId, uri: lead.uri });
                              setMessage(`${lead.name} saved privately as an unassessed lead.`);
                              onCompleted?.(result.runId);
                            })
                          }
                        >
                          Save lead privately
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="controls" aria-label="Entity filters">
              {tab === 'Search' &&
                result?.status === 'failed' &&
                rejectedNativeLeads(result.usage.providerUsage).length > 0 && (
                  <section aria-label="Unvalidated leads from rejected response">
                    <h2>Leads retained from a rejected response</h2>
                    <p>
                      The response failed validation. These names and descriptions are unverified;
                      they are not discovered successes and cannot be saved from this view. The
                      original response remains available in this result.
                    </p>
                    <ul>
                      {rejectedNativeLeads(result.usage.providerUsage).map((lead, index) => (
                        <li key={index}>
                          <strong>{lead.name}</strong>
                          <p>{lead.description}</p>
                          <p>{lead.uri}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              {tab === 'Search' && busy && provisional.length > 0 && (
                <section aria-label="Provisional research leads">
                  <h2>Leads awaiting evidence verification</h2>
                  <p>
                    These are provisional model findings. Saving and admission become available
                    after verification.
                  </p>
                  <ul>
                    {provisional.map((lead) => (
                      <li key={lead.uri}>
                        <strong>{lead.name}</strong>: {lead.description}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <details open={tab === 'Corpus'}>
                <summary>Filter and sort findings</summary>
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
                          all.flatMap((item) =>
                            item.entity.evidence.map((source) => source.family),
                          ),
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
                        <option key={value} value={value}>
                          {value === 'newest' ? 'Assessment time' : value}
                        </option>
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
                      {['priority', 'match', 'score', 'newest', 'type'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button onClick={() => setFilters({})}>Reset filters</button>
              </details>
              <p aria-live="polite">
                {items.length} of {all.length} entities
              </p>
            </section>
            {local && result && tab === 'Search' && (
              <details className="desk-bulk-actions" open={selected.length > 0}>
                <summary>Save and organize selected items</summary>
                <div className="actions">
                  <button
                    disabled={!selected.length}
                    onClick={() =>
                      void action(async () => {
                        setInbox(
                          await api<InboxEntry[]>('inbox', { runId: result.runId, ids: selected }),
                        );
                        setMessage('Selected candidates added to the private promising inbox.');
                      })
                    }
                  >
                    Keep selected in inbox
                  </button>
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
              </details>
            )}
            {compared.length === 2 && (
              <section aria-label="Compare entities">
                <h2>Compare</h2>
                <div className="entity-grid">
                  {compared.map((item) => (
                    <article key={entityAnchor(item.entity)}>
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
                {local && (
                  <button
                    disabled={answerBusy || busy}
                    onClick={() =>
                      void action(() => {
                        const question = `Compare ${compared.map((item) => item.entity.name).join(' and ')} for practical uses, alternatives, trade-offs, evidence gaps and the next action, using retained evidence only.`;
                        setFollowup(question);
                        return askEvidence(question);
                      })
                    }
                  >
                    Explain this comparison from evidence
                  </button>
                )}
              </section>
            )}
            <section aria-label="Entity results" className="entity-grid">
              {items.map((item) => (
                <article
                  className="entity-card"
                  key={`${corpusDestinations.get(item.entity) ?? 'search'}:${item.entity.id}`}
                  id={`entity-${entityAnchor(item.entity)}`}
                >
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={selection.includes(entityAnchor(item.entity))}
                      onChange={() => toggle(entityAnchor(item.entity))}
                    />
                    Select {item.entity.name}
                  </label>
                  <h2>
                    <a href={item.entity.uri} rel="noreferrer">
                      {item.entity.name}
                    </a>
                  </h2>
                  <p className="desk-summary">{item.entity.description}</p>
                  {tab === 'Corpus' && (
                    <p>
                      {corpusDestinations.get(item.entity) === 'private' ? 'Private' : 'Public'}{' '}
                      Corpus
                    </p>
                  )}
                  <p>
                    {item.entity.kind} · {saved.has(item.entity.id) ? 'Saved' : 'Unsaved'}
                  </p>
                  <p className="desk-fit">{item.match.reason}</p>
                  <div className="desk-scoreline">
                    <ScoreView score={item.relevance?.value ?? null} label="Relevance" />
                    <ScoreView score={item.entity.assessment.score} label="Signal" />
                    {item.entity.assessment.score === null && (
                      <span className="desk-assessment-state">
                        {item.entity.assessment.disposition ?? item.entity.assessment.state}
                      </span>
                    )}
                  </div>
                  <details>
                    <summary>Assessment basis</summary>
                    <p className="desk-meta">
                      {item.relevance?.reason ??
                        'Numeric relevance not assessed in this historical result.'}{' '}
                      · {item.entity.assessment.policy} ·{' '}
                      {item.entity.assessment.rubric ?? item.entity.kind}
                    </p>
                  </details>
                  {item.entity.limits[0] && <p className="desk-limit">{item.entity.limits[0]}</p>}
                  {local && tab === 'Search' && (
                    <button
                      disabled={busy || saved.has(item.entity.id)}
                      onClick={() => void action(() => save([item.entity.id], 'manual'))}
                    >
                      {saved.has(item.entity.id) ? 'Saved' : 'Save'}
                    </button>
                  )}
                  {item.entity.assessment.nextVerification && (
                    <p className="desk-fit">
                      Next verification: {item.entity.assessment.nextVerification}
                    </p>
                  )}
                  {item.change && <p>Compared with saved evidence: {item.change}.</p>}
                  {item.priority && (
                    <details aria-label={`Why ${item.entity.name} matters`}>
                      <summary>Contextual usefulness and suggested action</summary>
                      <p>
                        <strong>Suggested next action: {item.priority.action}</strong>
                      </p>
                      <p>{item.priority.reason}</p>
                      {item.priority.proposedAction &&
                        item.priority.proposedAction !== item.priority.action && (
                          <p>
                            Original proposed action: {item.priority.proposedAction}. Held at{' '}
                            {item.priority.action} until defining and cited evidence is grounded;
                            the candidate remains available for inspection.
                          </p>
                        )}
                      <p>
                        {item.priority.novelty}; personal novelty: {item.priority.personalNovelty}.{' '}
                        {item.entity.assessment.score === null
                          ? 'Unassessed candidate'
                          : item.eligible
                            ? 'Eligible for automatic admission'
                            : 'Inspectable candidate; manual review/save available'}
                        .
                      </p>
                      <ul>
                        {item.priority.constraints.map((constraint) => (
                          <li key={constraint}>{constraint}</li>
                        ))}
                      </ul>
                      {(item.priority.relations ?? []).map((relation) => (
                        <p key={relation.uri}>
                          {relation.kind}:{' '}
                          <a
                            href={
                              all.some((other) => other.entity.uri === relation.uri)
                                ? `#entity-${entityAnchor(all.find((other) => other.entity.uri === relation.uri)!.entity)}`
                                : relation.uri
                            }
                            rel="noreferrer"
                          >
                            {relation.reason}
                          </a>
                        </p>
                      ))}
                    </details>
                  )}
                  {item.discovery && (
                    <p>
                      Introduced by {item.discovery.introducedBy} (
                      {item.discovery.provenanceBasis ??
                        'historical model report; unverified mechanism'}
                      )
                      {item.discovery.parentUri && (
                        <>
                          {' '}
                          from{' '}
                          <a href={item.discovery.parentUri} rel="noreferrer">
                            this source
                          </a>{' '}
                          ({item.discovery.linkVerified ? 'outlink matched' : 'outlink unverified'})
                        </>
                      )}
                      .
                    </p>
                  )}
                  {local && (
                    <PersonalEditor
                      name={item.entity.name}
                      value={personal[item.entity.id]}
                      onSave={(value) =>
                        action(async () => {
                          const saved = await api<{ sourceFeedbackError?: boolean }>('personal', {
                            id: item.entity.id,
                            note: value.note,
                            feedback: value.feedback,
                            novelty: value.novelty,
                          });
                          setPersonal((current) => ({ ...current, [item.entity.id]: value }));
                          setMessage(
                            saved.sourceFeedbackError
                              ? 'Private note and feedback saved; source feedback could not be recorded.'
                              : 'Private note and feedback saved.',
                          );
                        })
                      }
                    />
                  )}
                  {local && item.entity.evidence.length > 0 && (
                    <button
                      onClick={() => {
                        if (!settings) return;
                        const source = item.entity.evidence[0]!;
                        const uri = item.discovery?.parentUri ?? source.uri;
                        setSettings({
                          ...settings,
                          followedSources: [
                            ...(settings.followedSources ?? []).filter((s) => s.uri !== uri),
                            { uri, label: source.title, enabled: true, interests: [] },
                          ],
                        });
                        setTab('Sources');
                        setMessage('Source added. Save settings to follow it.');
                      }}
                    >
                      Follow introducing source
                    </button>
                  )}
                  <details>
                    <summary>Score, limits and sources</summary>
                    <p>
                      Signal strength {item.entity.assessment.score ?? 'unknown'} ·{' '}
                      {item.entity.assessment.state}. Query fit: {item.match.level}. Contextual
                      priority: {item.priority?.score ?? 'unknown'}.
                    </p>
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
                            <button
                              onClick={() => {
                                const source = item.entity.evidence.find(
                                  (source) => source.id === observation.evidenceId,
                                );
                                if (source)
                                  setPreview({
                                    statement: observation.statement,
                                    quote: observation.quote,
                                    title: source.title,
                                    uri: source.uri,
                                  });
                              }}
                            >
                              Preview evidence for {item.entity.name}
                            </button>
                            {' · '}
                            <a
                              href={`#source-${entityAnchor(item.entity)}-${observation.evidenceId}`}
                            >
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
                        <li key={source.id} id={`source-${entityAnchor(item.entity)}-${source.id}`}>
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
                        void action(async () => {
                          const check = await api<{ status: string; reason: string }>(
                            'primary-check',
                            {
                              id: item.entity.id,
                              destination: corpusDestinations.get(item.entity),
                            },
                          );
                          setMessage(`${item.entity.name}: ${check.status}. ${check.reason}`);
                        });
                      }}
                    >
                      Check primary source without AI
                    </button>
                  )}
                  {local && tab === 'Corpus' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        void action(() =>
                          start(
                            item.entity.id,
                            query,
                            undefined,
                            undefined,
                            undefined,
                            corpusDestinations.get(item.entity),
                          ),
                        );
                      }}
                    >
                      Research changes and independent evidence
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
            {tab === 'Search' && (result?.brief ?? earlyBrief)?.text && (
              <section className="research-brief" aria-label="Research brief">
                <details open={!items.length}>
                  <summary>Research explanation and next steps</summary>
                  <Brief text={(result?.brief ?? earlyBrief)!.text} />
                  <p>
                    {busy
                      ? 'Original answer ready; source checks and saved-record preparation are pending. '
                      : 'Retained from this research session. '}
                    Inspect supporting evidence and limitations before acting.
                  </p>
                </details>
              </section>
            )}
            {result && tab === 'Search' && (
              <>
                <details>
                  <summary>Source coverage and gaps</summary>
                  <p>
                    Coverage by source family is model-reported, not independently verified by total
                    tool-call counts. Equal contextual priorities use stable entity identity order.
                  </p>
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
              </>
            )}
            {local && ((result && tab === 'Search') || tab === 'Corpus') && (
              <>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action(() => askEvidence());
                  }}
                >
                  <label>
                    {tab === 'Corpus' ? 'Ask selected corpus evidence' : 'Ask the frozen evidence'}
                    <textarea
                      value={followup}
                      required
                      onChange={(event) => setFollowup(event.target.value)}
                    />
                  </label>
                  <button
                    disabled={answerBusy || busy || (tab === 'Corpus' && !corpusSelection.length)}
                  >
                    {answerBusy ? 'Reading frozen evidence…' : 'Answer from evidence'}
                  </button>
                  <p>
                    {tab === 'Corpus'
                      ? 'Select saved findings to ask or compare their retained evidence. '
                      : 'A bounded no-web AI call uses only this run and selected items. '}
                    Search further explicitly to acquire new evidence.
                  </p>
                </form>
                {answer && (
                  <section>
                    <p>
                      {answer.answer.replace(/observation-[a-f0-9]{24}/g, (id) => {
                        const index = answer.statements.findIndex(
                          (statement) => statement.observationId === id,
                        );
                        return index >= 0 ? String(index + 1) : 'unbound reference';
                      })}
                    </p>
                    <ol aria-label="Evidence used in answer">
                      {answer.statements.map((statement) => {
                        const entity = all.find(
                          (item) => item.entity.id === statement.entityId,
                        )?.entity;
                        const source = entity?.evidence.find(
                          (source) => source.id === statement.evidenceId,
                        );
                        return (
                          <li key={statement.observationId}>
                            {statement.statement}{' '}
                            {source && (
                              <a href={source.uri} target="_blank" rel="noreferrer">
                                {entity?.name}: {source.title}
                              </a>
                            )}
                            <details>
                              <summary>Supporting span</summary>
                              <blockquote>{statement.quote}</blockquote>
                            </details>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                )}
              </>
            )}
            {result && tab === 'Search' && (
              <a
                href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result))}`}
                download="signal-search.json"
              >
                Download JSON
              </a>
            )}
          </>
        )}
      </Container>
      {tab === 'Corpus' &&
        (local ? (
          <details>
            <summary>Earlier public findings</summary>
            {legacyCorpus}
          </details>
        ) : (
          legacyCorpus
        ))}
      {!embedded && (
        <nav className="workbench-footer" aria-label="Data downloads">
          <p>
            {local
              ? 'Saving is local. Commit and push reviewed corpus changes separately to publish.'
              : 'This static public view can browse and compare saved knowledge. Run the local workbench for AI search, saving and discovery.'}
          </p>
          <a href={`${base}entities.json`}>Native entity download</a>
        </nav>
      )}
    </>
  );
}

function inlineBrief(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    return link ? (
      <a key={index} href={link[2]} target="_blank" rel="noreferrer">
        {link[1]}
      </a>
    ) : (
      part
    );
  });
}

function Brief({ text }: { text: string }) {
  return (
    <div className="brief-text">
      {text.split(/\n\s*\n/).map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line, i) => (
                <li key={i}>{inlineBrief(line.replace(/^\s*[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (lines.length === 1 && /^#{1,6}\s+/.test(block))
          return <h3 key={index}>{inlineBrief(block.replace(/^#{1,6}\s+/, ''))}</h3>;
        return <p key={index}>{inlineBrief(block)}</p>;
      })}
    </div>
  );
}
