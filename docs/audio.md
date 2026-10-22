# VoiceLab — integrated audio workspace

VoiceLab is part of Highfield at `/:locale/audio`. It uses the existing
Highfield session cookie for every API and media request. It has no separate
account or password. Navigation back to image and video stays on the same host.

## Workflows

- Text to Speech: choose a preset or a saved voice clone, enter up to 5,000
  characters, choose a supported language, set speed and volume normalization,
  generate, play and download a WAV file.
- Voices: search the engine's preset voices, upload or record a 2–30 second
  sample, confirm permission, save a named clone, preview it and use it for
  speech. Both the library and voice picker have play/pause previews. Preset
  previews are generated locally on explicit request and cached privately; they
  stay out of normal generation history. Clone previews play the uploaded
  reference.
- Speech to Text: upload an audio file up to 25 MB, use language detection or a
  language hint, edit the transcript, and export TXT or JSON.
- History: inspect processing, completed and failed requests, play/download
  finished speech, reopen transcripts, and delete owned items.

The editor, voice list, cloning wizard and transcription upload use the public
[ElevenLabs speech](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech),
[cloning](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning)
and [transcription](https://elevenlabs.io/docs/eleven-creative/playground/speech-to-text)
product screenshots as interface references. Highfield is independently operated.
The authenticated ElevenLabs application was not used as an observed reference.
The complete ElevenLabs product and every private interaction are not implemented.

## Engine adapter contract

`src/lib/audio-service.ts` is the only place that talks to a speech engine. It
is a replaceable adapter: the UI and the store never see engine details, so a
different engine can be dropped in by re-pointing this one module. The engine
location is configured with `HIGHFIELD_VOICEBOX_URL` (the variable name
predates VoiceLab and is retained for compatibility); `STUDIO_PUBLIC_ORIGIN`
must hold the exact browser origin. The browser never contacts the engine
directly or receives its private URL.

The adapter expects an HTTP JSON service that implements:

- `GET /models/status` → `{models: [{model_name, downloaded|is_downloaded}]}` —
  capability discovery. The adapter reads `online`, `speech`, `cloning` and
  `transcription` from the presence of three named models; a replacement engine
  may satisfy the same shape with its own model names.
- `GET /profiles/presets/kokoro` → `{voices: [{voice_id, name, gender, language}]}` —
  the preset voice catalog. Preset voices carry a fixed language.
- `POST /profiles` → `{id}` — create a voice profile
  (`voice_type: "preset" | "cloned"`, language, engine selection fields).
- `POST /profiles/:id/samples` (multipart `file`, `reference_text`) → `{id}` —
  attach a cloning reference sample to a profile.
- `DELETE /profiles/:id` → any response; 404 is tolerated.
- `POST /generate` → `{id}` — start a speech job
  (`profile_id`, `text`, `language`, `engine`, `normalize`).
- `GET /history/:id` → `{status: "processing" | "completed" | "failed",
  duration}` — durable job state. Accepted backend IDs survive restart and are
  reconciled through this endpoint.
- `GET /audio/:id` → WAV bytes — completed speech output.
- `GET /samples/:id` → audio bytes — a profile's reference sample when it is
  not mirrored locally.
- `DELETE /history/:id` → any response; 404 is tolerated.
- `POST /transcribe` (multipart `file`, optional `language`, `model`) →
  `{text, duration}` — synchronous transcription.

Requests must include an `Origin` header identifying `STUDIO_PUBLIC_ORIGIN`.
Failures must surface as non-2xx; the adapter maps 400/422 to input errors,
404s on DELETE to success, and anything else to an engine error. A replacement
engine that meets this contract needs no UI changes.

## Capability gaps to state honestly

The current adapter cannot satisfy every control the reference interface
shows. The UI disables these explicitly rather than pretending:

- Stability, similarity and style exaggeration are not exposed by the engine;
  the controls render disabled and say so.
- Cloned voices are not assigned a model size in the picker badge; the "82M"
  badge shows for preset voices only.
- Speaker diarization and word timestamps are not included.
- Speed other than 1× requires FFmpeg on the Highfield server.
- CPU inference latency and quality depend on the installed model; availability
  is read from the engine, not assumed.

## Ownership and persistence

`src/lib/audio-service.ts` is the allowlisted engine adapter. It never exposes
an arbitrary engine proxy. `audio-store.ts` stores a separate private library
for each signed-in user beneath the configured user storage root. Backend
profile and job identifiers are kept in that private store and stripped from
normal API responses. Voice samples, transcription inputs and generated WAV
copies are kept under the same user's media directory and count against that
workspace's existing quota.

The current store assumes one Highfield writer process. Atomic file replacement
and a process-wide per-user queue serialize library updates. Generation requests
carry an idempotency key, and accepted backend job IDs survive restart. Speech
jobs are reconciled through the engine's durable queue. Interrupted synchronous
transcriptions eventually show failure while keeping the original recording.
No failed or uncertain request is automatically resubmitted.

All `/api/audio` routes require the existing Highfield session. Mutations require
the configured same origin and bounded input. Media routes check user ownership,
return private/no-store headers, and support byte ranges. Output paths,
credentials and backend identifiers are not returned to the browser.

## Checks

`npm run test:audio` covers user isolation, persistent state, duplicate
submission, CSRF, sanitized output, ranges, editing and deletion with an
isolated engine fixture. Real local inference and browser checks are separate
release evidence. A passing fixture is not evidence of voice similarity or
reference-model equivalence.
