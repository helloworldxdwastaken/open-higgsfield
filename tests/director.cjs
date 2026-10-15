/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader exercises server TypeScript without a live Next.js process. */
// Offline contract checks: no inference or paid provider calls.
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-director-'));
process.env.STUDIO_SETTINGS_DIR = directory;
process.env.LM_STUDIO_URL = 'http://127.0.0.1:1234';
process.env.LM_STUDIO_API_KEY = 'fixture-private-token';
process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
const requests = [];
global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    assert.equal(options.redirect, 'error');
    assert.equal(body.stream, false);
    assert.match(body.messages[0].content, /never claim to have generated/);
    if (url.endsWith('/api/chat')) {
        assert.equal(options.headers.Authorization, undefined);
        return Response.json({ message: { content: 'Shot 1: a slow reveal.' } });
    }
    assert.equal(options.headers.Authorization, 'Bearer fixture-private-token');
    return Response.json({ choices: [{ message: { content: 'Shot 1: a close-up.' } }] });
};
(async () => {
    const { createShotPlan } = require('../src/lib/director.ts');
    const { validateLocalEngineUrl } = require('../src/lib/provider-endpoints.ts');
    const ollama = await createShotPlan('ollama', 'local-model', 'A two-shot product film.');
    const lm = await createShotPlan('lm-studio', 'loaded-model', 'A two-shot product film.');
    assert.equal(ollama.generatedMedia, false);
    assert.equal(lm.generatedMedia, false);
    assert.deepEqual(requests.map(r => new URL(r.url).pathname), ['/api/chat', '/v1/chat/completions']);
    for (const bad of ['https://public.example', 'http://169.254.169.254', 'http://user:pass@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1?key=foo']) {
        assert.throws(() => validateLocalEngineUrl(bad));
    }
    await assert.rejects(createShotPlan('unrecognized', 'model', 'brief'));
    global.fetch = async () => Response.json({ choices: [] });
    await assert.rejects(createShotPlan('lm-studio', 'model', 'brief'), /EMPTY_DIRECTOR_RESPONSE/);
    global.fetch = async () => new Response('private provider error text', { status: 401 });
    await assert.rejects(createShotPlan('lm-studio', 'model', 'brief'), /^Error: ERR_DIRECTOR_PROVIDER: 401$/);
    console.log(JSON.stringify({ localPlanningContracts: true, secretIsolation: true, privateHostValidation: true, emptyAndFailedResponses: true, noInferenceOrPaidCalls: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(directory, { recursive: true, force: true }));
