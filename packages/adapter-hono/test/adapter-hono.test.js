'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HttpError } = require('@hivelet/core');
const { Hono } = require('hono');
const { HonoAdapter } = require('../dist');

test('serves JSON, body, params, status and HttpError responses', async () => {
  const app = new Hono();
  const adapter = new HonoAdapter(app);
  adapter.applyRouteBatch([
    { kind: 'register', definition: { id: 'get', method: 'GET', path: '/items/:id', handler: req => ({ id: req.params.id }) } },
    { kind: 'register', definition: { id: 'post', method: 'POST', path: '/items', status: 201, handler: req => req.body } },
    { kind: 'register', definition: { id: 'error', method: 'GET', path: '/error', handler: () => { throw new HttpError(409, 'conflict'); } } }
  ]);

  const get = await app.request('/items/42');
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { id: '42' });
  const post = await app.request('/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ok":true}' });
  assert.equal(post.status, 201);
  assert.deepEqual(await post.json(), { ok: true });
  const error = await app.request('/error');
  assert.equal(error.status, 409);
  assert.deepEqual(await error.json(), { error: 'conflict' });
});

test('atomically replaces and removes routes while preserving host fallback', async () => {
  const app = new Hono();
  const adapter = new HonoAdapter(app);
  app.get('/host', context => context.text('host'));
  adapter.registerRoute({ id: 'value', method: 'GET', path: '/value', handler: () => ({ value: 1 }) });
  assert.deepEqual(await (await app.request('/value')).json(), { value: 1 });

  adapter.applyRouteBatch([
    { kind: 'register', definition: { id: 'value', method: 'GET', path: '/value', handler: () => ({ value: 2 }) } },
    { kind: 'register', definition: { id: 'other', method: 'GET', path: '/other', handler: () => ({ ok: true }) } }
  ]);
  assert.deepEqual(await (await app.request('/value')).json(), { value: 2 });
  assert.equal((await app.request('/host')).status, 200);

  adapter.unregisterRoute('value');
  assert.equal((await app.request('/value')).status, 404);
  assert.deepEqual(await (await app.request('/other')).json(), { ok: true });
});

test('a failed batch leaves the previous dispatcher active', async () => {
  const app = new Hono();
  const adapter = new HonoAdapter(app);
  adapter.registerRoute({ id: 'stable', method: 'GET', path: '/stable', handler: () => ({ stable: true }) });

  assert.throws(() => adapter.applyRouteBatch([
    { kind: 'unregister', id: 'stable' },
    { kind: 'register', definition: { id: 'broken', method: 'TRACE', path: '/broken', handler() {} } }
  ]), /Unsupported HTTP method/);

  assert.deepEqual(await (await app.request('/stable')).json(), { stable: true });
});

test('an in-flight request finishes on its captured dispatcher', async () => {
  const app = new Hono();
  const adapter = new HonoAdapter(app);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  adapter.registerRoute({ id: 'slow', method: 'GET', path: '/slow', handler: async () => { await gate; return { version: 1 }; } });

  const first = app.request('/slow');
  await new Promise(resolve => setTimeout(resolve, 10));
  adapter.registerRoute({ id: 'slow', method: 'GET', path: '/slow', handler: () => ({ version: 2 }) });
  assert.deepEqual(await (await app.request('/slow')).json(), { version: 2 });
  release();
  assert.deepEqual(await (await first).json(), { version: 1 });
});

test('explicit HEAD routes and host error handling are preserved', async () => {
  const app = new Hono();
  app.onError((error, context) => context.json({ hostError: error.message }, 500));
  const adapter = new HonoAdapter(app);
  adapter.applyRouteBatch([
    { kind: 'register', definition: { id: 'get-resource', method: 'GET', path: '/resource', handler: () => new Response('get', { headers: { 'x-handler': 'get' } }) } },
    { kind: 'register', definition: { id: 'head-resource', method: 'HEAD', path: '/resource', handler: () => new Response(null, { headers: { 'x-handler': 'head' } }) } },
    { kind: 'register', definition: { id: 'boom', method: 'GET', path: '/boom', handler: () => { throw new Error('boom'); } } }
  ]);

  assert.equal((await app.request('/resource')).headers.get('x-handler'), 'get');
  assert.equal((await app.request('/resource', { method: 'HEAD' })).headers.get('x-handler'), 'head');
  const error = await app.request('/boom');
  assert.equal(error.status, 500);
  assert.deepEqual(await error.json(), { hostError: 'boom' });
});
