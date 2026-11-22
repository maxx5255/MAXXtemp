import nodemailer from 'nodemailer';
import type { MailDetail } from '../src/types/mail';
import {
  buildForwardedEmailPayload,
  isValidPersonalEmail,
  normalizeHtmlBody,
  stripHtmlToText,
} from '../src/utils/mailLogic';

export type ForwardRelayProvider = 'smtp' | 'resend';

export interface ForwardRelayStatus {
  relayConfigured: boolean;
  relayProvider: ForwardRelayProvider | null;
}

export class ForwardRelayNotConfiguredError extends Error {
  constructor() {
    super(
      'Direct email relay is not configured on the server yet. Set SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY in Secrets, or forward via your Email App.',
    );
    this.name = 'ForwardRelayNotConfiguredError';
  }
}

export function validateForwardTargetEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return isValidPersonalEmail(trimmed) ? trimmed : null;
}

export function sanitizeForwardNote(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 2000);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getForwardRelayStatus(): ForwardRelayStatus {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpHost && smtpUser && smtpPass) {
    return { relayConfigured: true, relayProvider: 'smtp' };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    return { relayConfigured: true, relayProvider: 'resend' };
  }

  return { relayConfigured: false, relayProvider: null };
}

export function formatForwardedServerEmail(params: {
  detail: MailDetail;
  recipientEmail: string;
  note?: string;
  disposableAddress?: string;
}): {
  subject: string;
  text: string;
  html: string;
} {
  const { detail, recipientEmail, note, disposableAddress } = params;
  const htmlRaw = normalizeHtmlBody(detail.html);
  const plainBody =
    detail.text?.trim() || stripHtmlToText(htmlRaw) || '(empty message)';

  const toAddress =
    disposableAddress ||
    detail.to?.map((t) => t.address).filter(Boolean).join(', ') ||
    '';

  const cleanNote = sanitizeForwardNote(note);
  const payload = buildForwardedEmailPayload({
    fromAddress: detail.from?.address || 'Unknown sender',
    fromName: detail.from?.name,
    toDisposableAddress: toAddress,
    subject: detail.subject || '(no subject)',
    createdAt: detail.createdAt || new Date().toISOString(),
    plainBody,
    recipientEmail,
    note: cleanNote,
  });

  const senderDisplay = detail.from?.name?.trim()
    ? `${detail.from.name.trim()} <${detail.from.address || 'unknown'}>`
    : detail.from?.address || 'Unknown sender';

  const safeHtmlLines: string[] = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:640px;line-height:1.6;">',
  ];

  if (cleanNote) {
    safeHtmlLines.push(
      `<p style="margin:0 0 16px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;white-space:pre-wrap;">${escapeHtml(cleanNote)}</p>`,
    );
  }

  safeHtmlLines.push(
    '<div style="padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">',
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Forwarded Message</p>',
    `<p style="margin:0;font-size:13px;color:#334155;"><strong>From:</strong> ${escapeHtml(senderDisplay)}</p>`,
  );

  if (toAddress) {
    safeHtmlLines.push(
      `<p style="margin:2px 0 0;font-size:13px;color:#334155;"><strong>Disposable To:</strong> ${escapeHtml(toAddress)}</p>`,
    );
  }

  safeHtmlLines.push(
    `<p style="margin:2px 0 0;font-size:13px;color:#334155;"><strong>Subject:</strong> ${escapeHtml(detail.subject || '(no subject)')}</p>`,
    `<p style="margin:2px 0 12px;font-size:12px;color:#64748b;"><strong>Date:</strong> ${escapeHtml(detail.createdAt || '')}</p>`,
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;" />',
    `<div style="font-size:14px;color:#0f172a;white-space:pre-wrap;word-break:break-word;">${escapeHtml(plainBody)}</div>`,
    '</div>',
    '</div>',
  );

  return {
    subject: payload.subject,
    text: payload.textBody,
    html: safeHtmlLines.join('\n'),
  };
}

export async function sendForwardedEmail(params: {
  detail: MailDetail;
  recipientEmail: string;
  note?: string;
  disposableAddress?: string;
}): Promise<{ provider: ForwardRelayProvider }> {
  const validTo = validateForwardTargetEmail(params.recipientEmail);
  if (!validTo) {
    throw new Error('Enter a valid personal email address.');
  }

  const relay = getForwardRelayStatus();
  if (!relay.relayConfigured || !relay.relayProvider) {
    throw new ForwardRelayNotConfiguredError();
  }

  const formatted = formatForwardedServerEmail({
    detail: params.detail,
    recipientEmail: validTo,
    note: params.note,
    disposableAddress: params.disposableAddress,
  });

  if (relay.relayProvider === 'smtp') {
    const host = process.env.SMTP_HOST!.trim();
    const port = Number.parseInt(process.env.SMTP_PORT || '587', 10) || 587;
    const secure =
      process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER!.trim();
    const pass = process.env.SMTP_PASS!.trim();
    const from = (process.env.SMTP_FROM || `MAXXtemp Forward <${user}>`).trim();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 12000,
    });

    await transporter.sendMail({
      from,
      to: validTo,
      subject: formatted.subject,
      text: formatted.text,
      html: formatted.html,
    });

    return { provider: 'smtp' };
  }

  const apiKey = process.env.RESEND_API_KEY!.trim();
  const from = (
    process.env.RESEND_FROM || 'MAXXtemp Forward <onboarding@resend.dev>'
  ).trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [validTo],
      subject: formatted.subject,
      text: formatted.text,
      html: formatted.html,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(
      `Email relay failed (HTTP ${res.status})${bodyText ? `: ${bodyText.slice(0, 120)}` : ''}`,
    );
  }

  return { provider: 'resend' };
}
