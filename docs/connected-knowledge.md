# Search saved knowledge and reopen topics

Signals searches its saved Library together with explicitly exported Planning decisions,
reviews and reflections, and Principles accepted principles or private study sessions.
This operation uses literal text retrieval, makes no model calls and sends no text to a remote
service. The standalone Library keeps its existing routes and behavior.

Create each export with its producer, then configure the exact file and chosen store instance
ID. Reader paths are operator CLI configuration only; HTTP clients and record content cannot
supply paths, commands or readers. Configure only trusted exports.

```sh
npm run knowledge -- --root /private/signals-workspace configure '[{"owner":"planning-ai","path":"/private/exports/planning.json","instance_id":"my-planning-store"}]'
npm run knowledge -- --root /private/signals-workspace search 'a remembered decision'
npm run knowledge -- --root /private/signals-workspace create 'Project choices'
```

Foreign exports are frozen snapshots. Explicitly regenerate them to refresh; `export_as_of`
reports the producer generation time or null when unknown. Search reports coverage for all
three owners, including unconfigured, unavailable and partial native stores. Foreign native
record JSON is searched in memory along with metadata; summaries omit whole record bodies.
Retrieval rank never establishes evidence strength, applicability, mastery or empirical benefit.

Results carry `selection:{ref:{owner,kind,id,revision,digest},instance_id,owner_epoch}`.
`read SELECTION_JSON` opens that exact record; changed digests are refused. Foreign reads
validate the configured file, owner/store, JSON, kinds and every digest, rejecting symlinks.
Native reads reuse the existing exact provider. No successor is substituted silently.

Topics retain names, selected exact summaries/references, relationships and open questions,
without copying foreign record bodies. Commands: `topics`, `open UUID`, `update UUID PATCH_JSON`
and `export UUID`. Shell-quote JSON arguments. Update body:

```json
{
  "revision": 1,
  "name": "Project choices",
  "selections": [],
  "links": [],
  "questions": ["What would change this choice?"]
}
```

Copy complete selected identities into `selections`. Links are `{from,to,label}` using
`JSON.stringify([owner,instance_id,kind,id,revision,digest])` as each member key. A stale
topic revision requires reopening. Removing selections removes membership only. Existing
frozen selections can retain annotations while an owner is offline; adding a record verifies
its current exact identity first.

After restart, opening compares saved references against the configured owner snapshot:
`current`, `changed`, `missing` or `unavailable`. Current matches the configured frozen export,
not the live underlying source. A successor requires explicit selection. Markdown exports
include original identities, qualification, questions, links and current comparison status;
they are references rather than a complete source archive.

Private `.signals/knowledge-owners.json` and `.signals/topics.json` use existing writer locks,
atomic replacement and private file modes, excluded from public assets. Limits: two readers,
100 topics, 100 members per topic, two million stored UTF8 bytes; failed validation/capacity
preserves the earlier file. Each foreign export allows ten million UTF8 bytes/5,000 records.
No recursive discovery, public admission or native generation occurs.

## HTTP consumers

Use [provider instance/epoch headers](provider-interface.md) on every route below. Existing
loopback Host/origin guards apply; POST also requires JSON and `x-signals-token`. Reader
configuration stays CLI only; `GET knowledge/owners` returns redacted owner/instance status.

| Route                                        | Shape                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET provider/knowledge?q=TEXT&limit=1..100` | `{schema_version:"1.0",records:[{selection,title,summary,updated_at,qualification}],owner_coverage:[{owner,state,observed_at,export_as_of,reason}]}` |
| `POST knowledge/record`                      | `{selection}` → `{selection,content,content_type,export_as_of}`                                                                                      |
| `GET topics`                                 | `{topics:[Topic]}`                                                                                                                                   |
| `POST topics`                                | `{name}` → Topic                                                                                                                                     |
| `GET topics/UUID`                            | `{topic,statuses:[{selection,state,reason,current_ref,export_as_of}]}`                                                                               |
| `POST topics/UUID`                           | Update body above → Topic                                                                                                                            |
| `GET topics/UUID/export`                     | `{content_type:"text/markdown",content}`                                                                                                             |

Topic: `{id,name,revision,created_at,updated_at,members,links,questions}`; members are frozen
search summaries. Errors have bounded code/reason without private paths. Provider operations
are `search_knowledge`, `read_knowledge`, `read_topics`, `edit_topics`; availability grants no authority.

Producer envelope: `{schema_version:"1.0",owner,instance_id,exported_at?,source_revision?,freshness?,records}`.
Records: `{ref,title,summary,updated_at,qualification,content}`. Content is deterministic native
JSON; digest is SHA256 UTF8 content; revision `sha256:<digest>`. Kinds: Planning
`decision|review|reflection`, Principles `principle|study-session`. Extra fields, duplicate
identities, wrong owner/store, unknown kinds and invalid content produce unavailable coverage.
