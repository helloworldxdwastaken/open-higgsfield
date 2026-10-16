/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server TypeScript contract fixtures. */
// Filesystem and HTTP-boundary tests only. No model inference, paid calls or live server.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
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
const store = require('../src/lib/cinema-store.ts');
const directory = process.env.CINEMA_FIXTURE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-cinema-'));
process.env.STUDIO_SETTINGS_DIR = directory;
const file = path.join(directory, 'cinema-projects.json');
const shot = () => ({ id: randomUUID(), title: 'Opening shot', prompt: 'A blue ceramic mug in warm window light.', seconds: 5, camera: 'Slow push in', lens: '50mm', lighting: 'Soft daylight', notes: '' });
const job = (state = 'accepted') => ({ requestId: randomUUID(), fingerprint: 'a'.repeat(64), state, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...(state === 'accepted' ? { taskId: 'fixture-task' } : {}) });
const snapshot = value => JSON.parse(JSON.stringify(value));
const update = value => ({ title: value.title, brief: value.brief, aspectRatio: value.aspectRatio, shots: value.shots });
const request = (url, method = 'GET', body, headers = {}) => new (require('next/server').NextRequest)(url, { method, headers: { ...(method !== 'GET' ? { 'content-type': 'application/json', origin: 'https://studio.example' } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
(async () => {
    if (process.env.CINEMA_FIXTURE_CHILD) {
        const current = await store.getCinemaProject(process.env.CINEMA_FIXTURE_PROJECT);
        assert.equal(current.id, process.env.CINEMA_FIXTURE_PROJECT);
        assert.equal(current.generationHistory[0].taskId, 'fixture-task');
        console.log('restart-read-ok'); return;
    }
    assert.deepEqual(await store.listCinemaProjects(), []);
    fs.chmodSync(directory, 0o755);
    let project = await store.createCinemaProject({ title: 'Owner film', brief: 'A two-shot coffee scene.' });
    assert.equal(project.version, 1); assert.deepEqual(project.generationHistory, []);
    assert.match(project.id, /^[0-9a-f-]{36}$/);
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    project.shots.push(shot());
    project = await store.updateCinemaProject(project.id, 1, update(project));
    assert.equal(project.version, 2);
    const race = await Promise.allSettled([
        store.updateCinemaProject(project.id, project.version, { ...update(project), title: 'First concurrent save' }),
        store.updateCinemaProject(project.id, project.version, { ...update(project), title: 'Second concurrent save' }),
    ]);
    assert.equal(race.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(race.find(value => value.status === 'rejected').reason.message, 'ERR_CINEMA_VERSION_CONFLICT');
    project = await store.getCinemaProject(project.id);
    assert.equal(project.version, 3);
    await assert.rejects(store.deleteCinemaProject(project.id, 2), /ERR_CINEMA_VERSION_CONFLICT/);
    const noChange = fs.readFileSync(file, 'utf8');
    await assert.rejects(store.mutateCinemaProject(project.id, project.version, current => { current.title = 'Must not persist'; throw new Error('Fixture transform failed'); }), /Fixture transform failed/);
    assert.equal(fs.readFileSync(file, 'utf8'), noChange);
    await assert.rejects(store.mutateCinemaProject(project.id, project.version, current => ({ ...current, shots: [...current.shots, current.shots[0]] })), /ERR_CINEMA_VALIDATION/);
    assert.equal(fs.readFileSync(file, 'utf8'), noChange);
    const accepted = job();
    project = await store.mutateCinemaProject(project.id, undefined, current => ({ ...current, shots: current.shots.map(item => ({ ...item, image: accepted })), generationHistory: [{ ...accepted, shotId: current.shots[0].id, mediaType: 'image' }] }));
    const forged = snapshot(update(project));
    forged.shots[0].image = { taskId: 'forged', requestId: randomUUID() };
    forged.shots[0].video = { taskId: 'forged', state: 'accepted' };
    forged.generationHistory = [];
    project = await store.updateCinemaProject(project.id, project.version, forged);
    assert.equal(project.shots[0].image.requestId, accepted.requestId);
    assert.equal(project.shots[0].video, undefined);
    assert.equal(project.generationHistory.length, 1);
    await assert.rejects(store.mutateCinemaProject(project.id, undefined, current => ({ ...current, generationHistory: [] })), /ERR_CINEMA_VALIDATION/);
    const child = spawnSync(process.execPath, [__filename], { env: { ...process.env, CINEMA_FIXTURE_CHILD: '1', CINEMA_FIXTURE_DIR: directory, CINEMA_FIXTURE_PROJECT: project.id }, encoding: 'utf8' });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /restart-read-ok/);
    // A second independently loaded bundle must share the same operation queue.
    const storeName = require.resolve('../src/lib/cinema-store.ts'); delete require.cache[storeName];
    const secondBundle = require('../src/lib/cinema-store.ts');
    const bundleRace = await Promise.allSettled([
        store.updateCinemaProject(project.id, project.version, { ...update(project), title: 'Bundle one' }),
        secondBundle.updateCinemaProject(project.id, project.version, { ...update(project), title: 'Bundle two' }),
    ]);
    assert.equal(bundleRace.filter(value => value.status === 'fulfilled').length, 1);
    project = await store.getCinemaProject(project.id);
    const unresolved = { ...job('uncertain'), fingerprint: 'b'.repeat(64) };
    project = await store.mutateCinemaProject(project.id, project.version, current => ({ ...current, generationHistory: [...current.generationHistory, { ...unresolved, shotId: current.shots[0].id, mediaType: 'video' }] }));
    // Historical uncertainty protects a shot even if its latest displayed image is accepted.
    for (const field of ['prompt', 'seconds', 'camera', 'lens', 'lighting', 'notes']) {
        const draft = snapshot(update(project)); draft.shots[0][field] = field === 'seconds' ? 6 : 'Changed';
        await assert.rejects(store.updateCinemaProject(project.id, project.version, draft), /ERR_CINEMA_BUSY/);
    }
    await assert.rejects(store.updateCinemaProject(project.id, project.version, { ...update(project), aspectRatio: '9:16' }), /ERR_CINEMA_BUSY/);
    await assert.rejects(store.updateCinemaProject(project.id, project.version, { ...update(project), shots: [] }), /ERR_CINEMA_BUSY/);
    await assert.rejects(store.deleteCinemaProject(project.id, project.version), /ERR_CINEMA_BUSY/);
    project = await store.updateCinemaProject(project.id, project.version, { ...update(project), title: 'Title can change', brief: 'Brief can change' });
    project = await store.mutateCinemaProject(project.id, project.version, current => ({ ...current, generationHistory: current.generationHistory.map(entry => entry.requestId === unresolved.requestId ? { ...entry, state: 'accepted', taskId: 'resolved-task' } : entry) }));
    const ledger = snapshot(project.generationHistory);
    project = await store.updateCinemaProject(project.id, project.version, { ...update(project), shots: [] });
    assert.deepEqual(project.generationHistory, ledger);
    assert.equal(project.shots.length, 0);
    for (const bad of [
        { ...update(project), title: 'x'.repeat(121) }, { ...update(project), brief: 'x'.repeat(12001) },
        { ...update(project), aspectRatio: '4:5' }, { ...update(project), shots: Array.from({ length: 25 }, shot) },
        { ...update(project), shots: [{ ...shot(), seconds: 0 }] }, { ...update(project), shots: [{ ...shot(), seconds: 1.1 }] },
        { ...update(project), shots: [{ ...shot(), prompt: 'x'.repeat(4001) }] },
        { ...update(project), shots: [{ ...shot(), camera: 'x'.repeat(161) }] },
        { ...update(project), shots: [{ ...shot(), notes: 'x'.repeat(2001) }] },
    ]) await assert.rejects(store.updateCinemaProject(project.id, project.version, bad), /ERR_CINEMA_VALIDATION/);
    await assert.rejects(store.mutateCinemaProject(project.id, project.version, current => ({ ...current, generationHistory: [{ ...job(), fingerprint: 'NOT_SHA256', shotId: randomUUID(), mediaType: 'image' }] })), /ERR_CINEMA_VALIDATION/);
    await assert.rejects(store.mutateCinemaProject(project.id, project.version, current => ({ ...current, generationHistory: [...current.generationHistory, { ...job(), error: '/private/path/secret', shotId: randomUUID(), mediaType: 'image' }] })), /ERR_CINEMA_VALIDATION/);
    const summaries = await store.listCinemaProjects();
    assert.equal(summaries[0].shotCount, 0); assert.equal(summaries[0].seconds, 0); assert.equal(summaries[0].generationHistory, undefined);
    // Every durable ledger entry is kept; duplicate IDs and requests beyond 256 reject atomically.
    const ledgerProject = await store.createCinemaProject({ title: 'Ledger limit' });
    const ledgerShotId = randomUUID();
    const maximumLedger = Array.from({ length: 256 }, () => ({ ...job(), shotId: ledgerShotId, mediaType: 'video' }));
    const fullLedger = await store.mutateCinemaProject(ledgerProject.id, 1, current => ({ ...current, generationHistory: maximumLedger }));
    await assert.rejects(store.mutateCinemaProject(fullLedger.id, fullLedger.version, current => ({ ...current, generationHistory: [...current.generationHistory, { ...job(), shotId: ledgerShotId, mediaType: 'video' }] })), /ERR_CINEMA_VALIDATION/);
    await assert.rejects(store.mutateCinemaProject(fullLedger.id, fullLedger.version, current => ({ ...current, generationHistory: [current.generationHistory[0], current.generationHistory[0], ...current.generationHistory.slice(2)] })), /ERR_CINEMA_VALIDATION/);
    await store.deleteCinemaProject(fullLedger.id, fullLedger.version);
    fs.chmodSync(file, 0o644);
    await store.getCinemaProject(project.id);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const savedBytes = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, projects: [{ ...project, shots: [{ ...shot(), seconds: 99 }] }] }));
    await assert.rejects(store.getCinemaProject(project.id), /^Error: ERR_CINEMA_STORAGE$/);
    fs.writeFileSync(file, savedBytes);
    process.env.STUDIO_PUBLIC_ORIGIN = 'https://studio.example';
    const collection = require('../src/app/api/cinema/projects/route.ts');
    const item = require('../src/app/api/cinema/projects/[id]/route.ts');
    const context = { params: Promise.resolve({ id: project.id }) };
    const listed = await collection.GET(); assert.equal(listed.status, 200); assert.equal(listed.headers.get('cache-control'), 'private, no-store');
    const got = await item.GET(request(`https://studio.example/api/cinema/projects/${project.id}`), context); assert.equal(got.status, 200);
    const wrongOrigin = await collection.POST(request('https://studio.example/api/cinema/projects', 'POST', {}, { origin: 'https://other.example' })); assert.equal(wrongOrigin.status, 403);
    const missingOrigin = request('https://studio.example/api/cinema/projects', 'POST', {}); missingOrigin.headers.delete('origin');
    assert.equal((await collection.POST(missingOrigin)).status, 403);
    const wrongType = await collection.POST(request('https://studio.example/api/cinema/projects', 'POST', {}, { 'content-type': 'text/plain' })); assert.equal(wrongType.status, 415);
    const tooLarge = await collection.POST(request('https://studio.example/api/cinema/projects', 'POST', JSON.stringify({ brief: 'x'.repeat(250 * 1024) }))); assert.equal(tooLarge.status, 413);
    const malformed = await collection.POST(request('https://studio.example/api/cinema/projects', 'POST', '{')); assert.equal(malformed.status, 400);
    const stalePut = await item.PUT(request('https://studio.example/api/cinema/projects/' + project.id, 'PUT', { version: 1, ...update(project) }), context); assert.equal(stalePut.status, 409);
    const forgedPut = await item.PUT(request('https://studio.example/api/cinema/projects/' + project.id, 'PUT', { version: project.version, ...update(project), generationHistory: [] }), context);
    assert.equal(forgedPut.status, 200); project = (await forgedPut.json()).project; assert.deepEqual(project.generationHistory, ledger);
    const missing = await item.GET(request('https://studio.example/api/cinema/projects/' + randomUUID()), { params: Promise.resolve({ id: randomUUID() }) }); assert.equal(missing.status, 404);
    delete process.env.STUDIO_PUBLIC_ORIGIN;
    assert.equal((await collection.POST(request('https://studio.example/api/cinema/projects', 'POST', { title: 'Origin fallback' }))).status, 201);
    // Limits are enforced under the same lock even for simultaneous creation requests.
    const currentCount = (await store.listCinemaProjects()).length;
    await Promise.all(Array.from({ length: 50 - currentCount }, (_, index) => store.createCinemaProject({ title: `Project ${index}` })));
    await assert.rejects(store.createCinemaProject({}), /ERR_CINEMA_LIMIT/);
    const removed = await item.DELETE(request('https://studio.example/api/cinema/projects/' + project.id, 'DELETE', { version: project.version }), context);
    assert.equal(removed.status, 200); assert.equal(await store.getCinemaProject(project.id), undefined);
    assert.equal((await store.listCinemaProjects()).length, 49);
    assert.deepEqual(fs.readdirSync(directory), ['cinema-projects.json']);
    console.log(JSON.stringify({ privateAtomicPersistence: true, crossBundleSerialization: true, optimisticConcurrency: true, staleDeleteRejected: true, immutableIdempotencyLedger: true, historicalUncertainJobsGuarded: true, forgedMetadataIgnored: true, transformRollback: true, inputAndStoredDataValidation: true, restartRead: true, csrfAndBoundedJson: true, ownerWorkspaceOnly: true, projectLimit: true, noInferenceOrPaidCalls: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { if (!process.env.CINEMA_FIXTURE_CHILD) fs.rmSync(directory, { recursive: true, force: true }); });
