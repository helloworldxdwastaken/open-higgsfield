# Highfield integration status

## Product direction

Build Highfield as our own creative platform by extending this fork. The existing interface, provider adapters, generation jobs, history and local Director are the foundation for further development. Keep the repository name `open-higgsfield` and preserve upstream attribution.

The owner has confirmed the full platform scope: studios and workflows, the complete interface and button behavior, prompts and skills, MCP/API/CLI, accounts, teams, usage and administration. The scope is broader than a single project workflow. The [build ledger](highfield-scope.json) tracks 38 modules, their present coverage, dependencies, deliverables and acceptance criteria. Entries in that ledger are requirements, not claims of feature parity.

Highfield will own its projects, shot plans, reference assets, presets, account/workspace data and workflow orchestration. Each workflow will use a compatible, explicitly selected local engine or cloud provider. The native Higgsfield API remains an optional connection; our independently implemented workflows must also work with other compatible engines. Voicebox remains the audio foundation, with voice assets to be integrated into Highfield projects.

The next development stage is one complete project workflow:

1. Save a project and turn its brief into an editable shot plan using Director.
2. Generate its shots through the existing provider and job system, retaining references, progress and revisions.
3. Add Voicebox narration and assemble an export from the completed media.

That complete workflow is one delivery stage within the full scope. Cinema, Genjutsu-style motion transfer/object swap/restyling, Katana, effects, marketing/Ads, identities, audio/lipsync, Layers, video editing, Canvas, 3D, agents, specialized studios, sharing and integrations remain tracked until independently implemented and verified. All workflows should share the same authorized project, asset and job services.

## Reusable source and MCP coverage

Three official MIT-licensed repositories are pinned under `third_party/`. Their original license and notices remain in each source tree. [Source provenance](upstream-sources.json) records exact commits, license hashes, contents and external dependencies.

| Source | Available material | Current integration state |
| --- | --- | --- |
| [Higgsfield skills](https://github.com/higgsfield-ai/skills) | Eight public skills and supporting prompt/procedure/script files covering generation, identities, photoshoots, brand kits, marketplace cards, websites, explainers and thumbnails. | Eight skill texts and 86 Markdown documents readable/exportable in-app; eight published prompt contracts adapted. General autonomous execution, original scripts and private hosted enhancers are not ported. |
| [Higgsfield CLI](https://github.com/higgsfield-ai/cli) | Installer, documentation and notices. The released binary implementation is absent from this repository. | Reference source only; no binary installed or installer executed. |
| [Cursor plugin](https://github.com/higgsfield-ai/cursor-plugin) | Plugin/client configuration and a routing command for the hosted Higgsfield MCP. | Source imported; this is not the hosted MCP server implementation. |

To fetch these optional source references after cloning: `git submodule update --init --recursive`. They are excluded from application lint/typechecking and are not automatically loaded, registered as agent skills, or executed by the studio. Ported Highfield skills will need explicit input/output schemas, tool adapters, compatible engines, authorization and run verification.

The [MCP feature inventory](highfield-mcp-inventory.json) maps all 119 Higgsfield connector operations exposed during this audit to the build modules. It covers projects/folders/assets, models, generation/estimates, presets, audio, marketing, Canvas, 3D, analysis, websites and workspaces. It is a reference inventory, not a claim that Highfield implements those tools. Our endpoint exposes six read-only tools, including saved Cinema project list/detail. Web, API, MCP, CLI and plugin availability must be verified separately.

## Accounts and shared platform foundations

Accounts include signup/sign-in/recovery, profiles, sessions, invitations, team membership, owner/admin/member/viewer roles, workspace switching, scoped developer/MCP credentials, usage, budgets and administration. Public product documentation informs the feature requirements; unobserved private admin screens will be independently designed.

The current application has one shared owner workspace. `src/proxy.ts` handles locale routing, while jobs, storage and provider credentials use shared state. Account pages alone cannot provide separate users' access. Before enabling multiple accounts:

1. Add durable identity, membership, project, asset, connection, usage and audit records with workspace ownership.
2. Assign the existing owner's data to an explicit workspace through a repeatable migration and tested restore path.
3. Replace process-global credential selection and unscoped job/media queries with authorized per-workspace services, including workers, events, Range downloads and MCP.
4. Test two workspaces, concurrent provider credentials, every role, invitation/session revocation and workspace cache changes.
5. Verify owner access and recovery before changing the existing ingress or enabling new accounts.

The build ledger contains this release gate. The source imports and specification update do not enable signup, change account access, or modify the running studios.

## Completion contract for UI and workflows

Every button, menu, drop target, keyboard action and agent tool needs an action identifier, required permission, validated inputs, a real service operation, state transitions and a resulting saved entity/job/artifact. Verify loading, empty, invalid, denied, unconfigured, running, partial-result, failed, cancelled and successful states. Refresh and restart must preserve the intended project state.

A copied label, public API model name, imported skill file or unavailable modal does not mark its workflow complete. Completion requires working permissions, durable execution, an inspected real output and reuse/export. Keep schema fixtures, browser checks, actual local inference and paid-provider inference as separate evidence.

## Implemented interface and routing

The repository remains `open-higgsfield`; visible application branding is Highfield. Public Higgsfield navigation and workflow concepts informed an independently authored interface. Retain upstream attribution in LICENSE. Publicly visible shells do not establish that every authenticated workflow has been reproduced.

The original Freepik, Google AI Studio, Vertex and Vercel catalog remains. Native Higgsfield Genjutsu motion transfer, object swap and Cinema use an optional direct connection; these proprietary engines run at Higgsfield. OpenRouter image/video discovery and generation use OpenRouter's documented media APIs. Engine/provider configuration does not prove account entitlement, credits or generation quality.

## Local planning and media

The Director page calls `POST /api/director` with `{engine: "ollama" | "lm-studio", model, brief}`. It produces a shot plan and prompts, never silently submits media generation or switches to cloud inference. Local engine URL settings accept private/loopback hosts; configure their base origin without an API path. Selected models must be installed and compatible. Planning may load the selected model and uses the engine's normal memory settings.

LM Studio supplies text/vision/planning through documented compatible endpoints. Ollama supplies planning for compatible models; its macOS image generation is experimental and is not automatically enabled by selecting a chat model. Draw Things' HTTP service supports image generation when explicitly enabled. General Draw Things video requires its separate CLI/gRPC worker and is not represented as an invented HTTP endpoint.

Voicebox is a separate audio studio. Set `HIGHFIELD_AUDIO_URL` to its authenticated URL to show the Audio link. Linking a studio does not merge their private voice/profile stores.

## MCP client connection

`POST /api/mcp` implements a stateless JSON-response MCP interface (protocol `2025-06-18`). Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`; notifications receive 202. The six read-only tools are `highfield_models`, `highfield_connections`, `highfield_jobs`, `highfield_job`, `highfield_cinema_projects` and `highfield_cinema_project`. There is no media-generation MCP tool or event stream.

Use a client that supports authenticated Streamable HTTP with JSON responses and your deployment's owner authentication. The endpoint shares the studio's owner workspace. Keep the reverse proxy authentication in front of every route, including MCP and media downloads. Credential values and provider authorization headers are never tool results.

Example authenticated request body (authentication headers are supplied by your client):

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

## Workflow limits

Katana-style reference editing, Canvas execution, Ads orchestration, 3D Jutsu, collaborative projects and the complete proprietary preset library are not reproduced by this release. The interface identifies unavailable workflows and routes to configured tools. Director shot planning is a separate working foundation for those workflows. No proprietary model weights, private prompts, account tokens, paid assets or private application code are included.

Generation submissions are not retried automatically after uncertain network errors. The existing durable task store persists accepted operation IDs for polling after a restart. A failure between provider acceptance and receiving/persisting its response still requires checking provider job history before manually submitting again.

Provider adapters can be verified using offline response fixtures. A passing fixture, build or model listing does not mean a paid generation was performed. This release does not claim live validation of paid providers without owner-supplied credentials.

## Primary references

- [Upstream community source](https://github.com/TechBeme/open-higgsfield)
- [Higgsfield official API and SDK](https://github.com/higgsfield-ai/higgsfield-js)
- [Genjutsu Motion Transfer schema](https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/api-reference)
- [Genjutsu Object Swap schema](https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/api-reference)
- [Cinema API schema](https://open.higgsfield.ai/models/higgsfield/cinema-studio/4.0/api-reference)
- [OpenRouter image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenRouter video API](https://openrouter.ai/docs/guides/overview/multimodal/video-generation)
- [LM Studio compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [Ollama API](https://docs.ollama.com/api)
- [Draw Things media kit](https://github.com/drawthingsai/media-generation-kit)

Reviewed 16 October 2026. Public API schemas and access may change; use the current provider discovery and documentation for your deployment.
