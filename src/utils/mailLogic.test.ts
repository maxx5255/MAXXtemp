import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForwardedEmailPayload,
  extractOtpCodes,
  filterMessages,
  formatApiErrorMessage,
  formatRelativeTime,
  generateRandomLocalPart,
  isValidPersonalEmail,
  sanitizeCustomLocalPart,
  selectBestDomain,
  stripHtmlToText,
} from './mailLogic';
import type { MailDomain, MailSummary } from '../types/mail';

test('generateRandomLocalPart creates alphanumeric lowercase strings of requested length', () => {
  const part = generateRandomLocalPart(12);
  assert.equal(part.length, 12);
  assert.match(part, /^[a-z0-9]{12}$/);
});

test('sanitizeCustomLocalPart strips invalid email local-part characters', () => {
  assert.equal(sanitizeCustomLocalPart('  My.Test+User!@#  '), 'my.testuser');
  assert.equal(sanitizeCustomLocalPart('---hello_world---'), 'hello_world');
});

test('selectBestDomain prefers active non-private domains', () => {
  const domains: MailDomain[] = [
    { id: '1', domain: 'private.example', isActive: true, isPrivate: true },
    { id: '2', domain: 'inactive.example', isActive: false, isPrivate: false },
    { id: '3', domain: 'public.example', isActive: true, isPrivate: false },
  ];
  assert.equal(selectBestDomain(domains)?.domain, 'public.example');
  assert.equal(selectBestDomain([]), null);
});

test('extractOtpCodes extracts verification codes and ignores URLs', () => {
  const body =
    'Your verification code is 492817. Visit https://example.com/reset/99887766 to continue.';
  assert.deepEqual(extractOtpCodes(body), ['492817']);

  const pinBody = 'Use OTP: 8392 to sign in to your account from 2026.';
  assert.deepEqual(extractOtpCodes(pinBody), ['8392']);
});

test('stripHtmlToText converts HTML emails cleanly into readable text', () => {
  const html = '<style>.x{color:red}</style><p>Hello <b>Alex</b>,<br/>Code: 123456</p>';
  const text = stripHtmlToText(html);
  assert.equal(text, 'Hello Alex,\nCode: 123456');
});

test('filterMessages sorts newest first and filters by query and unread state', () => {
  const msgs: MailSummary[] = [
    {
      id: '1',
      from: { address: 'noreply@github.com', name: 'GitHub' },
      subject: 'Your verification code',
      seen: true,
      createdAt: '2026-11-20T10:00:00Z',
    },
    {
      id: '2',
      from: { address: 'team@linear.app', name: 'Linear' },
      subject: 'Welcome aboard',
      seen: false,
      createdAt: '2026-11-21T12:00:00Z',
    },
  ];

  assert.deepEqual(
    filterMessages(msgs, '', 'all').map((m) => m.id),
    ['2', '1'],
  );
  assert.deepEqual(
    filterMessages(msgs, '', 'unread').map((m) => m.id),
    ['2'],
  );
  assert.deepEqual(
    filterMessages(msgs, 'github', 'all').map((m) => m.id),
    ['1'],
  );
});

test('formatRelativeTime formats timestamps cleanly', () => {
  const now = new Date('2026-11-21T12:00:00Z').getTime();
  assert.equal(formatRelativeTime('2026-11-21T11:59:45Z', now), 'now');
  assert.equal(formatRelativeTime('2026-11-21T11:45:00Z', now), '15m ago');
  assert.equal(formatRelativeTime('2026-11-21T09:00:00Z', now), '3h ago');
});

test('formatApiErrorMessage maps HTTP status codes cleanly', () => {
  assert.match(formatApiErrorMessage(429, ''), /Rate limit/);
  assert.match(
    formatApiErrorMessage(422, JSON.stringify({ 'hydra:description': 'Address already used' })),
    /Address already used/,
  );
});

test('isValidPersonalEmail validates email syntax and blocks header injection characters', () => {
  assert.equal(isValidPersonalEmail('alex.doe+work@gmail.com'), true);
  assert.equal(isValidPersonalEmail('  user@domain.co.uk  '), true);
  assert.equal(isValidPersonalEmail('not-an-email'), false);
  assert.equal(isValidPersonalEmail('a@b'), false);
  assert.equal(isValidPersonalEmail('user@gmail.com\r\nBcc: evil@attacker.com'), false);
  assert.equal(isValidPersonalEmail('a@b.com,c@d.com'), false);
});

test('buildForwardedEmailPayload formats Fwd subject, note, metadata, and safe mailto URL', () => {
  const payload = buildForwardedEmailPayload({
    fromAddress: 'security@acme.com',
    fromName: 'Acme Security',
    toDisposableAddress: 'temp123@euploading.com',
    subject: 'Your login code',
    createdAt: '2026-11-21T12:00:00Z',
    plainBody: 'Use verification code 482910.',
    recipientEmail: 'personal@gmail.com',
    note: 'Saving this code for later.',
  });

  assert.equal(payload.subject, 'Fwd: Your login code');
  assert.match(payload.textBody, /Saving this code for later\./);
  assert.match(payload.textBody, /From: Acme Security <security@acme\.com>/);
  assert.match(payload.textBody, /Use verification code 482910\./);
  assert.ok(payload.mailtoUrl.startsWith('mailto:personal%40gmail.com?subject=Fwd%3A'));

  const alreadyFwd = buildForwardedEmailPayload({
    fromAddress: 'a@b.com',
    subject: 'Fwd: Receipt',
    createdAt: '2026-11-21T12:00:00Z',
    plainBody: 'Receipt body',
    recipientEmail: 'personal@gmail.com',
  });
  assert.equal(alreadyFwd.subject, 'Fwd: Receipt');
});

