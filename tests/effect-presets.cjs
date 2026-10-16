/* eslint-disable @typescript-eslint/no-require-imports -- Isolated source/cache/HTTP contracts. */
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const Module = require('node:module'); const assert = require('node:assert/strict'); const { spawnSync } = require('node:child_process');
const ts = require('typescript'); const sharp = require('sharp');
const root = path.resolve(__dirname, '..'); const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) { return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) + (id.endsWith('.json') ? '' : '.ts') : id, parent, ...rest); };
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-preset-test-'));
const previousSettings = process.env.STUDIO_SETTINGS_DIR; process.env.STUDIO_SETTINGS_DIR = directory;
const originalFetch = global.fetch; global.fetch = async () => { throw new Error('Unexpected network request'); };
const { EFFECT_PRESETS, getEffectPreset, effectDraft } = require('../src/lib/effect-presets.ts');
const { parseRecipeDraft } = require('../src/lib/recipe-draft.ts');
const { GET } = require('../src/app/api/presets/preview/[id]/route.ts');
const request = id => GET(new Request('https://studio.example/api/presets/preview/' + id), { params: Promise.resolve({ id }) });
(async () => {
  assert.equal(EFFECT_PRESETS.length, 45); assert.equal(new Set(EFFECT_PRESETS.map(item => item.id)).size, 45);
  assert.equal(new Set(EFFECT_PRESETS.map(item => item.previewSource)).size, 45);
  for (const preset of EFFECT_PRESETS) {
    assert.equal(preset.execution, 'prompt-interpretation'); assert.equal(new URL(preset.previewSource).hostname, 'cdn.higgsfield.ai');
    assert.equal(preset.exampleUrl, 'https://higgsfield.ai/effects/examples/' + preset.id);
    for (const intensity of ['subtle', 'balanced', 'dramatic']) {
      const draft = effectDraft(preset, 'Owner supplied art direction', intensity);
      assert(parseRecipeDraft(draft)); assert.equal(draft.requiredImages, 1); assert(!draft.prompt.includes(preset.previewSource)); assert(draft.prompt.includes(intensity));
    }
  }
  assert.equal(getEffectPreset('../../.env'), undefined); assert.equal(getEffectPreset('not-a-preset'), undefined);
  assert.throws(() => effectDraft(EFFECT_PRESETS[0], 'x'.repeat(501))); assert.throws(() => effectDraft(EFFECT_PRESETS[0], '', 'invented'));
  assert.equal((await request('floating-fall')).status, 404); assert.equal((await request('../../.env')).status, 404);
  const preview = path.join(directory, 'preset-previews'); fs.mkdirSync(preview, { mode: 0o700 });
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#c4e080' } }).webp().toBuffer();
  const file = path.join(preview, 'floating-fall.webp'); fs.writeFileSync(file, image, { mode: 0o600 });
  const response = await request('floating-fall'); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/webp'); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  fs.writeFileSync(file, '<script>not an image</script>'); assert.equal((await request('floating-fall')).status, 404);
  fs.unlinkSync(file); fs.symlinkSync(path.join(root, 'package.json'), file); assert.equal((await request('floating-fall')).status, 404); fs.unlinkSync(file);
  // CLI downloader fixture: no actual network, no forwarded provider credentials, all images decoded.
  const loader = path.join(directory, 'mock-fetch.mjs');
  fs.writeFileSync(loader, `import assert from 'node:assert/strict';\nconst image=Buffer.from(${JSON.stringify(image.toString('base64'))},'base64');\nglobalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'cdn.higgsfield.ai');assert.equal(options.redirect,'error');assert(!Object.keys(options.headers).some(name=>/authorization|cookie/i.test(name)));return new Response(image,{headers:{'content-type':'image/webp'}})};\n`);
  const cachedRoot = path.join(directory, 'cache-cli');
  const child = spawnSync(process.execPath, ['--import', loader, 'scripts/cache-preset-previews.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, STUDIO_SETTINGS_DIR: cachedRoot, HF_CREDENTIALS: 'fixture-must-never-be-forwarded' } });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout.trim()).cached, 45); assert(!child.stdout.includes('fixture-must-never-be-forwarded'));
  const cached = path.join(cachedRoot, 'preset-previews'); assert.equal(fs.statSync(cached).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(cached, 'floating-fall.webp')).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cached, 'manifest.json'))).results.length, 45);
  console.log(JSON.stringify({ publicPresetExamples: 45, originalPromptInterpretations: 45, requiredImageAndNoExampleInput: true, finitePreviewIds: true, privateCacheAndNoSymlinks: true, boundedDecoderAndNoAuthForwarding: true, offlineCliCache: true, modelOrPaidCalls: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; if (previousSettings === undefined) delete process.env.STUDIO_SETTINGS_DIR; else process.env.STUDIO_SETTINGS_DIR = previousSettings; fs.rmSync(directory, { recursive: true, force: true }); });
