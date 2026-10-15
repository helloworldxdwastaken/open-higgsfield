/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CommonJS loader tests server adapters without a running application. */
// Offline provider contracts only. All fetch calls are intercepted; no paid generation.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) + '.ts' : id, parent, ...rest);
};
Module._extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, name);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-providers-'));
process.env.STUDIO_SETTINGS_DIR = directory;
process.env.HF_CREDENTIALS = 'fixture-id:fixture-secret';
process.env.OPENROUTER_API_KEY = 'fixture-openrouter-key';
process.env.DRAW_THINGS_URL = 'http://127.0.0.1:7860';
const calls = [];
let responder;
global.fetch = async (url, options = {}) => {
    const call = { url: String(url), options, body: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body };
    calls.push(call);
    return responder(call);
};
const fixtureUrl = 'https://8.8.8.8'; // Literal public address, intercepted; no DNS or requests are made.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRRsAAAAASUVORK5CYII=', 'base64');
const video = Buffer.from('fixture-video-bytes');
const { HiggsfieldProvider, uploadHiggsfieldMedia } = require('../src/providers/higgsfield.ts');
const { OpenRouterProvider } = require('../src/providers/openrouter.ts');
const { DrawThingsProvider } = require('../src/providers/draw-things.ts');
const { HIGHFIELD_VIDEO_CAPABILITIES } = require('../src/models/capabilities/highfield.ts');
const { VIDEO_CAPABILITIES } = require('../src/models/capabilities/video.ts');
const { IMAGE_CAPABILITIES } = require('../src/models/capabilities/image.ts');
const { saveConnections, connectionStatus } = require('../src/lib/connections.ts');
const { validateLocalEngineUrl } = require('../src/lib/provider-endpoints.ts');
const request = (id = 'higgsfield__genjutsu-motion-transfer') => ({ mediaType: 'video', modelId: id, providerModelId: HIGHFIELD_VIDEO_CAPABILITIES[id].provider_model_id, capabilities: HIGHFIELD_VIDEO_CAPABILITIES[id], params: { model_id: id, prompt: 'Make a silver robot.', resolution: '720p' }, media: { video: `${fixtureUrl}/source.mp4`, images: { reference: `${fixtureUrl}/reference.png` } } });
const catalog = {
    image: { data: [{ id: 'fixture/image', name: 'Fixture Image', architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] }, supported_parameters: { resolution: { type: 'enum', values: ['1K', '2K'] }, aspect_ratio: { type: 'enum', values: ['1:1'] } } }] },
    video: { data: [{ id: 'fixture/video', name: 'Fixture Video', supported_durations: [4, 8], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'] }] },
};
(async () => {
    assert.equal(Object.keys(IMAGE_CAPABILITIES).length, 17);
    assert.equal(Object.keys(VIDEO_CAPABILITIES).length, 26);
    assert.equal(HIGHFIELD_VIDEO_CAPABILITIES['higgsfield__genjutsu-motion-transfer'].media_slots.filter(s => s.kind === 'image').length, 8);
    const hf = new HiggsfieldProvider();
    responder = ({ url, options, body }) => {
        assert.equal(url, 'https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0');
        assert.equal(options.headers.Authorization, 'Key fixture-id:fixture-secret');
        assert.equal(options.redirect, 'error');
        assert.equal(body.video_url, `${fixtureUrl}/source.mp4`);
        assert.deepEqual(body.image_urls, [`${fixtureUrl}/reference.png`]);
        return Response.json({ request_id: 'hf_123', status_url: 'https://malicious.example/ignore' });
    };
    const submitted = await hf.submit(request());
    assert.equal(submitted.providerTaskId, 'hf_123');
    assert.deepEqual(submitted.operation, { requestId: 'hf_123' });
    assert.equal(JSON.stringify(submitted).includes('secret'), false);
    const badRefs = request(); badRefs.media.images = {};
    await assert.rejects(hf.submit(badRefs), /REQUIRES_VIDEO_AND_1_TO_8_IMAGES/);
    const badResolution = request(); badResolution.params.resolution = '8K';
    await assert.rejects(hf.submit(badResolution), /INVALID_RESOLUTION/);
    responder = ({ url, options }) => {
        if (url.endsWith('/status')) return Response.json({ status: 'completed', video: { url: `${fixtureUrl}/output.mp4` } });
        assert.equal(options.headers, undefined); return new Response(video, { headers: { 'content-type': 'video/mp4' } });
    };
    const completed = await hf.poll({ mediaType: 'video', providerModelId: request().providerModelId, operation: submitted.operation });
    assert.equal(completed.status, 'COMPLETED'); assert.deepEqual(Buffer.from(completed.assets[0].data), video);
    responder = () => Response.json({ status: 'nsfw', error: 'Private raw provider detail' });
    const failed = await hf.poll({ operation: submitted.operation });
    assert.equal(failed.status, 'FAILED'); assert.equal(failed.error, 'ERR_HIGGSFIELD_NSFW');
    responder = () => new Response('raw private failure', { status: 503 });
    const retry = await hf.poll({ operation: submitted.operation });
    assert.equal(retry.status, 'IN_PROGRESS'); assert.equal(retry.operation.transientErrors, 1);
    responder = () => { throw new Error('Uncertain network response'); };
    const before = calls.length; await assert.rejects(hf.submit(request()), /ERR_HIGGSFIELD_SUBMISSION_UNCERTAIN/);
    assert.equal(calls.length, before + 1, 'Never retry uncertain paid submissions');
    responder = ({ url, options }) => {
        if (url.includes('/files/')) return Response.json({ upload_url: `${fixtureUrl}/signed`, public_url: `${fixtureUrl}/public`, upload_headers: { 'Content-Type': 'image/png' } });
        assert.equal(url, `${fixtureUrl}/signed`); assert.equal(options.method, 'PUT'); assert.equal(options.headers.Authorization, undefined);
        return new Response('', { status: 200 });
    };
    assert.equal(await uploadHiggsfieldMedia(png, 'image/png'), `${fixtureUrl}/public`);
    responder = () => Response.json({ upload_url: 'http://127.0.0.1/forbidden', public_url: `${fixtureUrl}/public`, upload_headers: {} });
    await assert.rejects(uploadHiggsfieldMedia(png, 'image/png'), /UNSAFE_MEDIA_URL/);
    const or = new OpenRouterProvider();
    const orReq = { mediaType: 'image', modelId: 'openrouter__fixture/image', providerModelId: 'fixture/image', capabilities: {}, params: { prompt: 'A cobalt studio.', resolution: '2K', aspect_ratio: '1:1' }, media: {} };
    responder = ({ url, options, body }) => {
        if (url.endsWith('/images/models')) return Response.json(catalog.image);
        if (url.endsWith('/endpoints')) return Response.json({ endpoints: [
            { provider_tag: 'small', supported_parameters: { resolution: { type: 'enum', values: ['1K'] }, aspect_ratio: { type: 'enum', values: ['1:1'] } } },
            { provider_tag: 'large', supported_parameters: { resolution: { type: 'enum', values: ['2K'] }, aspect_ratio: { type: 'enum', values: ['1:1'] } } },
        ] });
        assert.equal(url, 'https://openrouter.ai/api/v1/images'); assert.equal(options.headers.Authorization, 'Bearer fixture-openrouter-key');
        assert.deepEqual(body.provider, { only: ['large'], allow_fallbacks: false });
        return Response.json({ data: [{ b64_json: png.toString('base64'), media_type: 'image/png' }] });
    };
    const image = await or.submit(orReq); assert.equal(image.status, 'COMPLETED'); assert.deepEqual(Buffer.from(image.assets[0].data), png);
    await assert.rejects(or.submit({ ...orReq, params: { ...orReq.params, resolution: '8K' } }), /UNSUPPORTED_RESOLUTION/);
    responder = ({ url, options }) => {
        if (url.endsWith('/videos/models')) return Response.json(catalog.video);
        if (url.includes('/models?output_modalities=video')) return Response.json({ data: [{ id: 'fixture/video', architecture: { input_modalities: ['text', 'image'], output_modalities: ['video'] } }] });
        assert.equal(options.headers.Authorization, 'Bearer fixture-openrouter-key');
        return Response.json({ id: 'or_123', status: 'pending', polling_url: 'https://malicious.example/status' });
    };
    const orJob = await or.submit({ ...orReq, mediaType: 'video', providerModelId: 'fixture/video', params: { prompt: 'A camera pan.', duration: '4', resolution: '720p', aspect_ratio: '16:9' } });
    responder = ({ url, options }) => {
        if (url === 'https://openrouter.ai/api/v1/videos/or_123') return Response.json({ status: 'completed', unsigned_urls: ['https://malicious.example/steal-key'] });
        if (url === 'https://openrouter.ai/api/v1/videos/or_123/content?index=0') {
            assert.equal(options.headers.Authorization, 'Bearer fixture-openrouter-key'); return new Response('', { status: 302, headers: { location: `${fixtureUrl}/video.mp4` } });
        }
        assert.equal(url, `${fixtureUrl}/video.mp4`); assert.equal(options.headers, undefined);
        return new Response(video, { headers: { 'content-type': 'video/mp4' } });
    };
    const orVideo = await or.poll({ mediaType: 'video', operation: orJob.operation });
    assert.deepEqual(Buffer.from(orVideo.assets[0].data), video);
    assert.equal(calls.some(call => call.url.includes('malicious.example')), false);
    responder = ({ url }) => url.includes('/content') ? new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }) : Response.json({ status: 'completed' });
    await assert.rejects(or.poll({ operation: orJob.operation }), /UNSAFE_MEDIA_URL/);
    responder = () => Response.json({ status: 'failed', error: 'Private provider detail' });
    assert.equal((await or.poll({ operation: orJob.operation })).error, 'ERR_OPENROUTER_GENERATION_FAILED');
    let release;
    responder = ({ url, body }) => {
        assert.equal(url, 'http://127.0.0.1:7860/sdapi/v1/txt2img');
        assert.deepEqual(body, { prompt: 'A cobalt studio.', batch_count: 1, batch_size: 1 });
        return new Promise(resolve => { release = () => resolve(Response.json({ images: [png.toString('base64')] })); });
    };
    const draw = new DrawThingsProvider();
    const drawing = draw.submit({ ...orReq, providerModelId: 'current' });
    await assert.rejects(draw.submit({ ...orReq, providerModelId: 'current' }), /LOCAL_ENGINE_BUSY/);
    release(); assert.equal((await drawing).assets[0].mimeType, 'image/png');
    for (const bad of ['http://169.254.169.254', 'http://example.com', 'http://user:pass@127.0.0.1', 'http://127.0.0.1/v1', 'http://127.0.0.1?key=secret']) assert.throws(() => validateLocalEngineUrl(bad));
    for (const good of ['http://127.0.0.1:1234', 'http://localhost:11434', 'http://10.2.3.4:7860']) assert.doesNotThrow(() => validateLocalEngineUrl(good));
    saveConnections({ OPENROUTER_API_KEY: 'fixture-saved-key', LM_STUDIO_URL: 'http://127.0.0.1:1234' });
    saveConnections({ OPENROUTER_API_KEY: '' });
    const settings = JSON.parse(fs.readFileSync(path.join(directory, 'provider-credentials.json')));
    assert.equal(settings.OPENROUTER_API_KEY, 'fixture-saved-key');
    assert.equal(fs.statSync(path.join(directory, 'provider-credentials.json')).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(connectionStatus()).includes('fixture-saved-key'), false);
    assert.throws(() => saveConnections({ LM_STUDIO_URL: 'http://169.254.169.254' }));
    assert.throws(() => saveConnections({ UNRECOGNIZED_KEY: 'no' }));
    saveConnections({}, ['OPENROUTER_API_KEY']); assert.equal(process.env.OPENROUTER_API_KEY, '');
    console.log(JSON.stringify({ original40ModelsRetained: true, nativeHiggsfield3: true, higgsfieldUploads: true, uncertainSubmitNeverRetried: true, openRouterImageAndVideoContracts: true, authenticatedContentDownload: true, noKeyForwardedToOutputHost: true, localImageSingleJob: true, privateEngineValidation: true, secretReadbackAndPermissions: true, noInferenceOrPaidCalls: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(directory, { recursive: true, force: true }));
