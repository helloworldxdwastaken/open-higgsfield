/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript contract fixtures. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) { return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) + '.ts' : id, parent, ...rest); };
Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const directory = process.env.SKILLS_FIXTURE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-skills-'));
process.env.STUDIO_SETTINGS_DIR = directory;
const catalog = require('../src/lib/skill-catalog.ts');
const store = require('../src/lib/skill-store.ts');
const recipe = { name: 'My fixture recipe', description: 'Owner-authored prompt', mediaType: 'image', template: 'Photograph {{subject}} in {{setting}}.' };
const request = (body, origin = 'https://studio.example', extra = {}) => new (require('next/server').NextRequest)('https://studio.example/api/skills', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
(async () => {
    if (process.env.SKILLS_FIXTURE_CHILD) { assert.equal((await store.readSkillLibrary()).recipes[0].name, recipe.name); console.log('restart-ok'); return; }
    assert.equal(catalog.BUILTIN_RECIPES.length, 6);
    assert.equal(catalog.SKILL_SOURCES.length, 8);
    assert(catalog.SKILL_SOURCES.every(item => item.execution === 'external-reference' && item.license === 'MIT'));
    for (const item of catalog.BUILTIN_RECIPES) {
        const prompt = catalog.renderRecipe(item.template, Object.fromEntries(catalog.recipeFields(item.template).map(key => [key, 'fixture subject'])));
        assert(prompt.length > 30 && prompt.length <= 2000 && !prompt.includes('{{'));
    }
    assert.equal(catalog.renderRecipe('A {{subject}}.', { subject: '$& {{setting}}' }), 'A $& {{setting}}.');
    assert.throws(() => catalog.renderRecipe(recipe.template, { subject: 'Only subject' }));
    assert.throws(() => catalog.recipeFields('A {{bad-field}}'));
    assert.throws(() => catalog.recipeFields('A {{subject}'));
    assert.throws(() => catalog.recipeFields('A {{constructor}}'));
    assert.throws(() => catalog.renderRecipe('{{subject}} {{subject}} {{subject}} {{subject}} {{subject}}', { subject: 'x'.repeat(500) }));
    let library = await store.readSkillLibrary(); assert.equal(library.revision, 1);
    library = await store.mutateSkillLibrary({ action: 'save', revision: library.revision, recipe });
    const id = library.recipes[0].id;
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    const file = path.join(directory, 'skill-library.json'); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const results = await Promise.allSettled([
        store.mutateSkillLibrary({ action: 'favorite', revision: library.revision, id, favorite: true }),
        store.mutateSkillLibrary({ action: 'favorite', revision: library.revision, id: catalog.BUILTIN_RECIPES[0].id, favorite: true }),
    ]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    assert.match(results.find(item => item.status === 'rejected').reason.message, /ERR_SKILLS_CONFLICT/);
    library = await store.readSkillLibrary();
    const before = fs.readFileSync(file, 'utf8');
    await assert.rejects(store.mutateSkillLibrary({ action: 'save', revision: library.revision, recipe: { ...recipe, template: '{{bad-field}}' } }));
    await assert.rejects(store.mutateSkillLibrary({ action: 'favorite', revision: library.revision, id: 'missing', favorite: true }));
    await assert.rejects(store.mutateSkillLibrary({ action: 'save', revision: library.revision, recipe: { ...recipe, execute: 'shell' } }));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    const child = spawnSync(process.execPath, [__filename], { env: { ...process.env, SKILLS_FIXTURE_CHILD: '1', SKILLS_FIXTURE_DIR: directory }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /restart-ok/);
    const api = require('../src/app/api/skills/route.ts');
    process.env.STUDIO_PUBLIC_ORIGIN = 'https://studio.example';
    assert.equal((await api.GET()).headers.get('cache-control'), 'private, no-store');
    const input = { action: 'remove', revision: library.revision, id };
    assert.equal((await api.POST(request(input, 'https://wrong.example'))).status, 403);
    assert.equal((await api.POST(request(input, ''))).status, 403);
    assert.equal((await api.POST(request(input, undefined, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await api.POST(request('{'))).status, 400);
    assert.equal((await api.POST(request(' '.repeat(17 * 1024)))).status, 413);
    assert.equal((await api.POST(request({ ...input, revision: 1 }))).status, 409);
    const removed = await api.POST(request(input)); assert.equal(removed.status, 200);
    library = await store.readSkillLibrary(); assert.equal(library.recipes.length, 0); assert(!library.favorites.includes(id));
    fs.writeFileSync(file, '{broken');
    assert.equal((await api.GET()).status, 503); assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
    console.log(JSON.stringify({ recipes: 6, licensedReferences: 8, strictTemplates: true, atomicPrivatePersistence: true, optimisticConcurrency: true, restartRead: true, boundedRequestsAndCSRF: true, corruptStorePreserved: true, paidCalls: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { if (!process.env.SKILLS_FIXTURE_CHILD) fs.rmSync(directory, { recursive: true, force: true }); });
