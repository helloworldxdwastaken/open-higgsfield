/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript server loader and process-restart contract test. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directory = process.env.HIGHFIELD_TEST_STORAGE || fs.mkdtempSync(path.join(os.tmpdir(), 'highfield-store-'));
process.env.OPEN_HIGGSFIELD_STORAGE_DIR = directory;
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const resumed = [];
Module._resolveFilename = function (id, parent, ...rest) {
    return originalResolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) + '.ts' : id, parent, ...rest);
};
Module._load = function (id, parent, ...rest) {
    if (id === '@/lib/poller') return { resumePendingTasks: tasks => resumed.push(...tasks) };
    if (id === '@/lib/database') return { loadPersistedTasks: async () => [], persistTasks: async () => {}, deletePersistedTask: async () => {} };
    return originalLoad.call(this, id, parent, ...rest);
};
Module._extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, name);
(async () => {
    const store = require('../src/lib/task-store.ts');
    const guard = setTimeout(() => { console.error('Task hydration timed out'); process.exitCode = 1; }, 5000);
    await store.initStore();
    clearTimeout(guard);
    if (process.argv.includes('--hydrate')) {
        assert.equal(store.getStore().size, 20);
        assert.deepEqual(resumed, [{ task_id: 'fixture-19' }]);
        assert.equal(store.getTask('fixture-19').provider_operation.requestId, 'accepted-provider-id');
        console.log(JSON.stringify({ hydrated: true, pendingJobResumedWithSameId: true }));
        return;
    }
    const writes = [];
    for (let index = 0; index < 20; index++) {
        store.setTask({ task_id: `fixture-${index}`, status: index === 19 ? 'IN_PROGRESS' : 'COMPLETED', media_type: 'video', model_id: 'fixture-model', provider_id: 'higgsfield',
            provider_operation: index === 19 ? { requestId: 'accepted-provider-id' } : undefined, created_at: new Date().toISOString(), prompt: 'fixture', events: [], _done: index !== 19 });
        writes.push(store.saveTasks());
    }
    await Promise.all(writes);
    const rows = JSON.parse(fs.readFileSync(path.join(directory, 'tasks_history.json'), 'utf8'));
    assert.equal(rows.length, 20);
    assert(!fs.existsSync(path.join(directory, 'tasks_history.json.tmp')));
    const child = spawnSync(process.execPath, [__filename, '--hydrate'], { encoding: 'utf8', env: { ...process.env, HIGHFIELD_TEST_STORAGE: directory } });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, child.stderr);
    assert(child.stdout.trim(), 'Hydration process returned no evidence');
    assert.equal(JSON.parse(child.stdout).pendingJobResumedWithSameId, true);
    await Promise.all([store.saveTasks(), store.deleteTask('fixture-0'), store.saveTasks()]);
    const afterDelete = JSON.parse(fs.readFileSync(path.join(directory, 'tasks_history.json'), 'utf8'));
    assert.equal(afterDelete.length, 19);
    assert(!afterDelete.some(task => task.task_id === 'fixture-0'));
    console.log(JSON.stringify({ concurrentAtomicHistory: true, concurrentDeletion: true, processRestart: true, acceptedOperationPreserved: true, noProviderCalls: true }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { if (!process.argv.includes('--hydrate')) fs.rmSync(directory, { recursive: true, force: true }); });
