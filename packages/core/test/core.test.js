'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { afterEach, test } = require('node:test');
const { Dashboard, Kernel, Monitor, resolveKernelConfig } = require('../dist');

const temporaryDirectories = new Set();

async function createTemporaryModule(source) {
  const directory = await createTemporaryDirectory();
  const modulePath = path.join(directory, 'module.cjs');
  await writeFile(modulePath, source);
  return modulePath;
}

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hivelet-core-'));
  temporaryDirectories.add(directory);
  return directory;
}

function createAdapter() {
  const routes = new Map();
  const operations = [];
  return {
    routes,
    operations,
    registerRoute(definition) {
      operations.push(['register', definition.id]);
      routes.set(definition.id, definition);
    },
    unregisterRoute(id) {
      operations.push(['unregister', id]);
      routes.delete(id);
    }
  };
}

function request(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

afterEach(async () => {
  delete globalThis.__hiveletCoreEvents;
  await Promise.all(Array.from(temporaryDirectories, async directory => {
    await rm(directory, { recursive: true, force: true });
    temporaryDirectories.delete(directory);
  }));
});

test('resolveKernelConfig applies immutable defaults', () => {
  const config = resolveKernelConfig();

  assert.deepEqual(config, {
    dashboard: {
      enabled: false,
      host: '127.0.0.1',
      port: 0,
      refreshInterval: 3000,
      authFile: '.hivelet/dashboard-auth.json',
      sessionTtl: 43_200_000
    },
    buildHistoryLimit: 100,
    autonomous: {
      enabled: false,
      paths: [],
      extensions: ['.js', '.cjs', '.mjs'],
      ignore: [],
      debounce: 150,
      loadOnStart: true,
      unloadOnDelete: true,
      retries: 2,
      retryDelay: 500,
      autoRollback: false
    },
    versioning: {
      enabled: true,
      directory: '.hivelet/versions',
      keep: 20
    }
  });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.autonomous), true);
  assert.equal(Object.isFrozen(config.versioning), true);
  assert.equal(Object.isFrozen(config.dashboard), true);
});

test('resolveKernelConfig rejects invalid port, host, and history values', () => {
  assert.throws(() => resolveKernelConfig({ dashboard: { port: -1 } }), /dashboard\.port/);
  assert.throws(() => resolveKernelConfig({ dashboard: { port: 65536 } }), /dashboard\.port/);
  assert.throws(() => resolveKernelConfig({ dashboard: { port: 1.5 } }), /dashboard\.port/);
  assert.throws(() => resolveKernelConfig({ dashboard: { host: '   ' } }), /dashboard\.host/);
  assert.throws(() => resolveKernelConfig({ buildHistoryLimit: 0 }), /buildHistoryLimit/);
  assert.throws(() => resolveKernelConfig({ buildHistoryLimit: 1001 }), /buildHistoryLimit/);
});

test('Monitor snapshots builds, modules, and build completion', () => {
  const monitor = new Monitor(2);
  const successful = monitor.startBuild('alpha', '/alpha.cjs');
  const failed = monitor.startBuild('beta', '/beta.cjs');

  monitor.identifyBuild(successful, 'renamed-alpha');
  monitor.completeBuild(successful, 'success');
  monitor.completeBuild(failed, 'error', 'broken');
  monitor.registerModule('renamed-alpha', '1.2.3', [
    { id: 'alpha-list', method: 'GET', path: '/alpha' },
    { id: 'alpha-create', method: 'POST', path: '/alpha' }
  ]);
  monitor.startRequest('renamed-alpha', 'alpha-list');
  monitor.completeRequest('renamed-alpha', 'alpha-list', 12, false);
  monitor.startRequest('renamed-alpha', 'alpha-list');
  monitor.completeRequest('renamed-alpha', 'alpha-list', 28, true);

  const snapshot = monitor.snapshot();
  assert.equal(snapshot.builds.length, 2);
  assert.deepEqual(snapshot.stats, {
    totalBuilds: 2,
    successfulBuilds: 1,
    failedBuilds: 1,
    buildingNow: 0,
    activeModules: 1,
    uptime: snapshot.stats.uptime,
    totalRequests: 2,
    requestsPerMinute: 2,
    averageResponseTime: 20,
    errorRate: 0.5
  });
  assert.equal(snapshot.builds.find(build => build.id === successful).moduleName, 'renamed-alpha');
  assert.equal(snapshot.builds.find(build => build.id === successful).status, 'success');
  assert.equal(typeof snapshot.builds.find(build => build.id === successful).duration, 'number');
  assert.equal(snapshot.builds.find(build => build.id === failed).error, 'broken');
  assert.deepEqual(snapshot.modules.map(module => ({ name: module.name, version: module.version, routeCount: module.routeCount })), [
    { name: 'renamed-alpha', version: '1.2.3', routeCount: 2 }
  ]);
  assert.deepEqual(snapshot.endpoints.map(endpoint => ({ id: endpoint.id, requests: endpoint.requests })), [
    { id: 'alpha-list', requests: 2 },
    { id: 'alpha-create', requests: 0 }
  ]);
  assert.equal(snapshot.endpoints[0].averageResponseTime, 20);
  assert.equal(snapshot.endpoints[0].p95ResponseTime, 28);
  assert.doesNotThrow(() => new Date(snapshot.generatedAt).toISOString());
});

test('Dashboard serves lifecycle endpoints, errors, security headers, and Hivelet HTML', async t => {
  const directory = await createTemporaryDirectory();
  const authFile = path.join(directory, 'dashboard-auth.json');
  let password;
  const monitor = new Monitor();
  monitor.registerModule('alpha', '1.0.0', [{ id: 'alpha-list', method: 'GET', path: '/alpha' }]);
  const dashboard = new Dashboard(monitor, {
    enabled: true,
    host: '127.0.0.1',
    port: 0,
    refreshInterval: 500,
    authFile,
    sessionTtl: 60_000
  }, generated => { password = generated; });
  t.after(() => dashboard.stop());

  const address = await dashboard.start();
  assert.equal(address.port > 0, true);
  assert.strictEqual(await dashboard.start(), address);
  assert.equal(typeof password, 'string');
  const credential = JSON.parse(await readFile(authFile, 'utf8'));
  assert.equal(credential.algorithm, 'sha512');
  assert.equal(credential.hash.length, 128);
  assert.equal(JSON.stringify(credential).includes(password), false);

  const home = await request(`${address.url}/`);
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /Sign in to Flow/i);
  assert.match(home.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(home.headers['cache-control'], 'no-store');
  assert.equal(home.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(home.headers['referrer-policy'], 'no-referrer');
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.equal(home.headers['x-frame-options'], 'DENY');

  const state = await request(`${address.url}/api/state`);
  assert.equal(state.statusCode, 401);

  const login = await request(`${address.url}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password }));
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const authenticatedState = await request(`${address.url}/api/state`, { headers: { Cookie: cookie } });
  assert.equal(authenticatedState.statusCode, 200);
  assert.equal(JSON.parse(authenticatedState.body).modules[0].name, 'alpha');
  const flow = await request(`${address.url}/`, { headers: { Cookie: cookie } });
  assert.match(flow.body, /Hivelet Flow/i);

  const health = await request(`${address.url}/health`);
  assert.equal(health.statusCode, 200);
  assert.equal(JSON.parse(health.body).status, 'ok');

  const missing = await request(`${address.url}/missing`);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body, 'Not Found');

  const disallowed = await request(`${address.url}/`, { method: 'PUT' });
  assert.equal(disallowed.statusCode, 405);
  assert.equal(disallowed.headers.allow, 'GET, HEAD, POST');

  await dashboard.stop();
  await dashboard.stop();
  await assert.rejects(request(`${address.url}/`));
});

test('Kernel stages async routes, reports status, unloads, and awaits dispose', async () => {
  globalThis.__hiveletCoreEvents = [];
  const adapter = createAdapter();
  const modulePath = await createTemporaryModule(`
module.exports = {
  name: 'async-module',
  version: '1.0.0',
  async register(context) {
    await new Promise(resolve => setTimeout(resolve, 5));
    globalThis.__hiveletCoreEvents.push('registered');
    context.http.registerRoute({ id: 'async-route', method: 'GET', path: '/async', handler: async () => ({ ok: true }) });
  },
  async dispose() {
    await new Promise(resolve => setTimeout(resolve, 5));
    globalThis.__hiveletCoreEvents.push('disposed');
  }
};
`);
  const kernel = new Kernel({ http: adapter });

  const metadata = await kernel.load(modulePath);
  assert.equal(metadata.module.name, 'async-module');
  assert.equal(metadata.registeredRoutes.length, 1);
  assert.deepEqual(globalThis.__hiveletCoreEvents, ['registered']);
  assert.deepEqual(adapter.operations, [['register', 'async-route']]);
  assert.equal(kernel.list().length, 1);
  assert.strictEqual(kernel.get('async-module'), metadata);
  assert.deepEqual(await adapter.routes.get('async-route').handler({}, {}), { ok: true });
  assert.equal(kernel.status().stats.activeModules, 1);
  assert.equal(kernel.status().stats.totalRequests, 1);
  assert.equal(kernel.status().endpoints[0].requests, 1);
  assert.equal(kernel.status().endpoints[0].moduleName, 'async-module');
  assert.equal(kernel.status().builds[0].status, 'success');

  assert.equal(await kernel.unload('async-module'), true);
  assert.equal(await kernel.unload('async-module'), false);
  assert.deepEqual(globalThis.__hiveletCoreEvents, ['registered', 'disposed']);
  assert.equal(adapter.routes.size, 0);
  assert.equal(kernel.list().length, 0);
  assert.equal(kernel.status().stats.activeModules, 0);
});

test('Kernel does not apply staged routes when register fails', async () => {
  const adapter = createAdapter();
  const modulePath = await createTemporaryModule(`
module.exports = {
  name: 'broken-module',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({ id: 'never-applied', method: 'GET', path: '/broken', handler() {} });
    throw new Error('register failed');
  }
};
`);
  const kernel = new Kernel({ http: adapter });

  await assert.rejects(kernel.load(modulePath), /register failed/);
  assert.deepEqual(adapter.operations, []);
  assert.equal(adapter.routes.size, 0);
  assert.equal(kernel.list().length, 0);
  assert.equal(kernel.status().builds[0].status, 'error');
});

test('Kernel replaces a module with the same name and swaps its routes', async () => {
  globalThis.__hiveletCoreEvents = [];
  const adapter = createAdapter();
  const modulePath = await createTemporaryModule(`
module.exports = {
  name: 'replaceable',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({ id: 'old-route', method: 'GET', path: '/old', handler() {} });
  },
  dispose() { globalThis.__hiveletCoreEvents.push('old-disposed'); }
};
`);
  const kernel = new Kernel({ http: adapter });
  await kernel.load(modulePath);
  await writeFile(modulePath, `
module.exports = {
  name: 'replaceable',
  version: '2.0.0',
  async register(context) {
    await Promise.resolve();
    context.http.registerRoute({ id: 'new-route', method: 'GET', path: '/new', handler() {} });
  }
};
`);

  const replacement = await kernel.reload(modulePath);
  assert.equal(replacement.module.version, '2.0.0');
  assert.deepEqual(Array.from(adapter.routes.keys()), ['new-route']);
  assert.deepEqual(adapter.operations, [
    ['register', 'old-route'],
    ['register', 'new-route'],
    ['unregister', 'old-route']
  ]);
  assert.deepEqual(globalThis.__hiveletCoreEvents, ['old-disposed']);
  assert.equal(kernel.list().length, 1);
  await kernel.stop();
});

test('Kernel updates one endpoint without re-registering sibling endpoints', async () => {
  const adapter = createAdapter();
  const modulePath = await createTemporaryModule(`
module.exports = {
  name: 'isolated',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({ id: 'stable', method: 'GET', path: '/stable', handler: () => 'stable-v1' });
    context.http.registerRoute({ id: 'changing', method: 'GET', path: '/changing', handler: () => 'changing-v1' });
  }
};
`);
  const kernel = new Kernel({ http: adapter });
  await kernel.load(modulePath);
  const stableRoute = adapter.routes.get('stable');
  adapter.operations.length = 0;

  await writeFile(modulePath, `
module.exports = {
  name: 'isolated',
  version: '1.1.0',
  register(context) {
    context.http.registerRoute({ id: 'stable', method: 'GET', path: '/stable', handler: () => 'stable-v1' });
    context.http.registerRoute({ id: 'changing', method: 'GET', path: '/changing', handler: () => 'changing-v2' });
  }
};
`);
  const replacement = await kernel.reload(modulePath);

  assert.deepEqual(adapter.operations, []);
  assert.strictEqual(adapter.routes.get('stable'), stableRoute);
  assert.deepEqual(await adapter.routes.get('stable').handler({}, {}), 'stable-v1');
  assert.deepEqual(await adapter.routes.get('changing').handler({}, {}), 'changing-v2');
  assert.equal(replacement.module.version, '1.1.0');
  await kernel.stop();
});

test('Kernel only replaces structurally changed endpoints and removes deleted endpoints last', async () => {
  const adapter = createAdapter();
  const modulePath = await createTemporaryModule(`
module.exports = {
  name: 'route-diff',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({ id: 'stable', method: 'GET', path: '/stable', handler: () => 'stable' });
    context.http.registerRoute({ id: 'moving', method: 'GET', path: '/old', handler: () => 'old' });
    context.http.registerRoute({ id: 'removed', method: 'GET', path: '/removed', handler: () => 'removed' });
  }
};
`);
  const kernel = new Kernel({ http: adapter });
  await kernel.load(modulePath);
  adapter.operations.length = 0;

  await writeFile(modulePath, `
module.exports = {
  name: 'route-diff',
  version: '2.0.0',
  register(context) {
    context.http.registerRoute({ id: 'stable', method: 'GET', path: '/stable', handler: () => 'stable' });
    context.http.registerRoute({ id: 'moving', method: 'GET', path: '/new', handler: () => 'new' });
    context.http.registerRoute({ id: 'added', method: 'GET', path: '/added', handler: () => 'added' });
  }
};
`);
  await kernel.reload(modulePath);

  assert.deepEqual(adapter.operations, [
    ['register', 'moving'],
    ['register', 'added'],
    ['unregister', 'removed']
  ]);
  assert.deepEqual(Array.from(adapter.routes.keys()), ['stable', 'moving', 'added']);
  await kernel.stop();
});

test('Kernel starts and stops its configured dashboard', async () => {
  const directory = await createTemporaryDirectory();
  const kernel = new Kernel({ http: createAdapter() }, {
    dashboard: {
      enabled: true,
      host: '127.0.0.1',
      port: 0,
      refreshInterval: 500,
      authFile: path.join(directory, 'dashboard-auth.json')
    }
  });

  const address = await kernel.start();
  assert.ok(address);
  assert.equal((await request(`${address.url}/health`)).statusCode, 200);
  await kernel.stop();
  await assert.rejects(request(`${address.url}/health`));
  assert.equal((await kernel.start()).port > 0, true);
  await kernel.stop();
});
