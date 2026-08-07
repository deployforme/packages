'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const { TaskStore } = require('../dist/services/task-store');
const { TagStore } = require('../dist/services/tag-store');
const { CommentStore } = require('../dist/services/comment-store');
const { NotificationService } = require('../dist/services/notification-service');
const { MemoryTransport, createLogger } = require('@hivelet/core');

test('TaskStore: create → get → list', () => {
  const store = new TaskStore();
  const created = store.create({ title: 'demo' });
  assert.equal(created.title, 'demo');
  assert.equal(created.status, 'todo');
  assert.equal(store.get(created.id).id, created.id);
  assert.equal(store.list().length, 1);
});

test('TaskStore: complete emits task:completed event', () => {
  const store = new TaskStore();
  const events = [];
  store.subscribe(e => events.push(e.type));

  const task = store.create({ title: 'demo' });
  store.update(task.id, { status: 'done' });

  assert.deepEqual(events, ['task:created', 'task:updated', 'task:completed']);
});

test('TaskStore: filter by tag and status', () => {
  const store = new TaskStore();
  const t1 = store.create({ title: 'a', tagIds: ['x'] });
  const t2 = store.create({ title: 'b', tagIds: ['y'] });
  store.update(t2.id, { status: 'doing' });

  assert.equal(store.list({ status: 'todo' }).length, 1);
  assert.equal(store.list({ tagId: 'x' }).length, 1);
  assert.equal(store.list({ tagId: 'y' })[0].id, t2.id);
});

test('TagStore: seedIfEmpty seeds default tags', () => {
  const store = new TagStore();
  store.seedIfEmpty();
  const list = store.list();
  assert.equal(list.length, 3);
  assert.ok(list.some(t => t.name === 'urgent'));
  assert.ok(list.some(t => t.name === 'feature'));
});

test('CommentStore: listForTask only returns comments for that task', () => {
  const store = new CommentStore();
  store.add('t_1', 'alice', 'first');
  store.add('t_1', 'bob', 'second');
  store.add('t_2', 'carol', 'other');

  assert.equal(store.listForTask('t_1').length, 2);
  assert.equal(store.listForTask('t_2').length, 1);
  assert.equal(store.listForTask('t_3').length, 0);
});

test('NotificationService: records notify calls', () => {
  const logger = createLogger({ transports: [new MemoryTransport()] });
  const svc = new NotificationService(logger);
  svc.notify('task-created', { title: 'foo' });
  svc.notify('task-completed', { title: 'bar', detail: 'ok' });

  const history = svc.history();
  assert.equal(history.length, 2);
  assert.equal(history[0].title, 'foo');
  assert.equal(history[1].detail, 'ok');
});

test('logger: records every level with scope and fields', () => {
  const memory = new MemoryTransport();
  const logger = createLogger({ scope: 'taskboard', transports: [memory] });

  logger.log('hello');
  logger.warn('careful');
  logger.error('boom', { module: 'tasks' });

  const records = memory.list();
  assert.deepEqual(records.map(record => record.level), ['info', 'warn', 'error']);
  assert.equal(records[0].scope, 'taskboard');
  assert.deepEqual(records[2].fields, { module: 'tasks' });
});

test('module file: loads a runtime module that registers routes via context.container', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hivelet-test-'));
  try {
    const modulePath = path.join(tmp, 'demo.module.js');
    const store = new TaskStore();
    const captured = { routes: [] };

    await fs.writeFile(modulePath, `
      module.exports = {
        name: 'demo',
        version: '9.9.9',
        register(context) {
          const store = context.container.get('store');
          context.http.registerRoute({
            id: 'demo-route',
            method: 'GET',
            path: '/demo',
            handler: async () => ({ ok: true, count: store.list().length })
          });
        }
      };
    `);

    const container = {
      get: (token) => {
        assert.equal(token, 'store');
        return store;
      },
      register: () => {
        throw new Error('modules must not register');
      }
    };

    const fakeHttp = {
      registerRoute(def) { captured.routes.push(def); },
      unregisterRoute() {}
    };

    const mod = require(modulePath);
    const logger = createLogger({ transports: [new MemoryTransport()] });
    await mod.register({ http: fakeHttp, container, logger });

    assert.equal(mod.name, 'demo');
    assert.equal(mod.version, '9.9.9');
    assert.equal(captured.routes.length, 1);
    assert.equal(captured.routes[0].id, 'demo-route');
    assert.equal(captured.routes[0].path, '/demo');

    delete require.cache[modulePath];
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
