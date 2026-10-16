/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server source-data contracts. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) { return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) + (id.endsWith('.json') ? '' : '.ts') : id, parent, ...rest); };
Module._extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, name);
const data = require('../src/content/licensed-skill-reference.json');
const catalog = require('../src/lib/skill-catalog.ts');
const { LICENSED_PROMPTS, promptAttribution } = require('../src/lib/licensed-prompts.ts');
const { parseRecipeDraft } = require('../src/lib/recipe-draft.ts');
const reference = require('../src/lib/skill-reference.ts');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
(async () => {
    assert.equal(data.commit, 'f83af0bc1d937c8119099a11f8ebbf5e6fb99819');
    assert.equal(data.sources.length, 8);
    assert.equal(data.sources.reduce((n, source) => n + source.files.length, 0), 86);
    assert.equal(digest(data.license), data.licenseSha256);
    assert.equal(fs.readFileSync(path.join(root, 'public/licenses/higgsfield-skills-MIT.txt'), 'utf8'), data.license);
    for (const source of data.sources) for (const file of source.files) {
        assert.match(file.path, /^higgsfield-[a-z-]+\/(?:SKILL\.md|references\/[a-z0-9-]+\.md)$/);
        assert.equal(digest(file.content), file.sha256);
        const upstream = path.join(root, 'third_party/higgsfield-skills', file.path);
        if (fs.existsSync(upstream)) assert.equal(fs.readFileSync(upstream, 'utf8'), file.content);
    }
    assert.equal(LICENSED_PROMPTS.length, 8);
    for (const prompt of LICENSED_PROMPTS) {
        const recipe = catalog.BUILTIN_RECIPES.find(item => item.id === prompt.id);
        assert.equal(recipe.origin, 'upstream'); assert.equal(recipe.upstreamId, recipe.id);
        catalog.validateRecipe({ name: recipe.name, description: recipe.description, mediaType: recipe.mediaType, template: recipe.template, upstreamId: recipe.id, requiredImages: recipe.requiredImages });
        const attribution = promptAttribution(recipe.id);
        assert.equal(attribution.license, 'MIT'); assert.equal(attribution.commit, data.commit);
        assert(data.sources.some(source => source.files.some(file => file.path === attribution.file)));
    }
    assert.deepEqual(parseRecipeDraft({ prompt: 'An original image', mediaType: 'image' }), { prompt: 'An original image', mediaType: 'image', requiredImages: 0 });
    assert.equal(parseRecipeDraft({ prompt: 'Edit the supplied image', mediaType: 'image', requiredImages: 1 }).requiredImages, 1);
    for (const value of [null, [], { prompt: 'x', mediaType: 'audio' }, { prompt: 'x', mediaType: 'image', requiredImages: -1 }, { prompt: 'x', mediaType: 'image', requiredImages: 4 }, { prompt: 'x'.repeat(2001), mediaType: 'image' }]) assert.equal(parseRecipeDraft(value), undefined);
    for (const id of ['../LICENSE', 'higgsfield-unknown', '%2e%2e', '']) assert.equal(reference.getSkillReference(id), undefined);
    const route = require('../src/app/api/skills/source/[id]/route.ts');
    const { NextRequest } = require('next/server');
    const context = { params: Promise.resolve({ id: 'higgsfield-youtube-thumbnail' }) };
    const single = await route.GET(new NextRequest('https://studio.example/api/skills/source/higgsfield-youtube-thumbnail'), context);
    assert.equal(single.status, 200); assert.equal(single.headers.get('cache-control'), 'private, no-store'); assert.match(single.headers.get('content-type'), /^text\/plain/);
    assert.match(await single.text(), /## Prompt contract/);
    const bundle = await route.GET(new NextRequest('https://studio.example/api/skills/source/higgsfield-youtube-thumbnail?bundle=1'), context);
    const exported = await bundle.json(); assert.equal(exported.license, data.license); assert.equal(exported.files.length, 3);
    assert.equal((await route.GET(new NextRequest('https://studio.example/api/skills/source/higgsfield-youtube-thumbnail?file=../../.env'), context)).status, 404);
    assert.equal((await route.GET(new NextRequest('https://studio.example/api/skills/source/nope'), { params: Promise.resolve({ id: 'nope' }) })).status, 404);
    console.log(JSON.stringify({ licensedSkills: 8, verbatimDocuments: 86, adaptedPromptContracts: 8, contentAndLicenseFingerprints: true, draftReferenceValidation: true, inertTextAndBundleExports: true, sourcePathAllowlist: true, scriptsOrModelCalls: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
