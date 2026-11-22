import crypto from 'node:crypto';
import type { MailProvider } from '../src/types/mail';

export interface ServerTempAccount {
  id: string;
  address: string;
  password: string;
  token: string;
  apiBase: MailProvider;
  createdAt: string;
}

export interface LinkEntry {
  code: string;
  account: ServerTempAccount;
  source: 'web' | 'telegram';
  chatId?: number;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface ChatSession {
  chatId: number;
  account: ServerTempAccount;
  notifiedMessageIds: Set<string>;
  generatedCount: number;
  receivedCount: number;
}

export interface BotStatsSnapshot {
  activeInboxes: number;
  totalGenerated: number;
  totalEmailsReceived: number;
  chatGenerated: number;
  chatReceived: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_REGEX = /^[A-Z0-9]{6,12}$/;

export function generateLinkCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function isValidLinkCode(raw: string): boolean {
  return LINK_CODE_REGEX.test(raw.trim().toUpperCase());
}

export class SyncStore {
  private links = new Map<string, LinkEntry>();
  private chats = new Map<number, ChatSession>();
  private totalGenerated = 0;
  private totalEmailsReceived = 0;

  createLinkCode(
    account: ServerTempAccount,
    source: 'web' | 'telegram',
    chatId?: number,
    nowMs = Date.now(),
  ): LinkEntry {
    this.pruneExpired(nowMs);
    let code = generateLinkCode(8);
    while (this.links.has(code)) {
      code = generateLinkCode(8);
    }

    const entry: LinkEntry = {
      code,
      account: { ...account },
      source,
      chatId,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + CODE_TTL_MS,
    };
    this.links.set(code, entry);
    return entry;
  }

  consumeLinkCode(rawCode: string, nowMs = Date.now()): LinkEntry | null {
    this.pruneExpired(nowMs);
    const normalized = rawCode.trim().toUpperCase();
    if (!isValidLinkCode(normalized)) return null;

    const entry = this.links.get(normalized);
    if (!entry) return null;
    if (entry.expiresAtMs <= nowMs) {
      this.links.delete(normalized);
      return null;
    }

    this.links.delete(normalized);
    return entry;
  }

  setChatAccount(
    chatId: number,
    account: ServerTempAccount,
    initialSeenIds: string[] = [],
  ): ChatSession {
    const prev = this.chats.get(chatId);
    const generatedCount = (prev?.generatedCount ?? 0) + 1;
    this.totalGenerated += 1;

    const session: ChatSession = {
      chatId,
      account: { ...account },
      notifiedMessageIds: new Set(initialSeenIds),
      generatedCount,
      receivedCount: prev?.receivedCount ?? 0,
    };
    this.chats.set(chatId, session);
    return session;
  }

  getChatSession(chatId: number): ChatSession | undefined {
    return this.chats.get(chatId);
  }

  updateChatAccountToken(
    chatId: number,
    token: string,
    id?: string,
  ): ChatSession | undefined {
    const session = this.chats.get(chatId);
    if (!session) return undefined;
    session.account = {
      ...session.account,
      token,
      id: id || session.account.id,
    };
    return session;
  }

  deleteChatAccount(chatId: number): boolean {
    return this.chats.delete(chatId);
  }

  listActiveChats(): ChatSession[] {
    return Array.from(this.chats.values());
  }

  filterUnnotifiedMessageIds(chatId: number, messageIds: string[]): string[] {
    const session = this.chats.get(chatId);
    if (!session) return [];
    const fresh: string[] = [];
    for (const id of messageIds) {
      if (!session.notifiedMessageIds.has(id)) {
        fresh.push(id);
      }
    }
    return fresh;
  }

  markNotified(chatId: number, messageIds: string[]): void {
    const session = this.chats.get(chatId);
    if (!session) return;
    let newlyAdded = 0;
    for (const id of messageIds) {
      if (!session.notifiedMessageIds.has(id)) {
        session.notifiedMessageIds.add(id);
        newlyAdded += 1;
      }
    }
    if (newlyAdded > 0) {
      session.receivedCount += newlyAdded;
      this.totalEmailsReceived += newlyAdded;
    }
  }

  getStats(chatId?: number): BotStatsSnapshot {
    const session = chatId !== undefined ? this.chats.get(chatId) : undefined;
    return {
      activeInboxes: this.chats.size,
      totalGenerated: this.totalGenerated,
      totalEmailsReceived: this.totalEmailsReceived,
      chatGenerated: session?.generatedCount ?? 0,
      chatReceived: session?.receivedCount ?? 0,
    };
  }

  pruneExpired(nowMs = Date.now()): void {
    for (const [code, entry] of this.links.entries()) {
      if (entry.expiresAtMs <= nowMs) {
        this.links.delete(code);
      }
    }
  }
}

export const syncStore = new SyncStore();
