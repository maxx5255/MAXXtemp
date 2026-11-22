import {
  extractOtpCodes,
  formatRelativeTime,
  generateRandomLocalPart,
  generateSecurePassword,
  normalizeHtmlBody,
  sanitizeCustomLocalPart,
  selectBestDomain,
  sortMessagesNewestFirst,
  stripHtmlToText,
} from '../src/utils/mailLogic';
import type { MailDetail, MailDomain, MailSummary } from '../src/types/mail';
import {
  ALLOWED_PROVIDERS,
  isValidResourceId,
  upstreamFetch,
  type AllowedProvider,
} from './mailProxy';
import { syncStore, type ServerTempAccount } from './syncStore';
import {
  getForwardRelayStatus,
  sendForwardedEmail,
  validateForwardTargetEmail,
} from './mailForwarder';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: {
      message_id: number;
      chat: { id: number };
    };
    data?: string;
  };
}

export interface TelegramBotStatus {
  configured: boolean;
  connected: boolean;
  botUsername: string | null;
  botName: string | null;
  activeSessions: number;
  lastError: string | null;
}

export function escapeTelegramHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function parseTelegramCommand(rawText?: string): {
  command: string | null;
  args: string;
} {
  if (!rawText) return { command: null, args: '' };
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('/')) return { command: null, args: trimmed };

  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  const cmdPart = head.slice(1).split('@')[0].toLowerCase();
  return { command: cmdPart || null, args };
}

export function formatTelegramInboxList(
  address: string,
  messages: MailSummary[],
): string {
  const sorted = sortMessagesNewestFirst(messages);
  if (sorted.length === 0) {
    return [
      `<b>Mailbox:</b> <code>${escapeTelegramHtml(address)}</code>`,
      '',
      '<i>No messages yet.</i> Send an email to this address and it will appear here automatically.',
    ].join('\n');
  }

  const lines = [
    `<b>Inbox</b> (${sorted.length} ${sorted.length === 1 ? 'message' : 'messages'})`,
    `<code>${escapeTelegramHtml(address)}</code>`,
    '',
  ];

  sorted.slice(0, 8).forEach((m, idx) => {
    const marker = m.seen ? '○' : '●';
    const from = escapeTelegramHtml(
      m.from?.name?.trim() || m.from?.address || 'Unknown',
    );
    const subj = escapeTelegramHtml(m.subject || '(no subject)');
    const when = escapeTelegramHtml(formatRelativeTime(m.createdAt));
    lines.push(`${marker} <b>#${idx + 1}</b> ${from} · <i>${when}</i>`);
    lines.push(`   ${subj}`);
  });

  if (sorted.length > 8) {
    lines.push('', `<i>Showing latest 8 of ${sorted.length} messages.</i>`);
  }

  return lines.join('\n');
}

export function truncateEscapedTelegramHtml(
  escaped: string,
  maxLen = 2600,
): string {
  if (escaped.length <= maxLen) return escaped;
  let cut = escaped.slice(0, maxLen);
  const lastAmp = cut.lastIndexOf('&');
  const lastSemi = cut.lastIndexOf(';');
  if (lastAmp > lastSemi) {
    cut = cut.slice(0, lastAmp);
  }
  return `${cut}\n\n…(truncated)`;
}

export function formatTelegramEmailDetail(
  detail: MailDetail,
  headingPrefix = '',
  recipientAddress?: string,
): string {
  const fromName = detail.from?.name?.trim();
  const fromAddr = detail.from?.address || 'Unknown';
  const fromDisplay = fromName
    ? `${fromName} <${fromAddr}>`
    : fromAddr;

  const htmlStr = normalizeHtmlBody(detail.html);
  const plainBody =
    detail.text?.trim() || stripHtmlToText(htmlStr) || '(empty message)';
  const otps = extractOtpCodes(`${detail.subject || ''} ${plainBody}`);

  const lines: string[] = [];
  if (headingPrefix) {
    lines.push(headingPrefix, '');
  }
  if (recipientAddress) {
    lines.push(`<b>To:</b> <code>${escapeTelegramHtml(recipientAddress)}</code>`);
  }
  lines.push(
    `<b>From:</b> ${escapeTelegramHtml(fromDisplay)}`,
    `<b>Subject:</b> ${escapeTelegramHtml(detail.subject || '(no subject)')}`,
  );

  if (otps.length > 0) {
    lines.push(
      '',
      `<b>Code:</b> ${otps.map((c) => `<code>${escapeTelegramHtml(c)}</code>`).join('  ')}`,
    );
  }

  const escapedBody = truncateEscapedTelegramHtml(
    escapeTelegramHtml(plainBody),
    2600,
  );
  lines.push('', escapedBody);
  return lines.join('\n');
}

export const BOT_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: '📧 Generate' }, { text: '📫 Inbox' }],
    [{ text: '📊 Statistics' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export function formatTelegramStatistics(params: {
  address: string | null;
  inboxTotal: number;
  inboxUnread: number;
  chatGenerated: number;
  chatReceived: number;
  activeInboxes: number;
  totalGenerated: number;
  totalEmailsReceived: number;
  webSyncCode?: string | null;
}): string {
  const lines = [
    '<b>📊 MAXXtemp Statistics</b>',
    '',
    params.address
      ? `<b>Active Address:</b> <code>${escapeTelegramHtml(params.address)}</code>`
      : '<b>Active Address:</b> <i>None (tap 📧 Generate)</i>',
    `<b>Inbox Messages:</b> ${params.inboxTotal} (${params.inboxUnread} unread)`,
    '',
    '<b>Your Session:</b>',
    `• Addresses generated: ${params.chatGenerated}`,
    `• Emails received: ${params.chatReceived}`,
    '',
    '<b>Bot Totals:</b>',
    `• Active inboxes: ${params.activeInboxes}`,
    `• Total generated: ${params.totalGenerated}`,
    `• Total emails delivered: ${params.totalEmailsReceived}`,
  ];

  if (params.webSyncCode) {
    lines.push(
      '',
      `<b>Website Sync Code:</b> <code>${escapeTelegramHtml(params.webSyncCode)}</code>`,
    );
  }

  return lines.join('\n');
}

class TelegramBotService {
  private pollingActive = false;
  private isPollingEmails = false;
  private pollAbort: AbortController | null = null;
  private backgroundTimer: NodeJS.Timeout | null = null;
  private updateOffset = 0;
  private pendingForwardMsgByChat = new Map<number, string>();

  private connected = false;
  private botUsername: string | null = null;
  private botName: string | null = null;
  private lastError: string | null = null;

  private getToken(): string | null {
    const raw = process.env.TELEGRAM_BOT_TOKEN?.trim();
    return raw ? raw : null;
  }

  private getAppBaseUrl(): string | null {
    const raw = process.env.APP_URL?.trim();
    if (!raw || raw === 'MY_APP_URL') return null;
    return raw.replace(/\/+$/, '');
  }

  getStatus(): TelegramBotStatus {
    const configured = Boolean(this.getToken());
    return {
      configured,
      connected: configured && this.connected,
      botUsername: this.botUsername,
      botName: this.botName,
      activeSessions: syncStore.listActiveChats().length,
      lastError: this.lastError,
    };
  }

  private async callTelegram<T>(
    method: string,
    payload?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = this.getToken();
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

    const url = `https://api.telegram.org/bot${token}/${method}`;
    const res = await fetch(url, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: signal ?? AbortSignal.timeout(35000),
    });

    const data = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };

    if (!res.ok || !data.ok) {
      throw new Error(data.description || `Telegram API HTTP ${res.status}`);
    }
    return data.result as T;
  }

  private async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    await this.callTelegram('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  private async createUpstreamAccount(
    customLocalPart?: string,
  ): Promise<ServerTempAccount> {
    let lastError = 'Unable to reach mail provider';

    for (const provider of ALLOWED_PROVIDERS) {
      try {
        const domRes = await upstreamFetch(`${provider}/domains?page=1`, {
          headers: { Accept: 'application/ld+json, application/json' },
        });
        if (domRes.status < 200 || domRes.status >= 300) {
          lastError = `Provider HTTP ${domRes.status}`;
          continue;
        }
        const parsed = JSON.parse(domRes.bodyText || '{}');
        const list: MailDomain[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed['hydra:member'])
            ? parsed['hydra:member']
            : [];
        const domain = selectBestDomain(list);
        if (!domain) continue;

        const cleanCustom = customLocalPart
          ? sanitizeCustomLocalPart(customLocalPart)
          : '';
        const localPart =
          cleanCustom.length >= 3 ? cleanCustom : generateRandomLocalPart(10);
        const address = `${localPart}@${domain.domain}`;
        const password = generateSecurePassword(18);

        const accRes = await upstreamFetch(`${provider}/accounts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ address, password }),
        });

        if (accRes.status < 200 || accRes.status >= 300) {
          lastError = `Account creation failed (${accRes.status})`;
          continue;
        }

        const tokRes = await upstreamFetch(`${provider}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ address, password }),
        });

        if (tokRes.status < 200 || tokRes.status >= 300) {
          lastError = `Token auth failed (${tokRes.status})`;
          continue;
        }

        const tokenJson = JSON.parse(tokRes.bodyText || '{}') as {
          id?: string;
          token?: string;
        };
        if (!tokenJson.token) continue;

        return {
          id: tokenJson.id || '',
          address,
          password,
          token: tokenJson.token,
          apiBase: provider as AllowedProvider,
          createdAt: new Date().toISOString(),
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    throw new Error(lastError);
  }

  private async refreshChatToken(
    chatId: number,
    account: ServerTempAccount,
  ): Promise<ServerTempAccount> {
    const tokRes = await upstreamFetch(`${account.apiBase}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        address: account.address,
        password: account.password,
      }),
    });
    if (tokRes.status < 200 || tokRes.status >= 300) {
      throw new Error(`Re-auth failed (${tokRes.status})`);
    }
    const parsed = JSON.parse(tokRes.bodyText || '{}') as {
      id?: string;
      token?: string;
    };
    if (!parsed.token) throw new Error('Missing refreshed token');
    syncStore.updateChatAccountToken(chatId, parsed.token, parsed.id);
    return { ...account, token: parsed.token, id: parsed.id || account.id };
  }

  private async fetchChatMessages(
    chatId: number,
    account: ServerTempAccount,
  ): Promise<MailSummary[]> {
    const fetchWithToken = async (tok: string) =>
      upstreamFetch(`${account.apiBase}/messages?page=1`, {
        headers: {
          Authorization: `Bearer ${tok}`,
          Accept: 'application/ld+json, application/json',
        },
      });

    let res = await fetchWithToken(account.token);
    if (res.status === 401) {
      const updated = await this.refreshChatToken(chatId, account);
      res = await fetchWithToken(updated.token);
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Inbox fetch failed (${res.status})`);
    }

    const parsed = JSON.parse(res.bodyText || '{}');
    const members: MailSummary[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed['hydra:member'])
        ? parsed['hydra:member']
        : [];
    return members;
  }

  private async fetchChatMessageDetail(
    chatId: number,
    account: ServerTempAccount,
    messageId: string,
  ): Promise<MailDetail> {
    if (!isValidResourceId(messageId)) {
      throw new Error('Invalid message ID');
    }

    const fetchDetail = (tok: string) =>
      upstreamFetch(`${account.apiBase}/messages/${messageId}`, {
        headers: {
          Authorization: `Bearer ${tok}`,
          Accept: 'application/json',
        },
      });

    let res = await fetchDetail(account.token);
    if (res.status === 401) {
      const updated = await this.refreshChatToken(chatId, account);
      res = await fetchDetail(updated.token);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Message load failed (${res.status})`);
    }
    return JSON.parse(res.bodyText || '{}') as MailDetail;
  }

  private async markChatMessageSeen(
    account: ServerTempAccount,
    messageId: string,
  ): Promise<void> {
    if (!isValidResourceId(messageId)) return;
    await upstreamFetch(`${account.apiBase}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${account.token}`,
        'Content-Type': 'application/merge-patch+json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ seen: true }),
    }).catch(() => {});
  }

  private async handleLinkFromWebsite(
    chatId: number,
    rawCode: string,
  ): Promise<void> {
    const entry = syncStore.consumeLinkCode(rawCode);
    if (!entry) {
      await this.sendMessage(
        chatId,
        'Link code is invalid or expired. Generate a fresh code from the MAXXtemp website.',
      );
      return;
    }

    let alreadyReadIds: string[] = [];
    try {
      const existing = await this.fetchChatMessages(chatId, entry.account);
      alreadyReadIds = existing.filter((m) => m.seen).map((m) => m.id);
    } catch {
      alreadyReadIds = [];
    }

    syncStore.setChatAccount(chatId, entry.account, alreadyReadIds);
    await this.sendMessage(
      chatId,
      [
        '<b>Synced with Website Inbox</b>',
        '',
        `Address: <code>${escapeTelegramHtml(entry.account.address)}</code>`,
        '',
        'Any new or unread emails will be pushed automatically right here in Telegram.',
      ].join('\n'),
      BOT_REPLY_KEYBOARD,
    );
    void this.pollIncomingEmailsForChats();
  }

  private async handleNewAddress(
    chatId: number,
    customPrefix?: string,
  ): Promise<void> {
    try {
      const account = await this.createUpstreamAccount(customPrefix);
      syncStore.setChatAccount(chatId, account, []);
      await this.sendMessage(
        chatId,
        [
          '<b>Temporary Email Created</b>',
          '',
          `Tap to copy: <code>${escapeTelegramHtml(account.address)}</code>`,
          '',
          'Tap <b>📫 Inbox</b> anytime to check messages, or wait for automatic push alerts.',
        ].join('\n'),
        BOT_REPLY_KEYBOARD,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to create address';
      await this.sendMessage(
        chatId,
        `Could not create inbox: ${escapeTelegramHtml(msg)}`,
        BOT_REPLY_KEYBOARD,
      );
    }
  }

  private async handleShowInbox(chatId: number): Promise<void> {
    const session = syncStore.getChatSession(chatId);
    if (!session) {
      await this.sendMessage(
        chatId,
        'You do not have an active inbox yet. Tap <b>📧 Generate</b> to create one.',
        BOT_REPLY_KEYBOARD,
      );
      return;
    }

    try {
      const messages = await this.fetchChatMessages(chatId, session.account);
      syncStore.markNotified(
        chatId,
        messages.map((m) => m.id),
      );
      const sorted = sortMessagesNewestFirst(messages);

      if (sorted.length === 0) {
        await this.sendMessage(
          chatId,
          formatTelegramInboxList(session.account.address, sorted),
          BOT_REPLY_KEYBOARD,
        );
        return;
      }

      const readButtons = sorted.slice(0, 6).map((m, idx) => ({
        text: `Read #${idx + 1}`,
        callback_data: `read_msg:${m.id}`,
      }));

      const rows: Array<Array<{ text: string; callback_data: string }>> = [];
      for (let i = 0; i < readButtons.length; i += 3) {
        rows.push(readButtons.slice(i, i + 3));
      }

      await this.sendMessage(
        chatId,
        formatTelegramInboxList(session.account.address, sorted),
        { inline_keyboard: rows },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refresh failed';
      await this.sendMessage(
        chatId,
        `Could not check inbox: ${escapeTelegramHtml(msg)}`,
        BOT_REPLY_KEYBOARD,
      );
    }
  }

  private async handleShowStatistics(chatId: number): Promise<void> {
    const session = syncStore.getChatSession(chatId);
    const stats = syncStore.getStats(chatId);

    let inboxTotal = 0;
    let inboxUnread = 0;
    let webSyncCode: string | null = null;

    if (session) {
      try {
        const msgs = await this.fetchChatMessages(chatId, session.account);
        inboxTotal = msgs.length;
        inboxUnread = msgs.filter((m) => !m.seen).length;
      } catch {
        // Keep 0 if upstream temporarily unavailable
      }
      const entry = syncStore.createLinkCode(session.account, 'telegram', chatId);
      webSyncCode = entry.code;
    }

    await this.sendMessage(
      chatId,
      formatTelegramStatistics({
        address: session?.account.address ?? null,
        inboxTotal,
        inboxUnread,
        chatGenerated: stats.chatGenerated,
        chatReceived: stats.chatReceived,
        activeInboxes: stats.activeInboxes,
        totalGenerated: stats.totalGenerated,
        totalEmailsReceived: stats.totalEmailsReceived,
        webSyncCode,
      }),
      BOT_REPLY_KEYBOARD,
    );
  }

  private async handleReadMessageById(
    chatId: number,
    messageId: string,
  ): Promise<void> {
    const session = syncStore.getChatSession(chatId);
    if (!session) {
      await this.sendMessage(chatId, 'No active inbox. Use /new first.');
      return;
    }

    try {
      const detail = await this.fetchChatMessageDetail(
        chatId,
        session.account,
        messageId,
      );
      await this.markChatMessageSeen(session.account, messageId);
      await this.sendMessage(chatId, formatTelegramEmailDetail(detail), {
        inline_keyboard: [
          [
            { text: 'Back to Inbox', callback_data: 'refresh_inbox' },
            { text: 'Forward Email', callback_data: `fwd_msg:${messageId}` },
          ],
          [{ text: 'Delete Email', callback_data: `del_msg:${messageId}` }],
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Load failed';
      await this.sendMessage(
        chatId,
        `Could not open message: ${escapeTelegramHtml(msg)}`,
      );
    }
  }

  private async handleShowWebCode(chatId: number): Promise<void> {
    const session = syncStore.getChatSession(chatId);
    if (!session) {
      await this.sendMessage(
        chatId,
        'Create an inbox first with /new before syncing to the website.',
      );
      return;
    }

    const entry = syncStore.createLinkCode(session.account, 'telegram', chatId);
    const appBase = this.getAppBaseUrl();
    const lines = [
      '<b>Sync to MAXXtemp Website</b>',
      '',
      `One-time Sync Code: <code>${entry.code}</code>`,
      'Valid for 10 minutes. Enter this code in the <b>Import from Telegram</b> box on the website.',
    ];
    if (appBase) {
      lines.push('', `Direct Link: ${escapeTelegramHtml(`${appBase}?sync=${entry.code}`)}`);
    }

    await this.sendMessage(chatId, lines.join('\n'), BOT_REPLY_KEYBOARD);
  }

  private async handleDeleteInbox(chatId: number): Promise<void> {
    const session = syncStore.getChatSession(chatId);
    if (!session) {
      await this.sendMessage(chatId, 'No active inbox to delete.', BOT_REPLY_KEYBOARD);
      return;
    }

    if (session.account.id && isValidResourceId(session.account.id)) {
      await upstreamFetch(
        `${session.account.apiBase}/accounts/${session.account.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.account.token}` },
        },
      ).catch(() => {});
    }

    syncStore.deleteChatAccount(chatId);
    await this.sendMessage(
      chatId,
      'Inbox deleted. Tap <b>📧 Generate</b> anytime to create a fresh temporary address.',
      BOT_REPLY_KEYBOARD,
    );
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id ?? cq.from.id;
      const data = cq.data || '';

      await this.callTelegram('answerCallbackQuery', {
        callback_query_id: cq.id,
      }).catch(() => {});

      if (data === 'new_inbox') {
        await this.handleNewAddress(chatId);
      } else if (data === 'refresh_inbox') {
        await this.handleShowInbox(chatId);
      } else if (data === 'show_web_code') {
        await this.handleShowWebCode(chatId);
      } else if (data === 'delete_inbox') {
        await this.handleDeleteInbox(chatId);
      } else if (data.startsWith('read_msg:')) {
        await this.handleReadMessageById(chatId, data.slice('read_msg:'.length));
      } else if (data.startsWith('fwd_msg:')) {
        const msgId = data.slice('fwd_msg:'.length);
        if (isValidResourceId(msgId)) {
          this.pendingForwardMsgByChat.set(chatId, msgId);
          await this.sendMessage(
            chatId,
            'Reply with your personal email address (for example <code>you@gmail.com</code>) or send <code>/forward you@gmail.com</code>.',
            BOT_REPLY_KEYBOARD,
          );
        }
      } else if (data.startsWith('del_msg:')) {
        const msgId = data.slice('del_msg:'.length);
        const session = syncStore.getChatSession(chatId);
        if (session && isValidResourceId(msgId)) {
          await upstreamFetch(
            `${session.account.apiBase}/messages/${msgId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${session.account.token}` },
            },
          ).catch(() => {});
          await this.sendMessage(chatId, 'Message deleted.', BOT_REPLY_KEYBOARD);
        }
      }
      return;
    }

    const msg = update.message;
    if (!msg?.text) return;
    const chatId = msg.chat.id;
    const rawText = msg.text.trim();

    // Match the 3 persistent Reply Keyboard buttons
    if (rawText === '📧 Generate' || rawText.toLowerCase() === 'generate') {
      this.pendingForwardMsgByChat.delete(chatId);
      await this.handleNewAddress(chatId);
      return;
    }
    if (rawText === '📫 Inbox' || rawText.toLowerCase() === 'inbox') {
      this.pendingForwardMsgByChat.delete(chatId);
      await this.handleShowInbox(chatId);
      return;
    }
    if (rawText === '📊 Statistics' || rawText.toLowerCase() === 'statistics') {
      this.pendingForwardMsgByChat.delete(chatId);
      await this.handleShowStatistics(chatId);
      return;
    }

    const pendingMsgId = this.pendingForwardMsgByChat.get(chatId);
    if (pendingMsgId && !rawText.startsWith('/')) {
      const targetEmail = validateForwardTargetEmail(rawText);
      if (targetEmail) {
        this.pendingForwardMsgByChat.delete(chatId);
        await this.handleForwardEmailCommand(chatId, targetEmail, pendingMsgId);
        return;
      }
    }

    const { command, args } = parseTelegramCommand(rawText);

    if (command === 'start') {
      if (args.startsWith('link_')) {
        await this.handleLinkFromWebsite(chatId, args.slice(5));
        return;
      }

      const session = syncStore.getChatSession(chatId);
      const intro = [
        '<b>MAXXtemp Temp Mail</b>',
        '',
        session
          ? `Active address: <code>${escapeTelegramHtml(session.account.address)}</code>`
          : 'Tap <b>📧 Generate</b> below to create an instant disposable email address.',
      ].join('\n');

      await this.sendMessage(chatId, intro, BOT_REPLY_KEYBOARD);
      return;
    }

    if (command === 'new') {
      await this.handleNewAddress(chatId, args || undefined);
      return;
    }

    if (command === 'inbox' || command === 'check') {
      await this.handleShowInbox(chatId);
      return;
    }

    if (command === 'read') {
      const session = syncStore.getChatSession(chatId);
      if (!session) {
        await this.sendMessage(chatId, 'No active inbox. Use /new first.');
        return;
      }
      const idx = Number.parseInt(args, 10);
      if (!Number.isFinite(idx) || idx < 1) {
        await this.sendMessage(chatId, 'Usage: <code>/read 1</code>');
        return;
      }
      const list = sortMessagesNewestFirst(
        await this.fetchChatMessages(chatId, session.account),
      );
      const target = list[idx - 1];
      if (!target) {
        await this.sendMessage(chatId, `Message #${idx} not found.`);
        return;
      }
      await this.handleReadMessageById(chatId, target.id);
      return;
    }

    if (command === 'web') {
      await this.handleShowWebCode(chatId);
      return;
    }

    if (command === 'link') {
      if (!args) {
        await this.sendMessage(
          chatId,
          'Usage: <code>/link CODE</code> (copy the code from the MAXXtemp website).',
        );
        return;
      }
      await this.handleLinkFromWebsite(chatId, args);
      return;
    }

    if (command === 'delete') {
      await this.handleDeleteInbox(chatId);
      return;
    }

    if (command === 'stats' || command === 'statistics') {
      await this.handleShowStatistics(chatId);
      return;
    }

    if (command === 'forward') {
      const targetEmail = validateForwardTargetEmail(args);
      if (!targetEmail) {
        await this.sendMessage(
          chatId,
          'Usage: <code>/forward yourname@gmail.com</code>',
          BOT_REPLY_KEYBOARD,
        );
        return;
      }
      await this.handleForwardEmailCommand(chatId, targetEmail);
      return;
    }

    if (command === 'help') {
      await this.sendMessage(
        chatId,
        'Use the keyboard buttons below (📧 Generate, 📫 Inbox, 📊 Statistics) or /new, /inbox, /stats, /forward, /web, /link CODE.',
        BOT_REPLY_KEYBOARD,
      );
    }
  }

  private async handleForwardEmailCommand(
    chatId: number,
    targetEmail: string,
    explicitMessageId?: string,
  ): Promise<void> {
    const session = syncStore.getChatSession(chatId);
    if (!session) {
      await this.sendMessage(
        chatId,
        'No active inbox yet. Tap <b>📧 Generate</b> first.',
        BOT_REPLY_KEYBOARD,
      );
      return;
    }

    try {
      let targetId = explicitMessageId;
      if (!targetId) {
        const list = sortMessagesNewestFirst(
          await this.fetchChatMessages(chatId, session.account),
        );
        targetId = list[0]?.id;
      }

      if (!targetId) {
        await this.sendMessage(
          chatId,
          'Your inbox is empty — nothing to forward yet.',
          BOT_REPLY_KEYBOARD,
        );
        return;
      }

      const detail = await this.fetchChatMessageDetail(
        chatId,
        session.account,
        targetId,
      );

      const relay = getForwardRelayStatus();
      if (!relay.relayConfigured) {
        await this.sendMessage(
          chatId,
          [
            `<b>Forward Preview for ${escapeTelegramHtml(targetEmail)}</b>`,
            '',
            'Direct server SMTP/Resend relay is not configured yet. Here is the formatted message to copy, or use the Forward button on the MAXXtemp website:',
            '',
            formatTelegramEmailDetail(detail, '', session.account.address),
          ].join('\n'),
          BOT_REPLY_KEYBOARD,
        );
        return;
      }

      await sendForwardedEmail({
        detail,
        recipientEmail: targetEmail,
        disposableAddress: session.account.address,
      });

      await this.sendMessage(
        chatId,
        `✅ Forwarded <b>${escapeTelegramHtml(detail.subject || '(no subject)')}</b> to <code>${escapeTelegramHtml(targetEmail)}</code>.`,
        BOT_REPLY_KEYBOARD,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Forward failed';
      await this.sendMessage(
        chatId,
        `Could not forward message: ${escapeTelegramHtml(msg)}`,
        BOT_REPLY_KEYBOARD,
      );
    }
  }

  private async pollIncomingEmailsForChats(): Promise<void> {
    if (this.isPollingEmails) return;
    this.isPollingEmails = true;
    try {
      const sessions = syncStore.listActiveChats();
      for (const session of sessions) {
        try {
          const messages = sortMessagesNewestFirst(
            await this.fetchChatMessages(session.chatId, session.account),
          );
          const freshIds = syncStore.filterUnnotifiedMessageIds(
            session.chatId,
            messages.map((m) => m.id),
          );
          if (freshIds.length === 0) continue;

          // Push up to 5 newest messages in chronological order; only mark notified after delivery succeeds
          const batchToPush = freshIds.slice(0, 5).reverse();
          for (const id of batchToPush) {
            try {
              const detail = await this.fetchChatMessageDetail(
                session.chatId,
                session.account,
                id,
              );
              await this.sendMessage(
                session.chatId,
                formatTelegramEmailDetail(
                  detail,
                  '<b>📩 New Email Received</b>',
                  session.account.address,
                ),
                {
                  inline_keyboard: [
                    [
                      { text: 'View Inbox', callback_data: 'refresh_inbox' },
                      { text: 'Forward Email', callback_data: `fwd_msg:${id}` },
                      { text: 'Delete Email', callback_data: `del_msg:${id}` },
                    ],
                  ],
                },
              );
              syncStore.markNotified(session.chatId, [id]);
            } catch (err) {
              console.warn('Auto-push email error:', err);
            }
          }
        } catch {
          // Non-fatal background check
        }
      }
    } finally {
      this.isPollingEmails = false;
    }
  }

  private async runLongPollingLoop(): Promise<void> {
    while (this.pollingActive) {
      const controller = new AbortController();
      this.pollAbort = controller;
      try {
        const updates = await this.callTelegram<TelegramUpdate[]>(
          'getUpdates',
          {
            offset: this.updateOffset,
            timeout: 25,
            allowed_updates: ['message', 'callback_query'],
          },
          controller.signal,
        );
        this.connected = true;
        this.lastError = null;

        for (const upd of updates) {
          this.updateOffset = Math.max(this.updateOffset, upd.update_id + 1);
          await this.handleUpdate(upd).catch((err) => {
            console.error('Telegram update error:', err);
          });
        }
      } catch (err) {
        if (!this.pollingActive) break;
        this.lastError = err instanceof Error ? err.message : String(err);
        await new Promise((r) => setTimeout(r, 3500));
      }
    }
  }

  async start(): Promise<void> {
    const token = this.getToken();
    if (!token) {
      this.connected = false;
      this.botUsername = null;
      this.botName = null;
      this.lastError = null;
      return;
    }

    if (this.pollingActive) return;

    try {
      const me = await this.callTelegram<{
        username?: string;
        first_name?: string;
      }>('getMe');
      this.botUsername = me.username ?? null;
      this.botName = me.first_name ?? null;
      this.connected = true;
      this.lastError = null;

      await this.callTelegram('deleteWebhook', {
        drop_pending_updates: false,
      }).catch(() => {});

      await this.callTelegram('setMyCommands', {
        commands: [
          { command: 'start', description: 'Show keyboard menu' },
          { command: 'new', description: 'Generate a new temp email' },
          { command: 'inbox', description: 'Check your inbox messages' },
          { command: 'stats', description: 'View mailbox statistics & sync code' },
          { command: 'link', description: 'Link an inbox from the website' },
        ],
      }).catch(() => {});

      this.pollingActive = true;
      void this.runLongPollingLoop();

      this.backgroundTimer = setInterval(() => {
        void this.pollIncomingEmailsForChats();
      }, 4500);

      console.log(
        `Telegram bot connected${this.botUsername ? ` as @${this.botUsername}` : ''}`,
      );
    } catch (err) {
      this.connected = false;
      this.lastError = err instanceof Error ? err.message : String(err);
      console.warn('Telegram bot startup failed:', this.lastError);
    }
  }

  stop(): void {
    this.pollingActive = false;
    this.pollAbort?.abort();
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }
}

export const telegramBotService = new TelegramBotService();
