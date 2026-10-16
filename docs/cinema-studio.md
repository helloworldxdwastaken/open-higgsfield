# Cinema Studio

Open `/{locale}/cinema` from the studio navigation. Create a project or choose one of six original starter storyboards, edit its shots, then save. Shot order, brief, aspect ratio, prompts, camera guidance, light and continuity notes persist in the private owner workspace. Reopening a project preserves its generation associations. Camera and lens suggestions are prompt guidance. The planned edit length can differ from the chosen engine clip duration.

Connect LM Studio or Ollama to turn a brief into validated, editable shots. Planning creates text only. Image and video generation are separate deliberate actions using a compatible curated model, an OpenRouter media model, or the currently selected Draw Things image model. Provider keys/credits or a working local engine are required. The current Cinema UI supports text generation; reference-dependent editing models remain in the regular image/video studios.

An accepted render joins the normal generation library, with authenticated previews and downloads. Each deliberate generation has a durable request ID. Replaying that request returns its accepted task; an uncertain submission blocks repeats. Refresh submission status checks the local saved task association and never submits another job. Do not work around an unresolved request by creating another project: reconcile it with the provider first.

Projects use optimistic versions: a stale tab must reload before saving. Deleting a project keeps its generated media in the main library. Private project JSON lives beside provider settings, outside public source, and is excluded from source/image exports. Back up that private directory together with generation storage. The current file store is for a single application process and one externally authenticated owner workspace.

The six read-only MCP tools include `highfield_cinema_projects` and `highfield_cinema_project`. These read saved storyboards without generating media. Keep the deployment authentication boundary on every route and asset. Multiuser accounts, workspace isolation, assembled timeline rendering, audio placement, export and full Higgsfield feature parity remain separate work.
