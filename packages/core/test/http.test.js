'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  Body,
  Controller,
  Get,
  HttpError,
  OnError,
  Param,
  Post,
  Status,
  Version,
  defineModule,
  notFound
} = require('../dist');

function decorateController(controller, prefix, routes) {
  for (const [method, property, path, options] of routes) {
    method(path, options)(controller.prototype, property, Object.getOwnPropertyDescriptor(controller.prototype, property));
  }
  Controller(prefix)(controller);
}

test('defineModule registers decorated controller routes with generated ids and paths', async () => {
  class TodosController {
    list() { return ['one']; }
    create() { throw new TypeError('bad title'); }
  }
  decorateController(TodosController, '/todos', [
    [Get, 'list', '', undefined],
    [Post, 'create', '', { status: 201, errorStatus: 400 }]
  ]);

  const routes = [];
  const module = defineModule({
    name: 'todos',
    version: '2.0.0',
    controllers: () => new TodosController()
  });
  await module.register({
    http: {
      registerRoute: route => routes.push(route),
      unregisterRoute() {}
    }
  });

  assert.deepEqual(routes.map(({ id, method, path, status }) => ({ id, method, path, status })), [
    { id: 'todos-list', method: 'GET', path: '/todos', status: undefined },
    { id: 'todos-create', method: 'POST', path: '/todos', status: 201 }
  ]);
  assert.deepEqual(await routes[0].handler({}, {}), ['one']);
  await assert.rejects(routes[1].handler({}, {}), error => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, 400);
    assert.equal(error.message, 'bad title');
    return true;
  });
});

test('notFound throws a typed 404 response error', () => {
  assert.throws(() => notFound('Todo not found'), error => {
    assert.equal(error instanceof HttpError, true);
    assert.equal(error.status, 404);
    assert.equal(error.message, 'Todo not found');
    return true;
  });
});

test('parameter and response decorators keep controller methods transport independent', async () => {
  class ItemsController {
    update(id, input) { return { id, input }; }
  }
  Param('id')(ItemsController.prototype, 'update', 0);
  Body()(ItemsController.prototype, 'update', 1);
  Status(202)(ItemsController.prototype, 'update');
  Version('1.1.0')(ItemsController.prototype, 'update');
  OnError(400)(ItemsController.prototype, 'update');
  Post('/:id')(ItemsController.prototype, 'update', Object.getOwnPropertyDescriptor(ItemsController.prototype, 'update'));
  Controller('/items')(ItemsController);

  const routes = [];
  const module = defineModule({
    name: 'items',
    version: '1.0.0',
    controllers: () => new ItemsController()
  });
  await module.register({
    http: {
      registerRoute: route => routes.push(route),
      unregisterRoute() {}
    }
  });

  assert.equal(routes[0].status, 202);
  assert.equal(routes[0].version, '1.1.0');
  assert.deepEqual(
    await routes[0].handler({ params: { id: '42' }, body: { title: 'clean' } }, {}),
    { id: '42', input: { title: 'clean' } }
  );
});

test('endpoint versions default to the module version', async () => {
  class HealthController {
    check() { return { ok: true }; }
  }
  decorateController(HealthController, '/health', [[Get, 'check', '', undefined]]);
  const routes = [];
  const module = defineModule({
    name: 'health',
    version: '3.2.1',
    controllers: () => new HealthController()
  });

  await module.register({
    http: {
      registerRoute: route => routes.push(route),
      unregisterRoute() {}
    }
  });

  assert.equal(routes[0].version, '3.2.1');
});
