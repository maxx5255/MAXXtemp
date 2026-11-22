import type { MailDomain, MailFilter, MailSummary } from '../types/mail';

const LOWERCASE_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PASSWORD_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

export function generateRandomLocalPart(length = 10): string {
  const safeLen = Math.max(4, Math.min(24, Math.floor(length)));
  let out = '';
  for (let i = 0; i < safeLen; i++) {
    out += LOWERCASE_ALNUM[Math.floor(Math.random() * LOWERCASE_ALNUM.length)];
  }
  return out;
}

export function sanitizeCustomLocalPart(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);
}

export function generateSecurePassword(length = 18): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  }
  return out;
}

export function selectBestDomain(domains: MailDomain[]): MailDomain | null {
  if (!Array.isArray(domains) || domains.length === 0) {
    return null;
  }
  return domains.find((d) => d.isActive && !d.isPrivate) ?? domains[0] ?? null;
}

export function formatRelativeTime(isoDate: string, nowMs = Date.now()): string {
  const parsed = new Date(isoDate).getTime();
  if (Number.isNaN(parsed)) return 'just now';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 45) return 'now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function sortMessagesNewestFirst(messages: MailSummary[]): MailSummary[] {
  return [...messages].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function filterMessages(
  messages: MailSummary[],
  query: string,
  filterMode: MailFilter,
): MailSummary[] {
  const q = query.trim().toLowerCase();
  return sortMessagesNewestFirst(messages).filter((m) => {
    if (filterMode === 'unread' && m.seen) return false;
    if (!q) return true;
    const fromAddr = (m.from?.address ?? '').toLowerCase();
    const fromName = (m.from?.name ?? '').toLowerCase();
    const subj = (m.subject ?? '').toLowerCase();
    const intro = (m.intro ?? '').toLowerCase();
    return (
      fromAddr.includes(q) ||
      fromName.includes(q) ||
      subj.includes(q) ||
      intro.includes(q)
    );
  });
}

export function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeHtmlBody(html?: string[] | string): string {
  if (!html) return '';
  if (Array.isArray(html)) return html.join('\n');
  return html;
}

/**
 * Extracts likely OTP / verification codes (4-8 digits) from email text
 * while avoiding common false positives like years (1990-2099) or URL numbers.
 */
export function extractOtpCodes(text: string): string[] {
  if (!text) return [];
  const cleanText = text.replace(/https?:\/\/\S+/gi, ' ');
  const found: string[] = [];

  // Prefer contextual matches near OTP/code/verification keywords
  const contextualRegex =
    /(?:code|otp|pin|verification|verify|passcode|token|security)\s*(?:is|:|-)?\s*([A-Z0-9]{4,8}|\d{4,8})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = contextualRegex.exec(cleanText)) !== null) {
    const candidate = match[1];
    if (/\d/.test(candidate) && !found.includes(candidate)) {
      found.push(candidate);
    }
  }

  // Also check standalone 5-8 digit tokens (skipping 4-digit years unless contextual)
  const standaloneDigits = cleanText.match(/\b\d{5,8}\b/g) ?? [];
  for (const digits of standaloneDigits) {
    if (!found.includes(digits)) {
      found.push(digits);
    }
  }

  return found.slice(0, 3);
}

export function getSenderInitial(fromAddress?: string, fromName?: string): string {
  const source = (fromName || fromAddress || '?').trim();
  const match = source.match(/[a-zA-Z0-9]/);
  return (match ? match[0] : '?').toUpperCase();
}

export function formatApiErrorMessage(status: number, rawBody: string): string {
  if (status === 429) {
    return 'Rate limit reached — retrying automatically in a moment.';
  }
  if (status === 401) {
    return 'Session expired — refreshing mailbox token.';
  }
  if (status === 422) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed['hydra:description']) return String(parsed['hydra:description']);
      if (parsed.detail) return String(parsed.detail);
    } catch {
      // ignore JSON parse failure
    }
    return 'That address is unavailable or invalid. Try generating another.';
  }
  if (status >= 500) {
    return 'Mail provider temporarily unavailable. Switching fallback or retrying.';
  }
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.error) return String(parsed.error);
    if (parsed.message) return String(parsed.message);
    if (parsed['hydra:description']) return String(parsed['hydra:description']);
  } catch {
    // ignore JSON parse failure
  }
  return rawBody ? rawBody.slice(0, 140) : `Request failed (HTTP ${status})`;
}

const EMAIL_VALIDATION_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidPersonalEmail(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (/[\r\n\0\s,;<>]/.test(trimmed)) return false;
  return EMAIL_VALIDATION_REGEX.test(trimmed);
}

export function buildForwardedEmailPayload(params: {
  fromAddress: string;
  fromName?: string;
  toDisposableAddress?: string;
  subject: string;
  createdAt: string;
  plainBody: string;
  recipientEmail: string;
  note?: string;
}): {
  subject: string;
  textBody: string;
  mailtoUrl: string;
} {
  const cleanRecipient = params.recipientEmail.trim();
  const baseSubject = (params.subject || '(no subject)').replace(/[\r\n]+/g, ' ').trim();
  const fwdSubject = /^fwd:/i.test(baseSubject) ? baseSubject : `Fwd: ${baseSubject}`;

  const senderDisplay = params.fromName?.trim()
    ? `${params.fromName.trim()} <${params.fromAddress}>`
    : params.fromAddress || 'Unknown sender';

  const sections: string[] = [];
  const trimmedNote = params.note?.trim();
  if (trimmedNote) {
    sections.push(trimmedNote, '');
  }

  sections.push('---------- Forwarded message ----------');
  sections.push(`From: ${senderDisplay}`);
  if (params.toDisposableAddress) {
    sections.push(`To: ${params.toDisposableAddress}`);
  }
  sections.push(`Date: ${params.createdAt}`);
  sections.push(`Subject: ${baseSubject}`);
  sections.push('');
  sections.push(params.plainBody.trim() || '(empty message)');

  const textBody = sections.join('\n');

  // Bound mailto body length so desktop/mobile mail clients handle URL safely
  const boundedMailtoBody =
    textBody.length > 1600
      ? `${textBody.slice(0, 1600)}\n\n...(truncated for email app link)`
      : textBody;

  const recipientPart = isValidPersonalEmail(cleanRecipient)
    ? encodeURIComponent(cleanRecipient)
    : '';
  const mailtoUrl = `mailto:${recipientPart}?subject=${encodeURIComponent(fwdSubject)}&body=${encodeURIComponent(boundedMailtoBody)}`;

  return {
    subject: fwdSubject,
    textBody,
    mailtoUrl,
  };
}

