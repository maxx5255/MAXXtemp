import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SyncStore,
  generateLinkCode,
  isValidLinkCode,
  type ServerTempAccount,
} from './syncStore';

const sampleAccount: ServerTempAccount = {
  id: 'acc_123',
  address: 'tester123@euploading.com',
  password: 'secret-password',
  token: 'jwt-token',
  apiBase: 'https://api.mail.tm',
  createdAt: '2026-11-22T00:00:00Z',
};

test('generateLinkCode produces valid uppercase alphanumeric codes', () => {
  const code = generateLinkCode(8);
  assert.equal(code.length, 8);
  assert.equal(isValidLinkCode(code), true);
  assert.equal(isValidLinkCode('bad!@#'), false);
});

test('SyncStore creates and consumes single-use link codes with expiry enforcement', () => {
  const store = new SyncStore();
  const now = 1_000_000;
  const entry = store.createLinkCode(sampleAccount, 'web', undefined, now);

  assert.equal(entry.account.address, sampleAccount.address);

  // Consuming works once
  const claimed = store.consumeLinkCode(entry.code.toLowerCase(), now + 1000);
  assert.ok(claimed);
  assert.equal(claimed.account.address, sampleAccount.address);

  // Second claim fails (single-use)
  assert.equal(store.consumeLinkCode(entry.code, now + 2000), null);

  // Expired code fails
  const expiredEntry = store.createLinkCode(sampleAccount, 'telegram', 42, now);
  assert.equal(
    store.consumeLinkCode(expiredEntry.code, now + 11 * 60 * 1000),
    null,
  );
});

test('SyncStore tracks notified message IDs and stats per Telegram chat', () => {
  const store = new SyncStore();
  store.setChatAccount(999, sampleAccount, ['m1']);

  assert.deepEqual(store.filterUnnotifiedMessageIds(999, ['m1', 'm2', 'm3']), [
    'm2',
    'm3',
  ]);
  store.markNotified(999, ['m2']);
  assert.deepEqual(store.filterUnnotifiedMessageIds(999, ['m1', 'm2', 'm3']), [
    'm3',
  ]);

  const stats = store.getStats(999);
  assert.equal(stats.activeInboxes, 1);
  assert.equal(stats.totalGenerated, 1);
  assert.equal(stats.chatGenerated, 1);
  assert.equal(stats.chatReceived, 1);
  assert.equal(stats.totalEmailsReceived, 1);
});
