'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HiveletNestLogger } = require('../dist');

test('HiveletNestLogger routes Nest messages through the Hivelet logger', () => {
  const records = [];
  const logger = {
    log(message, fields) { records.push(['info', message, fields]); },
    warn(message, fields) { records.push(['warn', message, fields]); },
    error(message, fields, error) { records.push(['error', message, fields, error]); },
    debug(message, fields) { records.push(['debug', message, fields]); },
    trace(message, fields) { records.push(['trace', message, fields]); }
  };
  const bridge = new HiveletNestLogger(logger);

  bridge.log('started', 'NestFactory');
  bridge.debug('mapped', { route: '/todos' }, 'RoutesResolver');
  const failure = new Error('failed');
  bridge.error(failure, 'ExceptionsHandler');

  assert.deepEqual(records[0], ['info', 'started', { source: 'nestjs', context: 'NestFactory' }]);
  assert.deepEqual(records[1], [
    'debug',
    'mapped',
    { source: 'nestjs', context: 'RoutesResolver', details: [{ route: '/todos' }] }
  ]);
  assert.deepEqual(records[2], [
    'error',
    'failed',
    { source: 'nestjs', context: 'ExceptionsHandler' },
    failure
  ]);
});
