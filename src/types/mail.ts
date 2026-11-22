export type MailProvider = 'https://api.mail.tm' | 'https://api.mail.gw';

export type InboxStatus = 'creating' | 'live' | 'syncing' | 'error' | 'deleted';

export type MailFilter = 'all' | 'unread';

export interface TempAccount {
  id: string;
  address: string;
  password: string;
  token: string;
  apiBase: MailProvider;
  createdAt: string;
}

export interface MailDomain {
  id: string;
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
}

export interface MailSender {
  address: string;
  name?: string;
}

export interface MailSummary {
  id: string;
  from: MailSender;
  to?: MailSender[];
  subject: string;
  intro?: string;
  seen: boolean;
  isDeleted?: boolean;
  size?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface MailDetail extends MailSummary {
  text?: string;
  html?: string[] | string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  durationMs: number;
}

export interface TelegramBotStatusInfo {
  configured: boolean;
  connected: boolean;
  botUsername: string | null;
  botName: string | null;
  activeSessions: number;
  lastError: string | null;
}

export interface SyncExportResponse {
  code: string;
  expiresAt: string;
  deepLink: string | null;
  botUsername: string | null;
}

export interface ForwardStatusInfo {
  relayConfigured: boolean;
  relayProvider: 'smtp' | 'resend' | null;
}

export interface ForwardEmailResponse {
  ok: boolean;
  recipient: string;
  messageId: string;
  provider: 'smtp' | 'resend';
}

