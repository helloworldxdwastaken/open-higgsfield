/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript server fixtures. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-audio-'));
process.env.OPEN_HIGGSFIELD_STORAGE_DIR = directory;
process.env.HIGHFIELD_VOICEBOX_URL = 'http://audio-engine.invalid';
process.env.STUDIO_PUBLIC_ORIGIN = 'https://studio.example';
const USER = 'a'.repeat(32), OTHER = 'b'.repeat(32);
const resolve = Module._resolveFilename;
const load = Module._load;
Module._resolveFilename = function (id, parent, ...rest) { return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) + '.ts' : id, parent, ...rest); };
Module._load = function (id, parent, ...rest) { if (id === '@/lib/users') return { getRequestSessionUser: async request => { const cookie = request.headers.get('cookie'); return cookie === 'hf_session=fixture' ? { id: USER } : cookie === 'hf_session=other' ? { id: OTHER } : null; } }; return load.call(this, id, parent, ...rest); };
Module._extensions['.ts'] = (module, name) => module._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, name);
const store = require('../src/lib/audio-store.ts');
const service = require('../src/lib/audio-service.ts');
const route = require('../src/app/api/audio/route.ts');
const mediaRoute = require('../src/app/api/audio/[id]/media/route.ts');
const { NextRequest } = require('next/server');
let submissions = 0, contacts = 0, profileDeletes = 0, transcribeCalls = 0, sampleUploadsFail = false;
global.fetch = async (url, init) => {
    assert.equal(init.headers.Origin, 'https://studio.example', 'server calls must identify the allowed origin');
    contacts++;
    const endpoint = new URL(url).pathname;
    if (endpoint === '/models/status') return Response.json({ models: ['kokoro', 'chatterbox-tts', 'whisper-base'].map(model_name => ({ model_name, downloaded: true })) });
    if (endpoint === '/profiles/presets/kokoro') return Response.json({ voices: [{ voice_id: 'af_heart', name: 'Heart', gender: 'female', language: 'en' }] });
    if (endpoint === '/profiles') return Response.json({ id: randomUUID() });
    if (endpoint.startsWith('/profiles/') && endpoint.endsWith('/samples')) { if (sampleUploadsFail) return Response.json({ error: 'fixture sample rejection' }, { status: 400 }); return Response.json({ id: randomUUID() }); }
    if (endpoint.startsWith('/profiles/') && init?.method === 'DELETE') { profileDeletes++; return new Response(null, { status: 204 }); }
    if (endpoint === '/generate') { submissions++; return Response.json({ id: randomUUID() }); }
    if (endpoint === '/transcribe') { transcribeCalls++; return new Response(null, { status: 500 }); }
    if (endpoint.startsWith('/history/') && init?.method === 'DELETE') return new Response(null, { status: 404 });
    if (endpoint.startsWith('/history/')) return Response.json({ status: 'completed', duration: 4.2, audio_path: '/private/never-expose.wav' });
    if (endpoint.startsWith('/audio/')) return new Response(Buffer.from('RIFF-fixture-only-WAVE'));
    throw new Error('Fixture unexpected endpoint');
};
function request(url, method = 'GET', body, headers = {}) { return new NextRequest(url, { method, headers: { cookie: 'hf_session=fixture', ...(method !== 'GET' ? { origin: 'https://studio.example', 'content-type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
function formRequest(url, form) { return new NextRequest(url, { method: 'POST', headers: { cookie: 'hf_session=fixture', origin: 'https://studio.example' }, body: form }); }
async function routePost(form) { return route.POST(formRequest('https://studio.example/api/audio', form)); }
async function latestTranscript(userId) { return (await store.readAudioStore(userId)).jobs.filter(job => job.kind === 'transcript').at(-1); }
(async () => {
    try {
        const generated = await Promise.all(Array.from({ length: 3 }, () => service.generateAudio(USER, { text: 'Local audio fixture.', presetId: 'af_heart', language: 'en', requestId: 'a'.repeat(36) })));
        assert.equal(submissions, 1, 'concurrent duplicate requests must submit once');
        assert.equal(new Set(generated.map(job => job.id)).size, 1);
        assert.deepEqual((await service.getAudioDashboard(OTHER)).jobs, []);
        const dashboard = await service.getAudioDashboard(USER);
        assert.equal(dashboard.jobs[0].status, 'completed');
        assert.equal(dashboard.voices.length, 1);
        assert.doesNotMatch(JSON.stringify(dashboard), /backendId|audio_path|private\/|requestId|sampleId/);
        assert.equal(fs.statSync(path.join(store.audioDirectory(USER), 'library.json')).mode & 0o777, 0o600);
        const id = generated[0].id;
        await assert.rejects(service.audioMedia(OTHER, id, 'job'), /ERR_AUDIO_NOT_FOUND/);
        await assert.rejects(service.deleteAudio(OTHER, id, 'job'), /ERR_AUDIO_NOT_FOUND/);
        await assert.rejects(service.generateAudio(USER, { text: 'x', voiceId: dashboard.voices[0].id, language: 'he', requestId: randomUUID() }), /ERR_AUDIO_INPUT/);
        assert.throws(() => store.audioMediaPath(USER, '../../private', 'wav'), /ERR_AUDIO_NOT_FOUND/);
        assert.throws(() => store.audioDirectory('../../owner'), /INVALID_STORAGE_USER/);
        let result = await mediaRoute.GET(request(`https://studio.example/api/audio/${id}/media`, 'GET', undefined, { range: 'bytes=0-3' }), { params: Promise.resolve({ id }) });
        assert.equal(result.status, 206); assert.equal(Buffer.from(await result.arrayBuffer()).toString(), 'RIFF');
        assert.match(result.headers.get('cache-control'), /private, no-store/);
        result = await mediaRoute.GET(request(`https://studio.example/api/audio/${id}/media`, 'GET', undefined, { range: 'bytes=900-999' }), { params: Promise.resolve({ id }) });
        assert.equal(result.status, 416);
        const before = contacts;
        assert.equal((await route.GET(request('https://studio.example/api/audio', 'GET', undefined, { cookie: '' }))).status, 401);
        assert.equal((await route.POST(request('https://studio.example/api/audio', 'POST', { action: 'generate' }, { origin: 'https://evil.example' }))).status, 403);
        assert.equal((await route.POST(request('https://studio.example/api/audio', 'POST', { action: 'generate' }, { origin: '' }))).status, 403);
        assert.equal(contacts, before, 'unauthorized requests must never reach the engine');
        const form = new FormData(); form.set('file', new File(['x'], 'payload.exe'));
        assert.throws(() => service.audioFile(form), /ERR_AUDIO_FILE/);
        const transcriptId = randomUUID();
        await store.withAudioStore(USER, async state => { state.jobs.push({ id: transcriptId, kind: 'transcript', requestId: randomUUID(), name: 'recording.wav', text: 'Original.', voiceName: '', duration: 2, status: 'completed', speed: 1, createdAt: new Date().toISOString() }); });
        await assert.rejects(service.editTranscript(OTHER, transcriptId, 'Attack.'), /ERR_AUDIO_NOT_FOUND/);
        assert.equal((await service.editTranscript(USER, transcriptId, 'Edited.')).text, 'Edited.');
        const preview = await service.previewAudio(USER, { presetId: 'af_heart' });
        assert.ok(preview.job.id);
        assert.equal((await service.getAudioJob(USER, preview.job.id)).status, 'completed');
        assert.equal((await service.getAudioDashboard(USER)).jobs.some(job => job.id === preview.job.id), false, 'preview must not pollute history');
        const beforePreviewReplay = submissions;
        assert.equal((await service.previewAudio(USER, { presetId: 'af_heart' })).job.id, preview.job.id);
        assert.equal(submissions, beforePreviewReplay, 'cached preview must not generate again');
        await assert.rejects(service.getAudioJob(OTHER, preview.job.id), /ERR_AUDIO_NOT_FOUND/);
        await service.deleteAudio(USER, id, 'job');
        assert.equal((await service.getAudioDashboard(USER)).jobs.length, 1);
        // Reloading the store must preserve private state; a second user never sees it.
        delete require.cache[require.resolve('../src/lib/audio-store.ts')];
        assert.equal((await require('../src/lib/audio-store.ts').readAudioStore(USER)).jobs[0].text, 'Edited.');
        // Route-level ownership: a second session cannot read, edit or delete another user's job, and media never leaks.
        const routeModule = require('../src/app/api/audio/[id]/route.ts');
        const hijack = await routeModule.GET(request(`https://studio.example/api/audio/${transcriptId}`, 'GET', undefined, { cookie: 'hf_session=other' }), { params: Promise.resolve({ id: transcriptId }) });
        assert.equal(hijack.status, 404);
        const hijackPatch = await routeModule.PATCH(request(`https://studio.example/api/audio/${transcriptId}`, 'PATCH', { text: 'Hijack.' }, { cookie: 'hf_session=other' }), { params: Promise.resolve({ id: transcriptId }) });
        assert.equal(hijackPatch.status, 404);
        const hijackDelete = await routeModule.DELETE(request(`https://studio.example/api/audio/${transcriptId}?kind=job`, 'DELETE', undefined, { cookie: 'hf_session=other' }), { params: Promise.resolve({ id: transcriptId }) });
        assert.equal(hijackDelete.status, 404);
        const leaked = await mediaRoute.GET(request(`https://studio.example/api/audio/${generated[0].id}/media`, 'GET', undefined, { cookie: 'hf_session=other' }), { params: Promise.resolve({ id: generated[0].id }) });
        assert.equal(leaked.status, 404);
        // Failed generation keeps a visible failed state and never resubmits behind the user's back.
        const failing = global.fetch;
        global.fetch = async (url, init) => { const endpoint = new URL(url).pathname; if (endpoint === '/generate') { submissions++; return Response.json({ error: 'fixture synthesis failure' }, { status: 500 }); } return failing(url, init); };
        const beforeFailure = submissions;
        await assert.rejects(service.generateAudio(USER, { text: 'Local audio fixture.', presetId: 'af_heart', language: 'en', requestId: randomUUID() }), /ERR_AUDIO_ENGINE/);
        assert.equal(submissions, beforeFailure + 1);
        assert.equal((await service.getAudioDashboard(USER)).jobs.some(job => job.status === 'failed'), false, 'an engine rejection before job creation must not fabricate a failed job');
        global.fetch = failing;
        // A rejected clone upload must not leave a partial voice or a leaked backend profile.
        const cloneForm = new FormData(); cloneForm.set('action', 'clone'); cloneForm.set('file', new File(['RIFF-fixture'], 'sample.wav', { type: 'audio/wav' })); cloneForm.set('name', 'Fixture Clone'); cloneForm.set('description', ''); cloneForm.set('language', 'en'); cloneForm.set('consent', 'true');
        sampleUploadsFail = true;
        const clonePost = await routePost(cloneForm);
        assert.equal(clonePost.status, 400, 'a rejected sample upload maps to a client-input error');
        assert.equal((await service.getAudioDashboard(USER)).voices.every(voice => voice.name !== 'Fixture Clone'), true, 'a failed clone must not surface as a saved voice');
        assert.ok(profileDeletes >= 1, 'a failed clone must clean up its backend profile');
        const mediaBefore = fs.readdirSync(path.join(store.audioDirectory(USER), 'media'));
        sampleUploadsFail = false;
        // A transcription engine failure must land in a durable failed job that keeps its input.
        const transcribeForm = new FormData(); transcribeForm.set('action', 'transcribe'); transcribeForm.set('file', new File(['RIFF-fixture'], 'talk.wav', { type: 'audio/wav' })); transcribeForm.set('language', 'auto'); transcribeForm.set('requestId', randomUUID());
        const transcribePost = await routePost(transcribeForm);
        assert.equal(transcribePost.status, 201);
        const transcribeResult = await transcribePost.json();
        assert.equal(transcribeResult.job.status, 'failed');
        const failed = await latestTranscript(USER);
        assert.equal(failed.id, transcribeResult.job.id);
        assert.ok(fs.readdirSync(path.join(store.audioDirectory(USER), 'media')).includes(`${failed.id}.${failed.sourceExtension}`), 'a failed transcription must keep the original recording');
        const transcribeAgain = new FormData(); transcribeAgain.set('action', 'transcribe'); transcribeAgain.set('file', new File(['RIFF-fixture'], 'talk.wav', { type: 'audio/wav' })); transcribeAgain.set('language', 'auto'); transcribeAgain.set('requestId', failed.requestId);
        const replay = await routePost(transcribeAgain);
        assert.equal(transcribeCalls, 1, 'a failed transcription must not be silently resubmitted');
        assert.equal((await replay.json()).job.id, failed.id, 'a replayed transcription request must return the original failed job');
        // The failed clone must not have left media behind either.
        assert.equal(fs.readdirSync(path.join(store.audioDirectory(USER), 'media')).includes(`${failed.id}.${failed.sourceExtension}`), true);
        assert.ok(mediaBefore.every(name => !name.startsWith('sample.wav')), 'no clone sample file leaks under an engine filename');
        console.log('PASS audio: isolation, restart persistence, idempotency, media ranges, CSRF, sanitization, transcript editing, deletion, ownership and failure semantics');
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
