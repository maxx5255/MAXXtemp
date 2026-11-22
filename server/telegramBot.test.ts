import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_REPLY_KEYBOARD,
  escapeTelegramHtml,
  formatTelegramEmailDetail,
  formatTelegramInboxList,
  formatTelegramStatistics,
  parseTelegramCommand,
  truncateEscapedTelegramHtml,
} from './telegramBot';

test('parseTelegramCommand extracts command, bot mention, and arguments', () => {
  assert.deepEqual(parseTelegramCommand('/start link_ABCD1234'), {
    command: 'start',
    args: 'link_ABCD1234',
  });
  assert.deepEqual(parseTelegramCommand('/new@TempMailBot alex_dev'), {
    command: 'new',
    args: 'alex_dev',
  });
  assert.deepEqual(parseTelegramCommand('hello'), {
    command: null,
    args: 'hello',
  });
});

test('escapeTelegramHtml prevents HTML injection in Telegram messages', () => {
  assert.equal(
    escapeTelegramHtml('<script>alert("x")</script> & test'),
    '&lt;script&gt;alert("x")&lt;/script&gt; &amp; test',
  );
});

test('truncateEscapedTelegramHtml never splits an HTML entity across the cutoff', () => {
  const raw = 'abc&lt;def';
  const out = truncateEscapedTelegramHtml(raw, 5); // cuts inside &lt;
  assert.equal(out, 'abc\n\n…(truncated)');
});

test('formatTelegramInboxList renders sorted summaries and empty state', () => {
  const emptyText = formatTelegramInboxList('user@euploading.com', []);
  assert.match(emptyText, /user@euploading\.com/);
  assert.match(emptyText, /No messages yet/);

  const populated = formatTelegramInboxList('user@euploading.com', [
    {
      id: '1',
      from: { address: 'security@github.com', name: 'GitHub' },
      subject: 'Your OTP is 918273',
      seen: false,
      createdAt: new Date().toISOString(),
    },
  ]);
  assert.match(populated, /GitHub/);
  assert.match(populated, /#1/);
});

test('formatTelegramEmailDetail highlights OTP codes and includes recipient when provided', () => {
  const formatted = formatTelegramEmailDetail(
    {
      id: 'm1',
      from: { address: 'auth@example.com', name: 'Auth' },
      subject: 'Verify your login',
      text: 'Your verification code is 558812.',
      seen: false,
      createdAt: new Date().toISOString(),
    },
    '<b>📩 New Email Received</b>',
    'user@euploading.com',
  );
  assert.match(formatted, /<code>558812<\/code>/);
  assert.match(formatted, /<b>To:<\/b> <code>user@euploading\.com<\/code>/);
});

test('BOT_REPLY_KEYBOARD matches the exact 3-button layout', () => {
  assert.deepEqual(BOT_REPLY_KEYBOARD.keyboard, [
    [{ text: '📧 Generate' }, { text: '📫 Inbox' }],
    [{ text: '📊 Statistics' }],
  ]);
  assert.equal(BOT_REPLY_KEYBOARD.resize_keyboard, true);
  assert.equal(BOT_REPLY_KEYBOARD.is_persistent, true);
});

test('formatTelegramStatistics formats session and global counters cleanly', () => {
  const text = formatTelegramStatistics({
    address: 'alex@euploading.com',
    inboxTotal: 3,
    inboxUnread: 1,
    chatGenerated: 2,
    chatReceived: 5,
    activeInboxes: 4,
    totalGenerated: 10,
    totalEmailsReceived: 22,
    webSyncCode: 'ABCD1234',
  });
  assert.match(text, /alex@euploading\.com/);
  assert.match(text, /3 \(1 unread\)/);
  assert.match(text, /<code>ABCD1234<\/code>/);
});
