import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { resolveProvider } from './mailProxy';
import { isValidLinkCode, syncStore, type ServerTempAccount } from './syncStore';
import { telegramBotService, type TelegramUpdate } from './telegramBot';

export function createSyncAndTelegramRouter() {
  const router = express.Router();

  // GET /api/telegram/status — public non-secret status
  router.get('/telegram/status', (_req: Request, res: Response) => {
    res.json(telegramBotService.getStatus());
  });

  // POST /api/sync/export — Website exports its active mailbox into a 1-time link code for Telegram
  router.post('/sync/export', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const { id, address, password, token, apiBase, createdAt } = body;

    if (
      typeof address !== 'string' ||
      !address.includes('@') ||
      typeof password !== 'string' ||
      typeof token !== 'string' ||
      !token
    ) {
      return res.status(400).json({ error: 'Valid active mailbox required' });
    }

    const account: ServerTempAccount = {
      id: typeof id === 'string' ? id : '',
      address,
      password,
      token,
      apiBase: resolveProvider(apiBase),
      createdAt:
        typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
    };

    const entry = syncStore.createLinkCode(account, 'web');
    const botStatus = telegramBotService.getStatus();
    const deepLink = botStatus.botUsername
      ? `https://t.me/${botStatus.botUsername}?start=link_${entry.code}`
      : null;

    return res.json({
      code: entry.code,
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
      deepLink,
      botUsername: botStatus.botUsername,
    });
  });

  // POST /api/sync/import — Website imports a mailbox created in Telegram using its 1-time sync code
  router.post('/sync/import', (req: Request, res: Response) => {
    const rawCode = req.body?.code;
    if (typeof rawCode !== 'string' || !isValidLinkCode(rawCode)) {
      return res
        .status(400)
        .json({ error: 'Enter a valid 6-12 character sync code.' });
    }

    const entry = syncStore.consumeLinkCode(rawCode);
    if (!entry) {
      return res
        .status(404)
        .json({ error: 'Sync code not found or already expired.' });
    }

    return res.json({
      account: entry.account,
      source: entry.source,
    });
  });

  // POST /api/telegram/webhook — Optional webhook receiver protected by X-Telegram-Bot-Api-Secret-Token
  router.post('/telegram/webhook', async (req: Request, res: Response) => {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expectedSecret) {
      return res.status(404).json({ error: 'Webhook mode not enabled' });
    }

    const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (typeof providedSecret !== 'string') {
      return res.status(401).json({ error: 'Missing webhook secret' });
    }

    const a = Buffer.from(providedSecret, 'utf8');
    const b = Buffer.from(expectedSecret, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const update = req.body as TelegramUpdate;
    if (update && typeof update.update_id === 'number') {
      await telegramBotService.handleUpdate(update).catch((err) => {
        console.error('Webhook update error:', err);
      });
    }

    return res.json({ ok: true });
  });

  return router;
}
