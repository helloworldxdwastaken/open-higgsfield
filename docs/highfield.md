# Highfield integration status

## Product direction

Build Highfield as our own creative platform by extending this fork. The existing interface, provider adapters, generation jobs, history and local Director are the foundation for further development. Keep the repository name `open-higgsfield` and preserve upstream attribution.

Highfield will own its projects, shot plans, reference assets, presets and workflow orchestration. Each workflow will use a compatible, explicitly selected local engine or cloud provider. The native Higgsfield API remains an optional connection; our independently implemented workflows must also work with other compatible engines. Voicebox remains the audio foundation, with voice assets to be integrated into Highfield projects.

The next development stage is one complete project workflow:

1. Save a project and turn its brief into an editable shot plan using Director.
2. Generate its shots through the existing provider and job system, retaining references, progress and revisions.
3. Add Voicebox narration and assemble an export from the completed media.

This is the development direction, not a list of completed features. Build and verify that complete workflow before expanding the separate reference-edit, Canvas and Ads workflows. New workflows should share the existing jobs and asset storage.

## Implemented interface and routing

The repository remains `open-higgsfield`; visible application branding is Highfield. Public Higgsfield navigation and workflow concepts informed an independently authored interface. Retain upstream attribution in LICENSE. Publicly visible shells do not establish that every authenticated workflow has been reproduced.

The original Freepik, Google AI Studio, Vertex and Vercel catalog remains. Native Higgsfield Genjutsu motion transfer, object swap and Cinema use an optional direct connection; these proprietary engines run at Higgsfield. OpenRouter image/video discovery and generation use OpenRouter's documented media APIs. Engine/provider configuration does not prove account entitlement, credits or generation quality.

## Local planning and media

The Director page calls `POST /api/director` with `{engine: "ollama" | "lm-studio", model, brief}`. It produces a shot plan and prompts, never silently submits media generation or switches to cloud inference. Local engine URL settings accept private/loopback hosts; configure their base origin without an API path. Selected models must be installed and compatible. Planning may load the selected model and uses the engine's normal memory settings.

LM Studio supplies text/vision/planning through documented compatible endpoints. Ollama supplies planning for compatible models; its macOS image generation is experimental and is not automatically enabled by selecting a chat model. Draw Things' HTTP service supports image generation when explicitly enabled. General Draw Things video requires its separate CLI/gRPC worker and is not represented as an invented HTTP endpoint.

Voicebox is a separate audio studio. Set `HIGHFIELD_AUDIO_URL` to its authenticated URL to show the Audio link. Linking a studio does not merge their private voice/profile stores.

## MCP client connection

`POST /api/mcp` implements a stateless JSON-response MCP interface (protocol `2025-06-18`). Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`; notifications receive 202. The four read-only tools are `highfield_models`, `highfield_connections`, `highfield_jobs`, and `highfield_job`. There is no media-generation MCP tool or event stream.

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
