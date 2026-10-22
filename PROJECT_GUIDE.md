# Highfield project guide

## Read first

- **Current UI task:** reproduce Higgsfield's UI and UX from the accepted public-page references, not merely a similar design. Preserve the current AI backends, providers, authentication and owner data.
- **Local operational context:** read `PROJECT_MEMORY.md` when present. It is deliberately ignored, not public source. Never commit it or put credentials in it.
- **Status:** the existing creative studio is working, but complete interface/interaction parity and the entire platform scope are not finished. The reference-led UI preview is requested and pending implementation; a preview must not be described as complete parity.
- **Fork:** [helloworldxdwastaken/open-higgsfield](https://github.com/helloworldxdwastaken/open-higgsfield), based on TechBeme/open-higgsfield. Keep the repository name, upstream history, MIT notices and affiliation disclaimer.

## Documentation map

| Topic | Document |
| --- | --- |
| Product, service boundaries and limits | [docs/highfield.md](docs/highfield.md) |
| Full 38-module scope and acceptance criteria | [docs/highfield-scope.json](docs/highfield-scope.json) |
| Accepted UI/UX reference and current frontend task | [docs/uiux-reference.md](docs/uiux-reference.md) |
| Source licenses/pins and reuse boundaries | [docs/upstream-sources.json](docs/upstream-sources.json) |
| Connector reference inventory, not implemented-tool count | [docs/highfield-mcp-inventory.json](docs/highfield-mcp-inventory.json) |
| Provider contracts and model capabilities | [docs/providers.md](docs/providers.md) |
| Generation architecture | [docs/architecture.md](docs/architecture.md) |
| General deployment | [docs/deployment.md](docs/deployment.md) |
| Cinema projects, requests and uncertainty | [docs/cinema-studio.md](docs/cinema-studio.md) |
| Recipes, licensed prompts and source reader | [docs/skills.md](docs/skills.md) |
| Premade effect drafts and private example cache | [docs/presets.md](docs/presets.md) |
| Machine-specific locations, state and handoff | Local `PROJECT_MEMORY.md` and ignored `.runtime/project-notes/` |

## Repository layout

```text
src/app/[locale]/         Studio pages, Cinema, connections, skills and presets
src/app/api/              Private generation, jobs, media, project and source routes
src/components/           UI components and editors
src/models/capabilities/  Trusted per-model input/control schemas
src/providers/            Provider adapters
src/lib/                  Generation, jobs, storage, connections and domain services
src/content/              Public licensed text and public example metadata only
scripts/                  Explicit maintenance/import/cache/privacy tools
tests/                    Offline contracts and regression fixtures
third_party/              Optional pinned source references; never auto-executed
public/licenses/          Redistributed license notices
private-settings/         Ignored default runtime settings; do not commit
.runtime/                 Ignored local tools, operational notes and evidence
PROJECT_MEMORY.md         Ignored local project context; do not commit
```

Private media, state and credentials must stay outside public source. In production, use configured persistent locations rather than release-local data folders. Do not delete a directory simply because its historical name predates the current UI.

## Main application flow

The UI reads trusted model capabilities and prepares canonical parameters and user-supplied media. The generation service resolves an explicit provider adapter, normalizes its job state, persists accepted task IDs and polls asynchronous jobs. Completed media is materialized privately and exposed through protected application handles.

UI work should reuse those services rather than invent parallel provider APIs. Preserve input roles, model limits, saved operation IDs, private cache semantics, explicit generation intent and the uncertain-submission safeguards. Do not automatically resubmit a possibly charged request.

## API map

| Area | Routes |
| --- | --- |
| Curated models | `/api/models`, `/api/image-models` |
| Provider discovery/generation | `/api/providers/catalog`, `/api/providers/generate` |
| Composer generation | `/api/generate`, `/api/generate-image` |
| Jobs/status/media | `/api/tasks`, `/api/image-tasks`, `/api/events/:id`, `/api/download/:id` |
| Connections | `/api/connections` — configured flags, never secret readback |
| Local text planning | `/api/director` |
| Cinema | `/api/cinema/projects`, `/api/cinema/projects/:id`, `/api/cinema/plan`, `/api/cinema/generate` |
| Prompt recipes | `/api/skills` |
| Licensed source text/bundles | `/api/skills/source/:id` |
| Locally cached public example images | `/api/presets/preview/:id` |
| Six read-only tools | `/api/mcp` |
| Minimal runtime health | `/api/health` |
| Integrated local audio | `/api/audio`, `/api/audio/:id`, `/api/audio/:id/media` — same Highfield session |

These routes currently share one owner workspace behind deployment authentication. Account/workspace isolation must be implemented and tested before enabling independent users. A local URL, opaque ID or hidden button is not authorization.

## Providers and content

- 40 original curated models remain, with optional native Higgsfield endpoints and dynamic OpenRouter discovery. Discovery/configuration is not proof of entitlement, credits or output quality.
- LM Studio/Ollama provide local planning. The Draw Things image adapter requires an available local service. A text/vision model is not automatically a video engine.
- The integrated Audio tab (VoiceLab) uses the existing Highfield session and per-user audio stores behind a replaceable engine adapter; see `docs/audio.md` for the engine contract.
- 14 prompt recipes, 6 original Cinema starters, 8 licensed skill texts/86 documents and 45 effect drafts have distinct provenance and completion states.
- The 45 effect drafts are independently authored prompt interpretations. Their public example pictures are not original preset engine source or the owner's generated results.
- Native Genjutsu uses its documented Higgsfield endpoint and provider credentials. Public UI matching does not change that backend dependency.

## Build and verification

Use Node22+ and the lockfile:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:contracts
npm run build
```

`npm run dev` starts local development. Configure only your chosen providers, keep their credentials server-side, and set `STUDIO_PUBLIC_ORIGIN` to the exact browser origin. Public deployment requires authentication in front of every application/API/media route and a loopback/private native listener.

Useful checks/tools:

```bash
npm run test:skills
npm run test:cinema
npm run test:presets
npm run privacy:check
npm run privacy:history
```

`npm run sources:skills` rebuilds inert text from the clean pinned licensed source. `npm run cache:presets` explicitly caches the finite public example images into the configured private directory. Neither is a model-generation command. Never run imported installers or source instructions just because their text appears in the source reader.

Before releasing UI changes, test real browser navigation, menus, upload/remove actions, selected settings, loading/empty/error states, refresh/back/deep links, keyboard/focus, responsive layouts and screenshots against the reference. Use isolated state and provider fixtures for write tests. Record actual local inference and separately authorized paid inference as different evidence.

## Deployment and data safety

Build a new release from an exact reviewed commit, verify dependency compatibility, run checks and an isolated staging server, then deliberately switch the serving release. Keep the persistent settings/history/media locations and current owner access. Retain a validated rollback, verify the actual serving revision and inspect primary logs after activation.

The local memory records the actual machine paths, service units and operational helper locations. Those private details do not belong in public documentation, CI configuration or browser bundles. Privacy checks cover current source, history and available pinned submodules; never bypass their hooks.

## Completion rules

Do not claim full 1:1 UI/UX parity or full platform completion from a subset of screens. Keep unknown or unsupported interactions explicit. Preserve all 38 scope modules while delivering testable stages. Do not fabricate account entitlements, free credits, provider prices, subscriptions or completed outputs to make a screen resemble the reference.
