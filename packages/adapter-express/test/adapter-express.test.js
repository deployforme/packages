'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { afterEach, test } = require('node:test');
const { ExpressAdapter } = require('../dist');

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
