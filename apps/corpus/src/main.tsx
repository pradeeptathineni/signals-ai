import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  filterPublicOptions,
  refreshPublicFreshness,
  type PublicFilters,
  type PublicOption,
} from '../../../packages/domain/src/public-corpus.js';
import './styles.css';
import { parsePublicIndex } from '../../../packages/domain/src/public-index.js';

const base = import.meta.env.BASE_URL;
function display(value: string) {
  if (value === 'category') return 'domain';
  if (value === 'concept') return 'tag';
  return value.replaceAll('_', ' ');
}
function date(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' })
    : 'Unknown';
}

function Corpus() {
  const [options, setOptions] = useState<PublicOption[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<PublicFilters>({});
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void fetch(`${base}corpus.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The public collection could not be loaded.');
        const data: unknown = await response.json();
        setOptions(refreshPublicFreshness(parsePublicIndex(data), new Date().toISOString()));
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Unable to load the collection.');
      });
    return () => controller.abort();
  }, [attempt]);
  const matches = useMemo(() => filterPublicOptions(options ?? [], filters), [options, filters]);
  const compared = (options ?? []).filter((option) => selected.includes(option.id));
  const active = Object.entries(filters).filter(([, value]) => value !== '' && value !== false);
  const values = (select: (option: PublicOption) => string[]) =>
    [...new Set((options ?? []).flatMap(select))].sort();
  function change(key: keyof PublicFilters, value: string | boolean) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 2
          ? [...current, id]
          : current,
    );
  }
  function download() {
    const file = new Blob(
      [JSON.stringify({ universe: 'reviewed-public-files', filters, items: matches }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'signals-results.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <a className="skip-link" href="#results">
        Skip to findings
      </a>
      <header className="masthead">
        <a href={base} className="brand">
          Signals<span>Public Corpus · pre-1 preview</span>
        </a>
        <a href="https://github.com/pradeeptathineni/signals-ai">Source & local app</a>
      </header>
      <main>
        <section className="intro" aria-labelledby="intro-title">
          <h1 id="intro-title">
            Useful knowledge.
            <br />
            Sources you can inspect.
          </h1>
          <p>
            Find a practice or option, see what supports it, and compare its limits before you
            choose.
          </p>
          <p className="scope">
            This reviewed public collection is held in Git. Text search stays in your browser and
            uses literal matches. It covers {options?.length ?? '…'} options; the local application
            has a separate, larger Corpus and optional live research.
          </p>
        </section>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={() => setAttempt((n) => n + 1)}>Retry loading</button>
          </div>
        ) : null}
        {!options && !error ? <p role="status">Loading reviewed knowledge…</p> : null}
        {options ? (
          <>
            <section className="controls" aria-label="Search and filters">
              <label className="search">
                Search keywords
                <input
                  type="search"
                  maxLength={1000}
                  placeholder="Try water meter, review, or source lineage"
                  value={filters.query ?? ''}
                  onChange={(e) => change('query', e.target.value)}
                />
              </label>
              <div className="filters">
                <label>
                  Signal type
                  <select
                    value={filters.type ?? ''}
                    onChange={(e) => change('type', e.target.value)}
                  >
                    <option value="">All types</option>
                    {values((o) => [o.type]).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Domain
                  <select
                    value={filters.category ?? ''}
                    onChange={(e) => change('category', e.target.value)}
                  >
                    <option value="">All domains</option>
                    {values((o) => [o.category]).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tag
                  <select
                    value={filters.concept ?? ''}
                    onChange={(e) => change('concept', e.target.value)}
                  >
                    <option value="">All tags</option>
                    {values((o) => o.concepts).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Source kind
                  <select
                    value={filters.sourceClass ?? ''}
                    onChange={(e) => change('sourceClass', e.target.value)}
                  >
                    <option value="">All source kinds</option>
                    {values((o) => o.sources.map((s) => s.source_class)).map((v) => (
                      <option key={v} value={v}>
                        {display(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Claim review
                  <select
                    value={filters.freshness ?? ''}
                    onChange={(e) => change('freshness', e.target.value)}
                  >
                    <option value="">Any review state</option>
                    <option value="current">Within stated review basis</option>
                    <option value="due">Review due</option>
                    <option value="unknown">Unknown freshness</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={filters.githubOnly ?? false}
                    onChange={(e) => change('githubOnly', e.target.checked)}
                  />
                  GitHub-hosted options
                </label>
              </div>
              <div className="filter-status">
                <p role="status">
                  {matches.length} of {options.length} options · {active.length} active constraints
                </p>
                <button onClick={() => setFilters({})}>Clear filters</button>
                <button onClick={download}>Download these results</button>
              </div>
              {active.length ? (
                <ul className="active-filters" aria-label="Active constraints">
                  {active.map(([key, value]) => (
                    <li key={key}>
                      {display(key)}: {String(value)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            {compared.length ? (
              <section className="comparison" aria-labelledby="compare-title">
                <div className="result-heading">
                  <h2 id="compare-title">Compare selected options</h2>
                  <button onClick={() => setSelected([])}>Clear comparison</button>
                </div>
                <p>
                  Select up to two options. Compare the need, supported claims and limits; selection
                  grants no permission to install or execute anything.
                </p>
                <div className="comparison-grid">
                  {compared.map((o) => (
                    <article key={o.id}>
                      <h3>{o.name}</h3>
                      <p>{o.reason}</p>
                      <h4>Supported scope</h4>
                      <ul>
                        {o.claims.map((c) => (
                          <li key={c.id}>{c.text}</li>
                        ))}
                      </ul>
                      <h4>Limits</h4>
                      <ul>
                        {o.limitations.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            <section id="results" tabIndex={-1} aria-labelledby="findings-title">
              <div className="result-heading">
                <h2 id="findings-title">Findings</h2>
                <p>Reviewed advice, with uncertainty</p>
              </div>
              {!matches.length ? (
                <div className="empty">
                  <h3>No matching options</h3>
                  <p>
                    Try a few keywords such as “water meter” or “source lineage”, or clear a filter.
                    Every word must match this small reviewed collection. A whole question may miss
                    useful options; no match is not evidence that no useful answer exists.
                  </p>
                  <button onClick={() => setFilters({})}>Show all options</button>
                </div>
              ) : null}
              {matches.map((option) => (
                <article className="finding" key={option.id} data-option-id={option.id}>
                  <div className="finding-main">
                    <p className="category">{option.category}</p>
                    <h3>
                      <a href={option.uri}>{option.name}</a>
                    </h3>
                    <p>{option.reason}</p>
                    <p className="next-action">
                      Next action: {display(option.disposition)} within the stated scope.
                    </p>
                    <label className="check compare-control">
                      <input
                        type="checkbox"
                        checked={selected.includes(option.id)}
                        disabled={!selected.includes(option.id) && selected.length >= 2}
                        onChange={() => toggle(option.id)}
                      />
                      Compare {option.name}
                    </label>
                  </div>
                  <div className="evidence">
                    <p className="review">
                      {display(option.reviewer)} · reviewed {date(option.reviewedAt)}
                    </p>
                    <ul className="claims">
                      {option.claims.map((claim) => (
                        <li key={claim.id}>
                          <p>{claim.text}</p>
                          <span className="claim-state">
                            {claim.status} ·{' '}
                            {claim.freshness === 'current'
                              ? 'within stated review basis'
                              : claim.freshness === 'due'
                                ? 'review due'
                                : 'freshness unknown'}
                          </span>
                          <ul className="sources">
                            {option.sources
                              .filter((source) => claim.source_ids.includes(source.id))
                              .map((source) => (
                                <li key={source.id}>
                                  <a href={source.uri}>{source.title}</a>
                                  <span>
                                    Observed {date(source.observed_at)}
                                    {source.revision ? ` · ${source.revision}` : ''}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary>Limits and exact evidence</summary>
                      <ul>
                        {option.limitations.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                      <p>
                        Source observation, review and publication dates describe different events.
                        Review state is advice, not a calibrated probability.
                      </p>
                      <p>
                        Published {date(option.publishedAt)} ·{' '}
                        <a href={`${base}bundles/${option.bundleId}.json`}>
                          Download evidence bundle
                        </a>{' '}
                        ·{' '}
                        <a href={`${base}bundles/${option.bundleId}.json.sha256`}>
                          Integrity sidecar
                        </a>
                      </p>
                    </details>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </main>
      <footer>
        <p>
          Signals helps people and machines compare source-backed knowledge. No analytics, model
          calls, installation or private workspace data in this preview.
        </p>
        <a href={`${base}corpus.json`}>Machine-readable public collection</a>
      </footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Corpus />);
