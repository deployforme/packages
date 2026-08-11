'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdir, mkdtemp, rm, writeFile, readFile, unlink } = require('node:fs/promises');
const { afterEach, test } = require('node:test');
const { Kernel, MemoryTransport, VersionStore, createLogger } = require('../dist');

const temporaryDirectories = new Set();

afterEach(async () => {
  await Promise.all(Array.from(temporaryDirectories, async directory => {
    await rm(directory, { recursive: true, force: true });
    temporaryDirectories.delete(directory);
  }));
});

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hivelet-auto-'));
  temporaryDirectories.add(root);
  return {
    root,
    modules: path.join(root, 'modules'),
    versions: path.join(root, 'versions')
  };
}

function moduleSource(name, version, routePath) {
  return `module.exports = {
  name: ${JSON.stringify(name)},
  version: ${JSON.stringify(version)},
  register(context) {
    context.http.registerRoute({
      id: ${JSON.stringify(`${name}.index`)},
      method: 'GET',
      path: ${JSON.stringify(routePath)},
      handler: () => ({ name: ${JSON.stringify(name)}, version: ${JSON.stringify(version)} })
    });
  }
};
`;
}

function createAdapter() {
  const routes = new Map();
  return {
    routes,
    registerRoute(definition) {
      routes.set(definition.id, definition);
    },
    unregisterRoute(id) {
      routes.delete(id);
    }
  };
}

function createKernel(workspace, overrides = {}) {
  const memory = new MemoryTransport();
  const adapter = createAdapter();
  const kernel = new Kernel(
    { http: adapter, logger: createLogger({ level: 'debug', transports: [memory] }) },
    {
      autonomous: { enabled: true, paths: [workspace.modules], debounce: 20, ...overrides.autonomous },
      versioning: { directory: workspace.versions, ...overrides.versioning }
    }
  );

  return { adapter, kernel, memory };
}

function waitFor(predicate, timeout = 4000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const tick = () => {
      let outcome;
      try {
        outcome = predicate();
      } catch (error) {
        reject(error);
        return;
      }

      if (outcome) {
        resolve(outcome);
      } else if (Date.now() > deadline) {
        reject(new Error('Timed out waiting for condition'));
      } else {
        setTimeout(tick, 25);
      }
    };
    tick();
  });
}

test('start() discovers and loads every module without an explicit load call', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  await writeFile(path.join(workspace.modules, 'users.module.js'), moduleSource('users', '1.0.0', '/users'));
  await writeFile(path.join(workspace.modules, 'orders.module.js'), moduleSource('orders', '1.0.0', '/orders'));

  const { adapter, kernel } = createKernel(workspace);
  await kernel.start();

  try {
    assert.equal(kernel.autonomous, true);
    assert.deepEqual(kernel.list().map(entry => entry.module.name).sort(), ['orders', 'users']);
    assert.equal(adapter.routes.size, 2);
  } finally {
    await kernel.stop();
  }
});

test('editing a module file reloads it without a manual reload', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace);
  await kernel.start();

  try {
    await writeFile(modulePath, moduleSource('users', '2.0.0', '/users'));
    await waitFor(() => kernel.get('users')?.module.version === '2.0.0');
    assert.equal(kernel.get('users').module.version, '2.0.0');
  } finally {
    await kernel.stop();
  }
});

test('editing a local dependency reloads its owning module', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const helperPath = path.join(workspace.modules, 'users-helper.js');
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(helperPath, `module.exports = { value: 'v1' };`);
  await writeFile(modulePath, `
module.exports = {
  name: 'users', version: '1.0.0',
  register(context) {
    const helper = require('./users-helper');
    context.http.registerRoute({ id: 'users.index', method: 'GET', path: '/users', handler: () => helper.value });
  }
};`);

  const { adapter, kernel } = createKernel(workspace);
  await kernel.start();
  try {
    assert.equal(await adapter.routes.get('users.index').handler({}, {}), 'v1');
    await writeFile(helperPath, `module.exports = { value: 'v2' };`);
    await waitFor(() => kernel.status().builds.length >= 2 && kernel.status().builds[0].status === 'success');
    assert.equal(await adapter.routes.get('users.index').handler({}, {}), 'v2');
    assert.deepEqual(kernel.list().map(entry => entry.module.name), ['users']);
  } finally {
    await kernel.stop();
  }
});

test('a new file dropped into a watched directory is loaded automatically', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  await writeFile(path.join(workspace.modules, 'users.module.js'), moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace);
  await kernel.start();

  try {
    await writeFile(path.join(workspace.modules, 'tags.module.js'), moduleSource('tags', '1.0.0', '/tags'));
    await waitFor(() => kernel.get('tags') !== undefined);
    assert.equal(kernel.get('tags').module.version, '1.0.0');
  } finally {
    await kernel.stop();
  }
});

test('a build output created after start is discovered and deployed automatically', async () => {
  const workspace = await createWorkspace();
  const buildModules = path.join(workspace.root, 'dist', 'modules');
  const unrelatedModules = path.join(workspace.root, 'unrelated');
  const { kernel } = createKernel(workspace, {
    autonomous: { paths: [buildModules] }
  });

  await kernel.start();

  try {
    await mkdir(unrelatedModules, { recursive: true });
    await writeFile(path.join(unrelatedModules, 'ignored.module.js'), moduleSource('ignored', '1.0.0', '/ignored'));
    await mkdir(buildModules, { recursive: true });
    await writeFile(path.join(buildModules, 'users.module.js'), moduleSource('users', '1.0.0', '/users'));

    await waitFor(() => kernel.get('users') !== undefined);
    assert.equal(kernel.get('users').module.version, '1.0.0');
    assert.equal(kernel.get('ignored'), undefined);
  } finally {
    await kernel.stop();
  }
});

test('deleting a module file unloads it and frees its routes', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { adapter, kernel } = createKernel(workspace);
  await kernel.start();

  try {
    await unlink(modulePath);
    await waitFor(() => kernel.get('users') === undefined);
    assert.equal(adapter.routes.size, 0);
  } finally {
    await kernel.stop();
  }
});

test('a broken edit keeps the previous version serving traffic', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { adapter, kernel } = createKernel(workspace, { autonomous: { retries: 0 } });
  const failures = [];
  kernel.on('module:failed', event => failures.push(event));
  await kernel.start();

  try {
    await writeFile(modulePath, 'module.exports = { totally: "invalid" };');
    await waitFor(() => failures.length > 0);

    assert.equal(kernel.get('users').module.version, '1.0.0');
    assert.equal(adapter.routes.size, 1);
  } finally {
    await kernel.stop();
  }
});

test('automatic rollback restores the last known good source after a failed edit', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace, {
    autonomous: { retries: 0, autoRollback: true }
  });
  const rollbacks = [];
  kernel.on('module:rolledBack', event => rollbacks.push(event));
  await kernel.start();

  try {
    await writeFile(modulePath, 'module.exports = { totally: "invalid" };');
    await waitFor(() => rollbacks.length > 0);

    assert.equal(kernel.get('users').module.version, '1.0.0');
    assert.match(await readFile(modulePath, 'utf8'), /1\.0\.0/);
  } finally {
    await kernel.stop();
  }
});

test('every successful load is recorded as a revision', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace, { autonomous: { enabled: false, paths: [workspace.modules] } });

  try {
    await kernel.load(modulePath);
    await writeFile(modulePath, moduleSource('users', '1.1.0', '/users'));
    await kernel.load(modulePath);

    const history = kernel.history('users');
    assert.deepEqual(history.map(entry => entry.version), ['1.0.0', '1.1.0']);
    assert.deepEqual(history.map(entry => entry.revision), [1, 2]);
    assert.equal(history[0].status, 'superseded');
    assert.equal(history[1].status, 'active');
  } finally {
    await kernel.stop();
  }
});

test('reloading unchanged source does not create a duplicate revision', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace, { autonomous: { enabled: false, paths: [workspace.modules] } });

  try {
    await kernel.load(modulePath);
    await kernel.reload(modulePath);

    assert.equal(kernel.history('users').length, 1);
  } finally {
    await kernel.stop();
  }
});

test('rollback restores the previous source and reloads it', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace, { autonomous: { enabled: false, paths: [workspace.modules] } });

  try {
    await kernel.load(modulePath);
    await writeFile(modulePath, moduleSource('users', '2.0.0', '/users'));
    await kernel.load(modulePath);
    assert.equal(kernel.get('users').module.version, '2.0.0');

    const metadata = await kernel.rollback('users');

    assert.equal(metadata.module.version, '1.0.0');
    assert.equal(kernel.get('users').module.version, '1.0.0');
    assert.equal(kernel.history('users').at(-1).restoredFrom, 1);
  } finally {
    await kernel.stop();
  }
});

test('rollback to an explicit revision is supported', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');

  const { kernel } = createKernel(workspace, { autonomous: { enabled: false, paths: [workspace.modules] } });

  try {
    for (const version of ['1.0.0', '2.0.0', '3.0.0']) {
      await writeFile(modulePath, moduleSource('users', version, '/users'));
      await kernel.load(modulePath);
    }

    await kernel.rollback('users', 1);
    assert.equal(kernel.get('users').module.version, '1.0.0');
  } finally {
    await kernel.stop();
  }
});

test('rollback without an earlier revision fails loudly', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace, { autonomous: { enabled: false, paths: [workspace.modules] } });

  try {
    await kernel.load(modulePath);
    await assert.rejects(() => kernel.rollback('users'), /No earlier revision recorded/);
  } finally {
    await kernel.stop();
  }
});

test('version history survives a fresh store instance', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace, { autonomous: { enabled: false, paths: [workspace.modules] } });
  await kernel.load(modulePath);
  await kernel.stop();

  const store = new VersionStore({ directory: workspace.versions });
  assert.deepEqual(store.modules(), ['users']);
  assert.equal(store.history('users').length, 1);
  assert.equal(store.current('users').version, '1.0.0');
});

test('the version store prunes snapshots beyond the retention limit', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');

  const { kernel } = createKernel(workspace, {
    autonomous: { enabled: false, paths: [workspace.modules] },
    versioning: { keep: 2 }
  });

  try {
    for (const version of ['1.0.0', '2.0.0', '3.0.0']) {
      await writeFile(modulePath, moduleSource('users', version, '/users'));
      await kernel.load(modulePath);
    }

    assert.deepEqual(kernel.history('users').map(entry => entry.version), ['2.0.0', '3.0.0']);
  } finally {
    await kernel.stop();
  }
});

test('unwatch stops autonomous reloads but leaves modules loaded', async () => {
  const workspace = await createWorkspace();
  await mkdir(workspace.modules, { recursive: true });
  const modulePath = path.join(workspace.modules, 'users.module.js');
  await writeFile(modulePath, moduleSource('users', '1.0.0', '/users'));

  const { kernel } = createKernel(workspace);
  await kernel.start();

  try {
    kernel.unwatch();
    assert.equal(kernel.autonomous, false);

    await writeFile(modulePath, moduleSource('users', '2.0.0', '/users'));
    await new Promise(resolve => setTimeout(resolve, 200));

    assert.equal(kernel.get('users').module.version, '1.0.0');
  } finally {
    await kernel.stop();
  }
});
