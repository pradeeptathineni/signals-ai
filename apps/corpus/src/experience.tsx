import { useEffect, useMemo, useState } from 'react';
import {
  createLibraryIndex,
  type LibraryFinding,
  type LibraryFilters,
} from '../../../packages/domain/src/library-search.js';
import { Workbench } from './workbench.js';
import './experience.css';
import {
  ProjectDesk,
  type ResearchPreview,
  type DisplayOpportunity,
} from './experience-projects.js';
import type { Project } from '../../../packages/corpus/src/project-contract.js';

const base = import.meta.env.BASE_URL;
const local = (window as Window & { __SIGNALS_LOCAL__?: boolean }).__SIGNALS_LOCAL__ === true;
const primaryViews = ['Search', 'Projects', 'Library', 'Following'] as const;
type View = (typeof primaryViews)[number] | 'Activity' | 'Settings';
type LocationState = {
  view: View;
  query: string;
  mode: 'library' | 'research';
  kind: string;
  acquisition: LibraryFilters['acquisition'];
  sort: string;
  project: string;
  detail: string;
  panel: string;
  run: string;
  compare: string;
};
type ApprovedResearchPreview = ResearchPreview & { basis: string; approvalId: string };
function projectBasis(project: Project) {
  return JSON.stringify([project.snapshot.digest, project.purpose, project.constraints]);
}
function previewLocationMatches(preview: ApprovedResearchPreview | null, state: LocationState) {
  return Boolean(
    preview &&
    preview.projectId === state.project &&
    preview.request.query === state.query &&
    state.view === 'Search' &&
    state.mode === 'research' &&
    !state.panel,
  );
}
function previewMatches(
  preview: ApprovedResearchPreview | null,
  state: LocationState,
  projects: Project[],
) {
  const project = projects.find((project) => project.id === preview?.projectId);
  return Boolean(
    previewLocationMatches(preview, state) &&
    preview &&
    project?.connected &&
    preview.basis === projectBasis(project),
  );
}
function strengthLabel(finding: LibraryFinding) {
  const strength = finding.intrinsicStrength;
  return `${finding.origin.format === 'legacy' ? 'Legacy review' : 'Native intrinsic signal'} (${strength.policy}): ${strength.score ?? 'unknown'}${strength.legacyLevel ? ` · review gate: ${strength.legacyLevel}` : ''}`;
}
function locationState(): LocationState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') ?? 'Search';
  return {
    view: (local ? [...primaryViews, 'Activity', 'Settings'] : ['Search', 'Library']).includes(view)
      ? (view as View)
      : 'Search',
    query: params.get('q') ?? '',
    mode: local && params.get('mode') === 'research' ? 'research' : 'library',
    kind: params.get('kind') ?? '',
    acquisition: ['open-source', 'free-to-use'].includes(params.get('access') ?? '')
      ? (params.get('access') as LibraryFilters['acquisition'])
      : 'all',
    sort: params.get('sort') ?? 'relevance',
    project: local ? (params.get('project') ?? '') : '',
    detail: params.get('detail') ?? '',
    panel: local ? (params.get('panel') ?? '') : '',
    run: local ? (params.get('run') ?? '') : '',
    compare: params.get('compare') ?? '',
  };
}
function writeLocation(state: LocationState, replace: boolean) {
  const params = new URLSearchParams();
  const values = {
    view: state.view,
    q: state.query,
    mode: state.mode,
    kind: state.kind,
    access: state.acquisition,
    sort: state.sort,
    project: state.project,
    detail: state.detail,
    panel: state.panel,
    run: state.run,
    compare: state.compare,
  };
  for (const [key, value] of Object.entries(values))
    if (value && value !== 'all' && value !== 'relevance' && value !== 'library')
      params.set(key, value);
  window.history[replace ? 'replaceState' : 'pushState'](
    null,
    '',
    `${window.location.pathname}?${params.toString()}`,
  );
}
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' })
    : 'Not recorded';
}
export function Experience() {
  const [state, setState] = useState(locationState);
  const [records, setRecords] = useState<LibraryFinding[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const selected = state.compare.split(',').filter(Boolean).slice(0, 3);
  const [projects, setProjects] = useState<Project[]>([]);
  const [opportunities, setOpportunities] = useState<DisplayOpportunity[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [reopenRun, setReopenRun] = useState(state.run);
  const [workbenchStarted, setWorkbenchStarted] = useState(local && state.mode === 'research');
  const [visibleCount, setVisibleCount] = useState(40);
  const [projectResearch, setProjectResearch] = useState<ApprovedResearchPreview | null>(null);
  const [monitorRun, setMonitorRun] = useState('');
  const [followup, setFollowup] = useState('');
  const [answer, setAnswer] = useState<{
    answer: string;
    statements: {
      statement: string;
      quote: string;
      entityId: string;
      evidenceId: string;
      observationId: string;
    }[];
  } | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);
  async function api<T>(route: string, body?: unknown): Promise<T> {
    let authorization = token;
    if (body !== undefined && !authorization) {
      const response = await fetch(`${base}__signals/api/session`);
      if (!response.ok)
        throw new Error('The local session is unavailable. Browsing remains available.');
      authorization = ((await response.json()) as { token: string }).token;
      setToken(authorization);
    }
    const response = await fetch(
      `${base}__signals/api/${route}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-signals-token': authorization },
            body: JSON.stringify(body),
          },
    );
    const value: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        value && typeof value === 'object' && 'code' in value
          ? String(value.code)
          : 'Operation failed. Your input is retained.',
      );
    return value as T;
  }
  async function action(operation: () => Promise<void> | void) {
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  async function reloadLibrary() {
    const response = local
      ? (await api<{ findings: LibraryFinding[] }>('library')).findings
      : await fetch(`${base}library.json`).then(async (response) => {
          if (!response.ok) throw new Error('The public library could not be loaded.');
          return response.json() as Promise<LibraryFinding[]>;
        });
    if (
      !Array.isArray(response) ||
      response.some(
        (finding) =>
          !finding ||
          typeof finding !== 'object' ||
          typeof finding.key !== 'string' ||
          typeof finding.title !== 'string' ||
          typeof finding.uri !== 'string' ||
          typeof finding.description !== 'string' ||
          typeof finding.kind !== 'string' ||
          !finding.license ||
          !Array.isArray(finding.license.values) ||
          !finding.access ||
          !finding.origin ||
          !finding.intrinsicStrength ||
          ![
            'aliases',
            'domains',
            'capabilities',
            'useCases',
            'technologies',
            'tags',
            'sourceNames',
          ].every((field) => Array.isArray(finding[field as keyof LibraryFinding])),
      )
    )
      throw new Error(
        'The library response is incomplete. Reload to retry; research has not started.',
      );
    setRecords(response);
    setLoaded(true);
  }
  async function reloadProjects() {
    const [result, retained] = await Promise.all([
      api<{ projects: Project[] }>('projects'),
      api<{ opportunities: DisplayOpportunity[] }>('opportunities'),
    ]);
    setProjects(result.projects);
    setOpportunities(retained.opportunities);
  }
  useEffect(() => {
    void action(reloadLibrary);
    if (local) void reloadProjects().catch((failure: unknown) => setError(String(failure)));
    const back = () => {
      const next = locationState();
      setProjectResearch((current) => (previewLocationMatches(current, next) ? current : null));
      setState(next);
      setReopenRun(next.run);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  function navigate(change: Partial<LocationState>, replace = false) {
    const next = { ...state, ...change };
    setProjectResearch((current) => (previewMatches(current, next, projects) ? current : null));
    setState(next);
    writeLocation(next, replace);
    setMessage('');
  }
  function selectFinding(key: string) {
    setAnswer(null);
    const next = selected.includes(key)
      ? selected.filter((value) => value !== key)
      : selected.length < 3
        ? [...selected, key]
        : selected;
    navigate({ compare: next.join(',') });
  }
  const index = useMemo(() => createLibraryIndex(records), [records]);
  const approvedResearch = previewMatches(projectResearch, state, projects)
    ? projectResearch
    : null;
  useEffect(() => {
    if (projectResearch && !approvedResearch) setProjectResearch(null);
  }, [projectResearch, approvedResearch]);
  const filters: LibraryFilters = {
    kind: state.kind || undefined,
    acquisition: state.acquisition,
    ...(local && state.view === 'Library' ? { saved: true } : {}),
  };
  const hits = useMemo(() => {
    const values = index.search(state.query, filters);
    if (state.sort === 'title')
      values.sort((a, b) => a.finding.title.localeCompare(b.finding.title));
    if (state.sort === 'strength')
      values.sort(
        (a, b) =>
          a.finding.intrinsicStrength.policy.localeCompare(b.finding.intrinsicStrength.policy) ||
          (b.finding.intrinsicStrength.score ?? -1) - (a.finding.intrinsicStrength.score ?? -1),
      );
    if (state.sort === 'observed')
      values.sort((a, b) => (b.finding.observedAt ?? '').localeCompare(a.finding.observedAt ?? ''));
    return values;
  }, [index, state.query, state.kind, state.acquisition, state.sort, state.view]);
  const kinds = [...new Set(records.map((record) => record.kind))].sort();
  const compared = records.filter((finding) => selected.includes(finding.key));
  const powered =
    state.view === 'Activity'
      ? 'Jobs'
      : state.view === 'Settings'
        ? 'Settings'
        : state.view === 'Following'
          ? state.panel === 'sources'
            ? 'Sources'
            : 'Interests'
          : state.view === 'Library' && state.panel === 'inbox'
            ? 'Inbox'
            : state.mode === 'research'
              ? 'Search'
              : null;
  useEffect(() => {
    if (powered && local) setWorkbenchStarted(true);
  }, [powered]);
  useEffect(() => setVisibleCount(40), [state.query, state.kind, state.acquisition, state.view]);
  async function save(finding: LibraryFinding) {
    setPending((current) => [...current, finding.key]);
    try {
      await api('library-saved', { key: finding.key, saved: !finding.saved });
      await reloadLibrary();
      setMessage(
        finding.saved
          ? `${finding.title} removed from your saved collection. Evidence remains searchable.`
          : `${finding.title} saved locally. Publication is separate.`,
      );
    } finally {
      setPending((current) => current.filter((key) => key !== finding.key));
    }
  }
  return (
    <div className="desk-shell">
      <a href="#desk-content" className="skip-link">
        Skip to findings
      </a>
      <aside className="desk-rail">
        <a className="desk-brand" href={base}>
          Signals<span>A personal research desk</span>
        </a>
        <nav aria-label="Signals destinations">
          {(local ? primaryViews : (['Search', 'Library'] as const)).map((view) => (
            <button
              key={view}
              aria-current={state.view === view ? 'page' : undefined}
              onClick={() => navigate({ view, mode: 'library', panel: '' })}
            >
              {view}
            </button>
          ))}
        </nav>
        {local && (
          <nav className="desk-utilities" aria-label="Workbench utilities">
            {(['Activity', 'Settings'] as const).map((view) => (
              <button
                key={view}
                aria-current={state.view === view ? 'page' : undefined}
                onClick={() => navigate({ view, panel: '' })}
              >
                {view}
              </button>
            ))}
          </nav>
        )}
        <div className="desk-rail-note">
          <strong>{local ? 'Your local workspace' : 'Public library · read only'}</strong>
          <p>
            {local
              ? 'Read and organize without a model. Research starts when you ask.'
              : 'Approved findings, evidence and primary sources. No account or model call.'}
          </p>
        </div>
      </aside>
      <main className="desk-main" id="desk-content" tabIndex={-1}>
        <header className="desk-topline">
          <p>
            {state.view}
            {state.project
              ? ` / ${projects.find((project) => project.id === state.project)?.name ?? 'Selected project'}`
              : ''}
          </p>
          {local && (
            <button onClick={() => navigate({ view: 'Library', mode: 'library', panel: 'inbox' })}>
              Add a link
            </button>
          )}
        </header>
        {error && (
          <p className="desk-error" role="alert">
            {error} <button onClick={() => void action(reloadLibrary)}>Reload library</button>
          </p>
        )}
        {message && (
          <p role="status" className="desk-feedback">
            {message}
          </p>
        )}
        {(state.view === 'Search' || state.view === 'Library') && (
          <>
            <div className="desk-heading">
              <h1>{state.view === 'Library' ? 'Your library' : 'Find something useful.'}</h1>
              <p>
                {state.view === 'Library'
                  ? 'Saved knowledge, with evidence you can return to.'
                  : 'Start with what you already have. Research a gap when you need more.'}
              </p>
            </div>
            {state.view === 'Library' && local && (
              <nav className="desk-tabs" aria-label="Library views">
                <button
                  aria-pressed={state.panel !== 'inbox'}
                  onClick={() => navigate({ panel: '' })}
                >
                  Saved
                </button>
                <button
                  aria-pressed={state.panel === 'inbox'}
                  onClick={() => navigate({ panel: 'inbox' })}
                >
                  Inbox & capture
                </button>
              </nav>
            )}
            {state.panel !== 'inbox' && (
              <section className="desk-search" aria-label="Finding search">
                <label htmlFor="desk-query">Find something useful</label>
                <input
                  id="desk-query"
                  type="search"
                  value={state.query}
                  onChange={(event) => navigate({ query: event.target.value }, true)}
                  placeholder="A question, capability or name…"
                />
                <div className="desk-search-options">
                  <div className="desk-tabs" aria-label="Search scope">
                    <button
                      aria-pressed={state.mode === 'library'}
                      onClick={() => navigate({ mode: 'library' })}
                    >
                      Library
                    </button>
                    {local && (
                      <button
                        aria-pressed={state.mode === 'research'}
                        onClick={() => navigate({ view: 'Search', mode: 'research', panel: '' })}
                      >
                        Research online
                      </button>
                    )}
                  </div>
                  <span>
                    {state.mode === 'library'
                      ? 'No model call'
                      : 'Review provider and budget below before starting.'}
                  </span>
                </div>
                {local && (
                  <label className="desk-project-scope">
                    For:
                    <select
                      aria-label="Project scope"
                      value={state.project}
                      onChange={(event) => navigate({ project: event.target.value })}
                    >
                      <option value="">Everything</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {local && state.mode === 'library' && (
                  <details>
                    <summary>Keep a historical corpus question</summary>
                    <p>
                      Save this question with its historical reviewed corpus matches privately. This
                      performs no model call.
                    </p>
                    <button
                      disabled={!state.query.trim()}
                      onClick={() =>
                        void action(async () => {
                          const response = await fetch(`${base}__signals/query`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ question: state.query }),
                          });
                          if (!response.ok)
                            throw new Error('The historical question could not be saved.');
                          const saved = (await response.json()) as { id: string };
                          setMessage(`Question saved privately: ${saved.id}`);
                        })
                      }
                    >
                      Save question locally
                    </button>
                  </details>
                )}
              </section>
            )}
            {!powered && (
              <>
                <div className="desk-filters">
                  <label>
                    Resource kind
                    <select
                      aria-label="Resource kind"
                      value={state.kind}
                      onChange={(event) => navigate({ kind: event.target.value })}
                    >
                      <option value="">All kinds</option>
                      {kinds.map((kind) => (
                        <option key={kind}>{kind}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Access & license
                    <select
                      aria-label="Access & license"
                      value={state.acquisition}
                      onChange={(event) =>
                        navigate({
                          acquisition: event.target.value as LibraryFilters['acquisition'],
                        })
                      }
                    >
                      <option value="all">All resources</option>
                      <option value="open-source">Open source software</option>
                      <option value="free-to-use">Free-to-use resources</option>
                    </select>
                  </label>
                  <label>
                    Sort
                    <select
                      aria-label="Sort"
                      value={state.sort}
                      onChange={(event) => navigate({ sort: event.target.value })}
                    >
                      <option value="relevance">Relevance to your query</option>
                      <option value="title">Name</option>
                      <option value="strength">Score within policy groups</option>
                      <option value="observed">Last observed</option>
                    </select>
                  </label>
                  <button
                    onClick={() =>
                      navigate({ query: '', kind: '', acquisition: 'all', sort: 'relevance' })
                    }
                  >
                    Reset filters
                  </button>
                </div>
                <div className="desk-section-line">
                  <h2>{state.view === 'Library' ? 'Saved findings' : 'From the corpus'}</h2>
                  <p aria-live="polite">
                    {loaded
                      ? `${hits.length} ${hits.length === 1 ? 'finding' : 'findings'}`
                      : 'Loading retained records…'}
                  </p>
                </div>
                {compared.length > 0 && (
                  <section className="desk-comparison" aria-label="Compare selected findings">
                    <h2>Compare purposes and evidence</h2>
                    <p>
                      Scores from different policies are separate judgments and are not directly
                      comparable.
                    </p>
                    <div>
                      {compared.map((finding) => (
                        <article key={finding.key}>
                          <h3>{finding.title}</h3>
                          <p>{finding.description}</p>
                          <p>
                            {strengthLabel(finding)}.{' '}
                            {finding.native?.limits[0] ?? 'Open evidence for limitations.'}
                          </p>
                        </article>
                      ))}
                    </div>
                    <button onClick={() => navigate({ compare: '' })}>Clear comparison</button>
                    {local && compared.every((finding) => finding.native) && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void action(async () => {
                            setAnswerBusy(true);
                            try {
                              setAnswer(
                                await api('followup', {
                                  ids: compared.map((finding) => finding.id),
                                  destinations: compared.map(
                                    (finding) => finding.origin.destination,
                                  ),
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
                          Ask selected retained evidence
                          <input
                            required
                            value={followup}
                            onChange={(event) => setFollowup(event.target.value)}
                          />
                        </label>
                        <button disabled={answerBusy}>
                          {answerBusy
                            ? 'Reading retained evidence…'
                            : 'Explain from retained evidence'}
                        </button>
                        <p>
                          One deliberate, bounded no-web AI call. Browsing and comparison need no
                          model.
                        </p>
                      </form>
                    )}
                    {answer && (
                      <section aria-label="Retained evidence answer">
                        <p>{answer.answer}</p>
                        {answer.statements.map((statement) => (
                          <details key={statement.observationId}>
                            <summary>{statement.statement}</summary>
                            <blockquote>{statement.quote}</blockquote>
                          </details>
                        ))}
                      </section>
                    )}
                  </section>
                )}
                <section className="desk-results" aria-label="Finding results">
                  {hits.slice(0, visibleCount).map(({ finding, matchedFields }) => (
                    <article
                      className="desk-finding"
                      key={finding.key}
                      data-finding-key={finding.key}
                    >
                      <div className="desk-finding-head">
                        <h3>{finding.title}</h3>
                        <span>{finding.kind.replaceAll('_', ' ')}</span>
                      </div>
                      <p className="desk-summary">{finding.description}</p>
                      {state.project && (
                        <ProjectFit
                          projectId={state.project}
                          findingKey={finding.key}
                          opportunities={opportunities}
                        />
                      )}
                      <p className="desk-meta">
                        {strengthLabel(finding)} · observed {date(finding.observedAt)}
                        {finding.native?.limits[0] ? ` · ${finding.native.limits[0]}` : ''}
                      </p>
                      {local && (
                        <p className="desk-meta">
                          {finding.origin.destination === 'private'
                            ? 'Private finding'
                            : 'Public finding'}{' '}
                          · {finding.saved ? 'In your saved collection' : 'Available in the corpus'}
                        </p>
                      )}
                      <div className="desk-actions">
                        <a href={finding.uri} target="_blank" rel="noreferrer">
                          Open original ↗
                        </a>
                        {local && (
                          <button
                            aria-pressed={finding.saved}
                            disabled={pending.includes(finding.key)}
                            onClick={() => void action(() => save(finding))}
                          >
                            {pending.includes(finding.key)
                              ? 'Saving…'
                              : finding.saved
                                ? 'Unsave'
                                : 'Save'}
                          </button>
                        )}
                        <button
                          aria-pressed={selected.includes(finding.key)}
                          onClick={() => selectFinding(finding.key)}
                        >
                          {selected.includes(finding.key) ? 'Selected for comparison' : 'Compare'}
                        </button>
                      </div>
                      <details open={state.detail === finding.key}>
                        <summary
                          onClick={(event) => {
                            event.preventDefault();
                            navigate({ detail: state.detail === finding.key ? '' : finding.key });
                          }}
                        >
                          Evidence & details
                        </summary>
                        {state.detail === finding.key && (
                          <FindingDetail finding={finding} matchedFields={matchedFields} />
                        )}
                      </details>
                      {local && finding.native && state.detail === finding.key && (
                        <div className="desk-actions">
                          <button
                            onClick={() =>
                              void action(async () => {
                                const check = await api<{ status: string; reason: string }>(
                                  'primary-check',
                                  { id: finding.id, destination: finding.origin.destination },
                                );
                                setMessage(`${finding.title}: ${check.status}. ${check.reason}`);
                              })
                            }
                          >
                            Check primary source without AI
                          </button>
                          <button
                            onClick={() =>
                              void action(async () => {
                                const started = await api<{ id: string }>('refresh', {
                                  id: finding.id,
                                  destination: finding.origin.destination,
                                });
                                setMonitorRun(started.id);
                                navigate({ view: 'Search', mode: 'research' });
                              })
                            }
                          >
                            Research changes and independent evidence
                          </button>
                        </div>
                      )}
                      {local && (
                        <details>
                          <summary>Private note and feedback</summary>
                          <LibraryAnnotation
                            finding={finding}
                            save={(patch) =>
                              action(async () => {
                                await api('library-saved', {
                                  key: finding.key,
                                  saved: finding.saved,
                                  ...patch,
                                });
                                await reloadLibrary();
                                setMessage(
                                  'Private note and feedback saved. Evidence strength is unchanged.',
                                );
                              })
                            }
                          />
                        </details>
                      )}
                      {local &&
                        state.project &&
                        projects.find((project) => project.id === state.project)?.connected && (
                          <details>
                            <summary>Connect to selected project</summary>
                            <ProjectAssociation
                              key={`${finding.key}:${state.project}`}
                              finding={finding}
                              project={projects.find((project) => project.id === state.project)!}
                              save={(need, reason, nextAction) =>
                                action(async () => {
                                  await api('opportunities/attach', {
                                    projectId: state.project,
                                    findingKey: finding.key,
                                    need,
                                    reason,
                                    nextAction,
                                  });
                                  await reloadProjects();
                                  setMessage(
                                    'Finding attached to the project with your stated reason.',
                                  );
                                })
                              }
                            />
                          </details>
                        )}
                    </article>
                  ))}
                </section>
                {hits.length > visibleCount && (
                  <button onClick={() => setVisibleCount((count) => count + 40)}>
                    Show more findings ({hits.length - visibleCount} remaining)
                  </button>
                )}
                {loaded && !hits.length && (
                  <section className="desk-empty">
                    <h2>
                      {records.length
                        ? 'No matching findings in this view.'
                        : 'Your corpus is empty.'}
                    </h2>
                    <p>
                      {records.length
                        ? 'Try another phrase or reset filters. Missing corpus coverage does not mean an option does not exist.'
                        : 'Add a resource you know or research an interest to begin.'}
                    </p>
                    <div className="desk-actions">
                      <button onClick={() => navigate({ query: '', kind: '', acquisition: 'all' })}>
                        Clear filters
                      </button>
                      {local && (
                        <>
                          <button onClick={() => navigate({ view: 'Library', panel: 'inbox' })}>
                            Add a link
                          </button>
                          <button onClick={() => navigate({ view: 'Search', mode: 'research' })}>
                            Research an interest
                          </button>
                        </>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
        {local && state.view === 'Projects' && (
          <ProjectDesk
            projects={projects}
            findings={records}
            selected={state.project}
            api={api}
            reload={reloadProjects}
            onOpportunitiesChange={setOpportunities}
            select={(id) => navigate({ project: id })}
            explore={(project) =>
              navigate({ view: 'Search', project: project.id, query: project.purpose })
            }
            research={(preview) => {
              void action(() => {
                const project = projects.find((project) => project.id === preview.projectId);
                const payload = preview.request.context
                  ? (JSON.parse(preview.request.context) as Record<string, unknown>)
                  : null;
                if (
                  !project?.connected ||
                  !payload ||
                  payload.projectId !== project.id ||
                  payload.snapshotDigest !== project.snapshot.digest ||
                  payload.purpose !== project.purpose ||
                  JSON.stringify(payload.constraints) !== JSON.stringify(project.constraints) ||
                  preview.question !== preview.request.query
                ) {
                  setError(
                    'The project research preview is out of date. Preview the current project question again.',
                  );
                  return;
                }
                navigate({
                  view: 'Search',
                  mode: 'research',
                  query: preview.request.query,
                  project: preview.projectId,
                });
                setProjectResearch({
                  ...preview,
                  basis: projectBasis(project),
                  approvalId: crypto.randomUUID(),
                });
              });
            }}
          />
        )}
        {state.view === 'Following' && (
          <>
            <h1>Following</h1>
            <p>
              Keep interests and productive sources together. Recurrence follows your explicit
              settings.
            </p>
            <nav className="desk-tabs" aria-label="Following views">
              <button
                aria-pressed={state.panel !== 'sources'}
                onClick={() => navigate({ panel: 'interests' })}
              >
                Interests
              </button>
              <button
                aria-pressed={state.panel === 'sources'}
                onClick={() => navigate({ panel: 'sources' })}
              >
                Sources
              </button>
            </nav>
          </>
        )}
        {local && workbenchStarted && (
          <div hidden={!powered} className="desk-powered">
            <Workbench
              legacyCorpus={null}
              embedded
              requestedTab={powered ?? 'Search'}
              question={state.query}
              reopenRun={reopenRun}
              providedContext={approvedResearch?.request.context}
              providedContextKey={approvedResearch?.approvalId}
              providedContextLabel={
                approvedResearch
                  ? `${projects.find((project) => project.id === approvedResearch.projectId)?.name ?? 'Selected project'}: ${approvedResearch.question}`
                  : undefined
              }
              providedProfile={approvedResearch?.request.profile}
              monitorRun={monitorRun}
              onOpenResult={(runId, restoredQuery) => {
                setProjectResearch(null);
                if (restoredQuery !== undefined)
                  navigate(
                    {
                      view: 'Search',
                      mode: 'research',
                      panel: '',
                      run: runId,
                      query: restoredQuery,
                    },
                    true,
                  );
                else if (
                  state.view !== 'Search' ||
                  state.mode !== 'research' ||
                  state.run !== runId
                )
                  navigate({ view: 'Search', mode: 'research', panel: '', run: runId });
              }}
              onCompleted={(runId) => {
                const next = { ...state, run: runId };
                setState(next);
                writeLocation(next, true);
                void action(reloadLibrary);
              }}
            />
          </div>
        )}
        <footer className="desk-footer">
          <p>
            {local
              ? 'Findings remain data. Saving or requesting a setup plan never runs the resource.'
              : 'Search and read approved evidence here. The local Signals workbench adds projects, private notes, capture and deliberate research.'}
          </p>
          <a href={`${base}library.json`} download="signals-library.json">
            Download the public library
          </a>
        </footer>
      </main>
    </div>
  );
}

function ProjectFit({
  projectId,
  findingKey,
  opportunities,
}: {
  projectId: string;
  findingKey: string;
  opportunities: DisplayOpportunity[];
}) {
  const retained = opportunities.filter(
    (opportunity) => opportunity.projectId === projectId && opportunity.findingKey === findingKey,
  );
  if (!retained.length)
    return (
      <p className="desk-fit">
        General use shown above. Project suitability has not been assessed for this finding.
      </p>
    );
  return (
    <section className="desk-fit" aria-label="Retained project fit">
      {retained.map((opportunity) => (
        <div key={opportunity.id}>
          <p>
            <strong>Project need:</strong> {opportunity.need}
          </p>
          <p>{opportunity.reason}</p>
          <p className="desk-meta">
            Retained association · next action: {opportunity.nextAction} · personal decision:{' '}
            {opportunity.status}
            {opportunity.importedSource
              ? ` · original Context status: ${opportunity.importedSource.status}`
              : ''}
          </p>
          {opportunity.needsReview && (
            <p className="desk-error">
              The project basis changed or disconnected. Reconsider this retained association before
              acting.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

function FindingDetail({
  finding,
  matchedFields,
}: {
  finding: LibraryFinding;
  matchedFields: string[];
}) {
  return (
    <div className="desk-detail">
      <p>
        {finding.intrinsicStrength.policy}: signal strength records an evidence policy judgment; it
        is separate from query relevance and does not prove usefulness.
      </p>
      <p>
        License: {finding.license.state === 'known' ? finding.license.values.join(', ') : 'Unknown'}
        . Access:{' '}
        {finding.access.state === 'unknown'
          ? 'Unknown'
          : finding.access.freeToUse
            ? 'Free to use'
            : 'Not marked free to use'}
        .
      </p>
      {matchedFields.length > 0 && (
        <p>
          Search matched: {matchedFields.join(', ')}. This is lexical retrieval, not a suitability
          assessment.
        </p>
      )}
      {local && (
        <p>
          {finding.origin.destination === 'private'
            ? 'Private retained record'
            : 'Public corpus record'}{' '}
          · {finding.id}
        </p>
      )}
      {finding.native && (
        <>
          <h4>Evidence and limits</h4>
          <ul>
            {finding.native.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
          {finding.native.evidence.map((source) => (
            <section key={source.id}>
              <a href={source.uri} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              <p>
                {source.state} · {source.publisher} · observed {date(source.fetchedAt)}
              </p>
              <p>{source.excerpt || source.reason}</p>
              <details>
                <summary>Bound observations</summary>
                {finding
                  .native!.observations.filter(
                    (observation) => observation.evidenceId === source.id,
                  )
                  .map((observation) => (
                    <div key={observation.id}>
                      <p>{observation.statement}</p>
                      <blockquote>{observation.quote}</blockquote>
                      <p>
                        {observation.status} ·{' '}
                        {observation.verified ? 'Matched passage' : 'Unmatched passage'}. Text
                        matching does not establish factual entailment.
                      </p>
                    </div>
                  ))}
              </details>
            </section>
          ))}
          <details>
            <summary>Assessment factors and history</summary>
            <pre>{JSON.stringify(finding.native.assessment, null, 2)}</pre>
          </details>
        </>
      )}
      {finding.legacy && (
        <>
          <h4>Retained historical finding</h4>
          <p>Historical review retains its original evidence and strength meanings.</p>
          <p>{finding.legacy.reason}</p>
          <ul>
            {finding.legacy.limitations.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
          {finding.legacy.claims.map((claim) => (
            <section key={claim.id}>
              <p>{claim.text}</p>
              <p>
                Freshness: {claim.freshness}. Historical review: {claim.review.basis}.
              </p>
              <ul>
                {finding
                  .legacy!.sources.filter((source) => claim.source_ids.includes(source.id))
                  .map((source) => (
                    <li key={source.id}>
                      <a href={source.uri} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <details>
            <summary>Historical record and original policy</summary>
            <pre>{JSON.stringify(finding.legacy, null, 2)}</pre>
          </details>
        </>
      )}
      {finding.notes && (
        <>
          <h4>Private note</h4>
          <p>{finding.notes}</p>
        </>
      )}
    </div>
  );
}

function LibraryAnnotation({
  finding,
  save,
}: {
  finding: LibraryFinding;
  save: (patch: { note: string; feedback: string; novelty: string }) => Promise<void>;
}) {
  const [note, setNote] = useState(finding.notes ?? '');
  const [feedback, setFeedback] = useState(finding.feedback ?? 'none');
  const [novelty, setNovelty] = useState(finding.novelty ?? 'unknown');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void save({ note, feedback, novelty }).finally(() => setBusy(false));
      }}
    >
      <label>
        Note for {finding.title}
        <textarea
          aria-label={`Note for ${finding.title}`}
          maxLength={4000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <label>
        Feedback for {finding.title}
        <select
          value={feedback}
          onChange={(event) => setFeedback(event.target.value as typeof feedback)}
        >
          <option value="none">No feedback yet</option>
          <option value="useful">Useful</option>
          <option value="skip">Defer for now</option>
          <option value="mute">Mute</option>
        </select>
      </label>
      <label>
        Personal novelty for {finding.title}
        <select
          value={novelty}
          onChange={(event) => setNovelty(event.target.value as typeof novelty)}
        >
          <option value="unknown">Unknown</option>
          <option value="known">Already known</option>
          <option value="confirmed-new">New to me</option>
        </select>
      </label>
      <p>Annotations remain private and do not increase evidence strength.</p>
      <button disabled={busy}>{busy ? 'Saving annotation…' : 'Save private annotation'}</button>
    </form>
  );
}
function ProjectAssociation({
  finding,
  project,
  save,
}: {
  finding: LibraryFinding;
  project: Project;
  save: (need: string, reason: string, nextAction: string) => Promise<void>;
}) {
  const [need, setNeed] = useState(project.purpose);
  const [reason, setReason] = useState('');
  const [nextAction, setNextAction] = useState(
    finding.kind === 'learning-resource' ? 'learn' : 'explore',
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(need, reason, nextAction);
      }}
    >
      <p>
        Connect {finding.title} to {project.name}. This records your judgment; it does not execute
        or install the resource.
      </p>
      <label>
        Project need
        <textarea
          aria-label="Project need"
          required
          maxLength={3000}
          value={need}
          onChange={(event) => setNeed(event.target.value)}
        />
      </label>
      <label>
        Why this finding fits
        <textarea
          aria-label="Why this finding fits"
          required
          maxLength={3000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label>
        Next action
        <select value={nextAction} onChange={(event) => setNextAction(event.target.value)}>
          <option value="learn">Learn</option>
          <option value="explore">Explore</option>
          <option value="compare">Compare alternatives</option>
          <option value="consider-for-trial">Consider for an authorized trial</option>
        </select>
      </label>
      <button disabled={!need.trim() || !reason.trim()}>Attach finding to project</button>
    </form>
  );
}
