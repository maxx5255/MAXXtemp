import express, { type Request, type Response } from 'express';
import {
  ForwardRelayNotConfiguredError,
  getForwardRelayStatus,
  sanitizeForwardNote,
  sendForwardedEmail,
  validateForwardTargetEmail,
} from './mailForwarder';
import type { MailDetail } from '../src/types/mail';

export const ALLOWED_PROVIDERS = [
  'https://api.mail.tm',
  'https://api.mail.gw',
] as const;

export type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

export function resolveProvider(raw?: unknown): AllowedProvider {
  if (
    typeof raw === 'string' &&
    (ALLOWED_PROVIDERS as readonly string[]).includes(raw)
  ) {
    return raw as AllowedProvider;
  }
  return 'https://api.mail.tm';
}

export function isValidResourceId(id: string): boolean {
  return SAFE_ID_REGEX.test(id);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function upstreamFetch(
  url: string,
  init: RequestInit = {},
  maxAttempts = 2,
): Promise<{ status: number; bodyText: string; contentType: string }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(10000),
      });

      const bodyText = await response.text();
      const contentType =
        response.headers.get('content-type') || 'application/json';

      if (response.status === 429 && attempt < maxAttempts - 1) {
        await sleep(1200 * (attempt + 1));
        continue;
      }

      if (response.status >= 502 && attempt < maxAttempts - 1) {
        await sleep(600 * (attempt + 1));
        continue;
      }

      return { status: response.status, bodyText, contentType };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Upstream mail server unreachable');
}

function sendUpstreamResult(
  res: Response,
  result: { status: number; bodyText: string; contentType: string },
) {
  if (result.status === 204) {
    return res.status(204).end();
  }
  res.status(result.status);
  res.setHeader('Content-Type', result.contentType);
  return res.send(result.bodyText);
}

export function createMailRouter() {
  const router = express.Router();

  // GET /api/mail/domains?provider=...
  router.get('/domains', async (req: Request, res: Response) => {
    const requested = req.query.provider;
    const providersToTry: AllowedProvider[] = requested
      ? [resolveProvider(requested)]
      : [...ALLOWED_PROVIDERS];

    let lastError = 'Unable to reach mail providers';
    for (const provider of providersToTry) {
      try {
        const result = await upstreamFetch(`${provider}/domains?page=1`, {
          headers: { Accept: 'application/ld+json, application/json' },
        });
        if (result.status >= 200 && result.status < 300) {
          const parsed = JSON.parse(result.bodyText || '{}');
          const members = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed['hydra:member'])
              ? parsed['hydra:member']
              : [];
          if (members.length > 0) {
            return res.json({
              provider,
              domains: members,
            });
          }
          lastError = `Provider ${provider} returned no active domains`;
          continue;
        }
        lastError = `Provider ${provider} returned HTTP ${result.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return res.status(502).json({ error: lastError });
  });

  // POST /api/mail/accounts
  router.post('/accounts', async (req: Request, res: Response) => {
    const { provider: rawProvider, address, password } = req.body ?? {};
    if (
      typeof address !== 'string' ||
      !address.includes('@') ||
      typeof password !== 'string' ||
      password.length < 4
    ) {
      return res.status(400).json({ error: 'Valid address and password required' });
    }

    const provider = resolveProvider(rawProvider);
    try {
      const result = await upstreamFetch(`${provider}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ address, password }),
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to create account',
      });
    }
  });

  // POST /api/mail/token
  router.post('/token', async (req: Request, res: Response) => {
    const { provider: rawProvider, address, password } = req.body ?? {};
    if (typeof address !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Address and password required' });
    }

    const provider = resolveProvider(rawProvider);
    try {
      const result = await upstreamFetch(`${provider}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ address, password }),
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to authenticate',
      });
    }
  });

  // GET /api/mail/messages
  router.get('/messages', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    const provider = resolveProvider(req.query.provider);
    try {
      const result = await upstreamFetch(`${provider}/messages?page=1`, {
        headers: {
          Authorization: auth,
          Accept: 'application/json',
        },
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load messages',
      });
    }
  });

  // GET /api/mail/messages/:id
  router.get('/messages/:id', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const { id } = req.params;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    if (!isValidResourceId(id)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    const provider = resolveProvider(req.query.provider);
    try {
      const result = await upstreamFetch(`${provider}/messages/${id}`, {
        headers: {
          Authorization: auth,
          Accept: 'application/json',
        },
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load message',
      });
    }
  });

  // PATCH /api/mail/messages/:id/seen
  router.patch('/messages/:id/seen', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const { id } = req.params;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    if (!isValidResourceId(id)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    const provider = resolveProvider(req.query.provider ?? req.body?.provider);
    try {
      const result = await upstreamFetch(`${provider}/messages/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/merge-patch+json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ seen: true }),
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to mark seen',
      });
    }
  });

  // DELETE /api/mail/messages/:id
  router.delete('/messages/:id', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const { id } = req.params;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    if (!isValidResourceId(id)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    const provider = resolveProvider(req.query.provider);
    try {
      const result = await upstreamFetch(`${provider}/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to delete message',
      });
    }
  });

  // DELETE /api/mail/accounts/:id
  router.delete('/accounts/:id', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const { id } = req.params;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    if (!isValidResourceId(id)) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }
    const provider = resolveProvider(req.query.provider);
    try {
      const result = await upstreamFetch(`${provider}/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      return sendUpstreamResult(res, result);
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to delete account',
      });
    }
  });

  // GET /api/mail/forward/status
  router.get('/forward/status', (_req: Request, res: Response) => {
    res.json(getForwardRelayStatus());
  });

  // POST /api/mail/forward
  router.post('/forward', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }

    const {
      provider: rawProvider,
      messageId,
      to,
      note,
      disposableAddress,
    } = req.body ?? {};

    if (typeof messageId !== 'string' || !isValidResourceId(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const validTo = validateForwardTargetEmail(to);
    if (!validTo) {
      return res
        .status(400)
        .json({ error: 'Enter a valid personal email address.' });
    }

    const relayStatus = getForwardRelayStatus();
    if (!relayStatus.relayConfigured) {
      return res.status(503).json({
        error:
          'Direct server email relay is not configured yet. Use Open in Email App or set SMTP / RESEND_API_KEY in Secrets.',
        code: 'RELAY_NOT_CONFIGURED',
      });
    }

    const provider = resolveProvider(rawProvider);
    try {
      // Fetch the verified message from the authenticated upstream mailbox so open-relay abuse is prevented
      const detailRes = await upstreamFetch(`${provider}/messages/${messageId}`, {
        headers: {
          Authorization: auth,
          Accept: 'application/json',
        },
      });

      if (detailRes.status === 401) {
        return res.status(401).json({ error: 'Mailbox session expired' });
      }
      if (detailRes.status === 404) {
        return res.status(404).json({ error: 'Message not found in mailbox' });
      }
      if (detailRes.status < 200 || detailRes.status >= 300) {
        return res
          .status(502)
          .json({ error: `Failed to verify message (${detailRes.status})` });
      }

      const detail = JSON.parse(detailRes.bodyText || '{}') as MailDetail;
      const result = await sendForwardedEmail({
        detail,
        recipientEmail: validTo,
        note: sanitizeForwardNote(note),
        disposableAddress:
          typeof disposableAddress === 'string' && disposableAddress.includes('@')
            ? disposableAddress.trim().slice(0, 254)
            : undefined,
      });

      return res.json({
        ok: true,
        recipient: validTo,
        messageId,
        provider: result.provider,
      });
    } catch (err) {
      if (err instanceof ForwardRelayNotConfiguredError) {
        return res.status(503).json({
          error: err.message,
          code: 'RELAY_NOT_CONFIGURED',
        });
      }
      return res.status(502).json({
        error:
          err instanceof Error ? err.message : 'Unable to forward message right now',
      });
    }
  });

  return router;
}
