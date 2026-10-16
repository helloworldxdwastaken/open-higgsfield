# Current UI and UX target

## Owner decision

Reproduce Higgsfield's **UI and UX**, not its model internals. The owner rejects a merely similar/custom Highfield layout. Preserve the existing AI providers, generation services, authentication, persistent state and data. The current released interface is not a complete 1:1 match.

The owner initially selected the signed-in workspace, then clarified that **the public pages provide sufficient references** and asked for a deployed preview. Proceed from the captured public interface. Do not block all frontend work awaiting account access or invent unobserved private flows.

Reference capture date: 16 October 2026. Desktop viewport1440×1000, mobile390×844. Private captures and measurements are indexed under local `.runtime/project-notes/`; they are not public source assets or production user data.

## Observed screens

| Surface | Public reference | Observed structure |
| --- | --- | --- |
| Explore | `https://higgsfield.ai/` | Compact primary navigation, hero/media carousel, discovery cards and feature sections |
| Image | `https://higgsfield.ai/ai/image` | Large central empty state, optional banner/view controls and bottom prompt/model/settings composer |
| Video | `https://higgsfield.ai/ai/video` | Left Create/Edit/Motion Control tabs, preset/reference/prompt/model controls and Generate; right tutorial/history area |
| Effects | `https://higgsfield.ai/effects` | Desktop large title and ordered preset chips, masonry examples; mobile compact heading, scrolling chips and two-column masonry |
| Effect use | `https://higgsfield.ai/effects/use/floating-fall` | Dedicated page, desktop left input/settings panel and large right preview/history; mobile form-first layout |
| Cinema | `https://higgsfield.ai/generate` | Separate persistent sidebar, project destinations and center composer; its public mobile state differs |

Key measured tokens are Inter body text, Space Grotesk headings, accent `#d1fe17`, black/charcoal surfaces, compact navigation and neutral text. These are measured reference values, not a proposal for another visual direction.

The effects catalog has 50 ordered cards/chips representing 45 distinct slugs. Some repeated presets have different examples. The current deduplicated 45-card gallery and modal interaction are not sufficient for literal reference matching.

## Interaction inventory to implement and verify

1. Navigation, active route, service/menu selection, hover/focus behavior, browser back/deep links and mobile navigation.
2. Image/video model pickers, references and their role labels, file upload/paste/remove, supported settings and validation.
3. Dedicated effect selection/use flow: Change action, Character/optional Location/optional Products, prompt toggle, resolution/aspect settings and history/tutorial states.
4. Composer placement, selected values, loading/submitting/disabled/error/success states and explicit generation intent, connected to existing services.
5. Library/history/detail/preview/download controls, with real private records and no example art presented as generated-user results.
6. Cinema's navigation and project/editor states, retaining the current persistent project/job safeguards.
7. Responsive layouts and keyboard/focus behavior at the reference viewports and supported intermediate sizes.

Maintain a per-screen/action status: observed, implemented, interaction-tested, visually compared, or unknown. Do not describe labels, pictures or nonfunctional controls as finished UX.

## Evidence limits and guardrails

- Public captures include logged-out promotional/account states. Account balances, free generations, discounts, prices and permissions are data—not reusable design tokens. Do not fabricate them in the self-hosted app.
- Preserve the existing owner-access boundary. No new signup, billing, external account login or permission changes are implied by copying a screen.
- Source video clips were deliberately not downloaded in the audit. A blocked-media error or an initial loading skeleton is not the desired normal UI. Normal public configuration/auth reads must remain allowed during capture; block actual generation submissions instead.
- Public screenshots do not prove unobserved private account/team flows. Record those gaps without blocking the visible work the owner approved.
- Keep imported artwork outside public Git, preserve source/license attribution and serve locally cached media rather than browser hotlinks.
- Use a validated preview/reversible frontend change and verify the serving revision before claiming deployment. Preserve the working studio and private stores throughout.
