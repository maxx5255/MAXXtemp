import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatForwardedServerEmail,
  getForwardRelayStatus,
  sanitizeForwardNote,
  validateForwardTargetEmail,
} from './mailForwarder';
import type { MailDetail } from '../src/types/mail';

test('validateForwardTargetEmail accepts valid emails and rejects header injection', () => {
  assert.equal(validateForwardTargetEmail('  person@gmail.com '), 'person@gmail.com');
  assert.equal(validateForwardTargetEmail('bad-email'), null);
  assert.equal(validateForwardTargetEmail('a@b.com\nCc:evil@b.com'), null);
  assert.equal(validateForwardTargetEmail(123), null);
});

test('sanitizeForwardNote strips control characters and bounds length', () => {
  assert.equal(sanitizeForwardNote('Hello\u0000World\nLine 2'), 'HelloWorld\nLine 2');
  assert.equal(sanitizeForwardNote('x'.repeat(2500)).length, 2000);
});

test('formatForwardedServerEmail escapes untrusted HTML content safely', () => {
  const detail: MailDetail = {
    id: 'msg1',
    from: { address: 'sender@example.com', name: 'Sender <Admin>' },
    subject: 'Verify <script>alert(1)</script>',
    seen: true,
    createdAt: '2026-11-21T12:00:00Z',
    text: 'Code: 123456 <img src=x onerror=alert(1)>',
  };

  const formatted = formatForwardedServerEmail({
    detail,
    recipientEmail: 'me@gmail.com',
    note: 'Check <tag>',
    disposableAddress: 'temp@euploading.com',
  });

  assert.equal(formatted.subject, 'Fwd: Verify <script>alert(1)</script>');
  assert.doesNotMatch(formatted.html, /<script>/);
  assert.doesNotMatch(formatted.html, /<img/);
  assert.match(formatted.html, /&lt;script&gt;/);
  assert.match(formatted.html, /Check &lt;tag&gt;/);
});

test('getForwardRelayStatus returns unconfigured when SMTP and RESEND env vars are absent', () => {
  const prevHost = process.env.SMTP_HOST;
  const prevResend = process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.RESEND_API_KEY;

  try {
    const status = getForwardRelayStatus();
    assert.deepEqual(status, { relayConfigured: false, relayProvider: null });
  } finally {
    if (prevHost !== undefined) process.env.SMTP_HOST = prevHost;
    if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
  }
});
