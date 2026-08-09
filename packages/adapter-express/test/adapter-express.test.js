'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { afterEach, test } = require('node:test');
const { ExpressAdapter } = require('../dist');
const { HttpError } = require('@hivelet/core');

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function createServer() {
  const app = express();
  const adapter = new ExpressAdapter(app);
  const server = await listen(app);
  const { port } = server.address();
  return {
    adapter,
    server,
    request(pathname, options = {}) {
      return fetch(`http://127.0.0.1:${port}${pathname}`, options).then(async response => ({
        status: response.status,
        body: await response.text()
      }));
    }
  };
}

const activeResources = new Set();

afterEach(() => {
  for (const resource of activeResources) {
    resource.close();
  }
  activeResources.clear();
});

function track(server) {
  activeResources.add(server);
}

test('ExpressAdapter registers routes that produce async JSON responses', async () => {
  const { adapter, server, request } = await createServer();
  track(server);

  adapter.registerRoute({
    id: 'hello',
    method: 'GET',
    path: '/hello',
    handler: async () => ({ message: 'hi' })
  });
  adapter.registerRoute({
    id: 'echo',
    method: 'POST',
    path: '/echo',
    handler: async (req) => ({ received: req.body })
  });

  const getResponse = await request('/hello');
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body, JSON.stringify({ message: 'hi' }));

  const postResponse = await request('/echo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 42 })
  });
  assert.equal(postResponse.status, 200);
  assert.equal(postResponse.body, JSON.stringify({ received: { value: 42 } }));
});

test('ExpressAdapter returns 404 once a route is unregistered', async () => {
  const { adapter, server, request } = await createServer();
  track(server);

  adapter.registerRoute({
    id: 'temporal',
    method: 'GET',
    path: '/temporal',
    handler: async () => ({ ok: true })
  });

  assert.equal((await request('/temporal')).status, 200);
  adapter.unregisterRoute('temporal');
  assert.equal((await request('/temporal')).status, 404);
});

test('ExpressAdapter applies route statuses and serializes HttpError responses', async () => {
  const { adapter, server, request } = await createServer();
  track(server);

  adapter.registerRoute({
    id: 'remove',
    method: 'DELETE',
    path: '/items/:id',
    status: 204,
    handler: () => undefined
  });
  adapter.registerRoute({
    id: 'missing',
    method: 'GET',
    path: '/missing',
    handler: () => { throw new HttpError(404, 'Item not found'); }
  });

  const removed = await request('/items/1', { method: 'DELETE' });
  assert.equal(removed.status, 204);
  assert.equal(removed.body, '');

  const missing = await request('/missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body, JSON.stringify({ error: 'Item not found' }));
});

test('ExpressAdapter supports unregistering before a route replacement', async () => {
  const app = express();
  const adapter = new ExpressAdapter(app);
  const server = await listen(app);
  track(server);
  const { port } = server.address();

  adapter.registerRoute({
    id: 'replaceable',
    method: 'GET',
    path: '/resource',
    handler: async () => ({ version: 1 })
  });

  const first = await fetch(`http://127.0.0.1:${port}/resource`).then(async response => ({
    status: response.status,
    body: await response.text()
  }));
  assert.equal(first.status, 200);
  assert.equal(first.body, JSON.stringify({ version: 1 }));

  adapter.unregisterRoute('replaceable');
  adapter.registerRoute({
    id: 'replaceable',
    method: 'GET',
    path: '/resource',
    handler: async () => ({ version: 2 })
  });

  const second = await fetch(`http://127.0.0.1:${port}/resource`).then(async response => ({
    status: response.status,
    body: await response.text()
  }));
  assert.equal(second.status, 200);
  assert.equal(second.body, JSON.stringify({ version: 2 }));

  assert.equal(typeof adapter._router, 'undefined');
});

test('ExpressAdapter replaces a route by id without exposing the private router', async () => {
  const app = express();
  const adapter = new ExpressAdapter(app);
  const server = await listen(app);
  track(server);
  const { port } = server.address();

  adapter.registerRoute({
    id: 'replaceable',
    method: 'GET',
    path: '/resource',
    handler: async () => ({ version: 1 })
  });

  const first = await fetch(`http://127.0.0.1:${port}/resource`).then(async response => ({
    status: response.status,
    body: await response.text()
  }));
  assert.equal(first.status, 200);
  assert.equal(first.body, JSON.stringify({ version: 1 }));

  adapter.registerRoute({
    id: 'replaceable',
    method: 'GET',
    path: '/resource',
    handler: async () => ({ version: 2 })
  });

  const second = await fetch(`http://127.0.0.1:${port}/resource`).then(async response => ({
    status: response.status,
    body: await response.text()
  }));
  assert.equal(second.status, 200);
  assert.equal(second.body, JSON.stringify({ version: 2 }));

  assert.equal(typeof adapter._router, 'undefined');
});

test('ExpressAdapter restores the active route when a replacement cannot be built', async () => {
  const { adapter, server, request } = await createServer();
  track(server);

  adapter.registerRoute({
    id: 'safe-replacement',
    method: 'GET',
    path: '/safe',
    handler: () => ({ version: 1 })
  });

  assert.throws(() => adapter.registerRoute({
    id: 'safe-replacement',
    method: 'INVALID',
    path: '/safe',
    handler: () => ({ version: 2 })
  }), TypeError);

  const response = await request('/safe');
  assert.equal(response.status, 200);
  assert.equal(response.body, JSON.stringify({ version: 1 }));
});

test('ExpressAdapter applies mixed batches atomically', async () => {
  const { adapter, server, request } = await createServer();
  track(server);
  adapter.applyRouteBatch([
    { kind: 'register', definition: { id: 'one', method: 'GET', path: '/one', handler: () => ({ value: 1 }) } },
    { kind: 'register', definition: { id: 'two', method: 'GET', path: '/two', handler: () => ({ value: 2 }) } }
  ]);
  adapter.applyRouteBatch([
    { kind: 'register', definition: { id: 'one', method: 'GET', path: '/one', handler: () => ({ value: 3 }) } },
    { kind: 'unregister', id: 'two' }
  ]);

  assert.equal((await request('/one')).body, JSON.stringify({ value: 3 }));
  assert.equal((await request('/two')).status, 404);

  assert.throws(() => adapter.applyRouteBatch([
    { kind: 'unregister', id: 'one' },
    { kind: 'register', definition: { id: 'broken', method: 'INVALID', path: '/broken', handler() {} } }
  ]), TypeError);
  assert.equal((await request('/one')).body, JSON.stringify({ value: 3 }));
});
