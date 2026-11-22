import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidResourceId, resolveProvider } from './mailProxy';

test('resolveProvider allows only approved mail providers and defaults to mail.tm', () => {
  assert.equal(resolveProvider('https://api.mail.tm'), 'https://api.mail.tm');
  assert.equal(resolveProvider('https://api.mail.gw'), 'https://api.mail.gw');
  assert.equal(resolveProvider('https://evil.example.com'), 'https://api.mail.tm');
  assert.equal(resolveProvider(undefined), 'https://api.mail.tm');
});

test('isValidResourceId blocks path traversal and invalid characters', () => {
  assert.equal(isValidResourceId('6afb98c70be0e025f318c96f'), true);
  assert.equal(isValidResourceId('msg_123-abc'), true);
  assert.equal(isValidResourceId('../etc/passwd'), false);
  assert.equal(isValidResourceId('abc/def'), false);
  assert.equal(isValidResourceId(''), false);
});
