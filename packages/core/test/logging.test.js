'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { afterEach, test } = require('node:test');
const { FileTransport, MemoryTransport, createLogger } = require('../dist');

const temporaryDirectories = new Set();

afterEach(async () => {
  await Promise.all(Array.from(temporaryDirectories, async directory => {
    await rm(directory, { recursive: true, force: true });
    temporaryDirectories.delete(directory);
  }));
});

function createLoggerWithMemory(options = {}) {
  const memory = new MemoryTransport();
  return { memory, logger: createLogger({ transports: [memory], ...options }) };
}

test('logger drops records below the configured level', () => {
  const { memory, logger } = createLoggerWithMemory({ level: 'warn' });

  logger.debug('invisible');
  logger.info('also invisible');
  logger.warn('visible');

  assert.deepEqual(memory.list().map(record => record.message), ['visible']);
});

test('setLevel changes the threshold at runtime', () => {
  const { memory, logger } = createLoggerWithMemory({ level: 'info' });

  logger.debug('before');
  logger.setLevel('debug');
  logger.debug('after');

  assert.deepEqual(memory.list().map(record => record.message), ['after']);
});

test('child loggers append scope and inherit fields', () => {
  const { memory, logger } = createLoggerWithMemory({ scope: 'hivelet', fields: { service: 'api' } });

  logger.child('kernel', { region: 'eu' }).info('loaded', { module: 'users' });

  const [record] = memory.list();
  assert.equal(record.scope, 'hivelet.kernel');
  assert.deepEqual(record.fields, { service: 'api', region: 'eu', module: 'users' });
});

test('child loggers inherit a runtime level change', () => {
  const { memory, logger } = createLoggerWithMemory({ level: 'info' });
  logger.setLevel('debug');

  logger.child('kernel').debug('visible');

  assert.equal(memory.list().length, 1);
});

test('redacted fields never reach a transport', () => {
  const { memory, logger } = createLoggerWithMemory({ redact: ['token'] });

  logger.info('auth', { token: 'super-secret', user: 'mert' });

  assert.deepEqual(memory.list()[0].fields, { token: '[redacted]', user: 'mert' });
});

test('errors are serialized with name, message and stack', () => {
  const { memory, logger } = createLoggerWithMemory();

  logger.exception('reload failed', new TypeError('bad module'));

  const [record] = memory.list();
  assert.equal(record.level, 'error');
  assert.equal(record.error.name, 'TypeError');
  assert.equal(record.error.message, 'bad module');
  assert.ok(record.error.stack.includes('bad module'));
});

test('a throwing transport is reported instead of propagating', () => {
  const failures = [];
  const logger = createLogger({
    transports: [{
      name: 'broken',
      write() {
        throw new Error('disk full');
      }
    }],
    onTransportError: error => failures.push(error)
  });

  logger.info('still fine');

  assert.equal(failures.length, 1);
  assert.equal(failures[0].message, 'disk full');
});

test('per-transport levels are honoured independently', () => {
  const everything = new MemoryTransport();
  const errorsOnly = new MemoryTransport({ level: 'error' });
  const logger = createLogger({ level: 'debug', transports: [everything, errorsOnly] });

  logger.info('routine');
  logger.error('broken');

  assert.equal(everything.list().length, 2);
  assert.deepEqual(errorsOnly.list().map(record => record.message), ['broken']);
});

test('file transport writes newline delimited JSON', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hivelet-log-'));
  temporaryDirectories.add(directory);

  const filePath = path.join(directory, 'nested', 'app.log');
  const logger = createLogger({ transports: [new FileTransport({ filePath })] });

  logger.info('first', { module: 'users' });
  logger.warn('second');
  await logger.close();

  const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);

  const first = JSON.parse(lines[0]);
  assert.equal(first.level, 'info');
  assert.equal(first.message, 'first');
  assert.equal(first.module, 'users');
});

test('memory transport keeps only the newest records', () => {
  const memory = new MemoryTransport({ limit: 2 });
  const logger = createLogger({ transports: [memory] });

  logger.info('one');
  logger.info('two');
  logger.info('three');

  assert.deepEqual(memory.list().map(record => record.message), ['two', 'three']);
});
