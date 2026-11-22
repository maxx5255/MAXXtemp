import type {
  MailDetail,
  MailDomain,
  MailProvider,
  MailSummary,
  TempAccount,
} from '../types/mail';
import {
  formatApiErrorMessage,
  generateRandomLocalPart,
  generateSecurePassword,
  selectBestDomain,
} from '../utils/mailLogic';

export class MailApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'MailApiError';
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = init.signal;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const rawText = await res.text();
    if (!res.ok) {
      throw new MailApiError(
        formatApiErrorMessage(res.status, rawText),
        res.status,
      );
    }

    return (rawText ? JSON.parse(rawText) : {}) as T;
  } catch (err) {
    if (err instanceof MailApiError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new MailApiError('Request timed out — please try again.', 408);
    }
    throw new MailApiError(
      'Unable to reach mail service. Check your connection and retry.',
      0,
    );
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

let cachedDomainsEntry: {
  providerKey: string;
  data: { provider: MailProvider; domains: MailDomain[] };
  expiresAt: number;
} | null = null;
const inflightDomainRequests = new Map<
  string,
  Promise<{ provider: MailProvider; domains: MailDomain[] }>
>();

export async function fetchAvailableDomains(
  provider?: MailProvider,
  signal?: AbortSignal,
): Promise<{ provider: MailProvider; domains: MailDomain[] }> {
  const key = provider ?? 'auto';
  const now = Date.now();
  if (
    cachedDomainsEntry &&
    cachedDomainsEntry.providerKey === key &&
    cachedDomainsEntry.expiresAt > now
  ) {
    return cachedDomainsEntry.data;
  }

  const existing = inflightDomainRequests.get(key);
  if (existing) {
    return existing;
  }

  const qs = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  const reqPromise = requestJson<{ provider: MailProvider; domains: MailDomain[] }>(
    `/api/mail/domains${qs}`,
    { signal },
  )
    .then((data) => {
      cachedDomainsEntry = {
        providerKey: key,
        data,
        expiresAt: Date.now() + 60_000,
      };
      return data;
    })
    .finally(() => {
      inflightDomainRequests.delete(key);
    });

  inflightDomainRequests.set(key, reqPromise);
  return reqPromise;
}

export async function createAndLoginAccount(options?: {
  customLocalPart?: string;
  preferredDomain?: string;
  preferredProvider?: MailProvider;
  signal?: AbortSignal;
}): Promise<TempAccount> {
  const { provider, domains } = await fetchAvailableDomains(
    options?.preferredProvider,
    options?.signal,
  );

  const chosenDomain =
    (options?.preferredDomain
      ? domains.find((d) => d.domain === options.preferredDomain)
      : null) ?? selectBestDomain(domains);

  if (!chosenDomain) {
    throw new MailApiError('No active email domains are available right now.', 503);
  }

  const localPart =
    options?.customLocalPart && options.customLocalPart.length >= 3
      ? options.customLocalPart
      : generateRandomLocalPart(10);

  const address = `${localPart}@${chosenDomain.domain}`;
  const password = generateSecurePassword(18);

  await requestJson<{ id: string; address: string }>('/api/mail/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, address, password }),
    signal: options?.signal,
  });

  const tokenRes = await requestJson<{ id: string; token: string }>(
    '/api/mail/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, address, password }),
      signal: options?.signal,
    },
  );

  return {
    id: tokenRes.id,
    address,
    password,
    token: tokenRes.token,
    apiBase: provider,
    createdAt: new Date().toISOString(),
  };
}

export async function refreshAccountToken(
  account: TempAccount,
): Promise<TempAccount> {
  const tokenRes = await requestJson<{ id: string; token: string }>(
    '/api/mail/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: account.apiBase,
        address: account.address,
        password: account.password,
      }),
    },
  );

  return {
    ...account,
    id: tokenRes.id || account.id,
    token: tokenRes.token,
  };
}

async function withTokenRetry<T>(
  account: TempAccount,
  onTokenRefreshed: ((updated: TempAccount) => void) | undefined,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  try {
    return await fn(account.token);
  } catch (err) {
    if (err instanceof MailApiError && err.status === 401) {
      const refreshed = await refreshAccountToken(account);
      onTokenRefreshed?.(refreshed);
      return await fn(refreshed.token);
    }
    throw err;
  }
}

export async function fetchInboxMessages(
  account: TempAccount,
  onTokenRefreshed?: (updated: TempAccount) => void,
  signal?: AbortSignal,
): Promise<MailSummary[]> {
  return withTokenRetry(account, onTokenRefreshed, async (token) => {
    const data = await requestJson<
      MailSummary[] | { 'hydra:member'?: MailSummary[] }
    >(
      `/api/mail/messages?provider=${encodeURIComponent(account.apiBase)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    );
    if (Array.isArray(data)) return data;
    return Array.isArray(data['hydra:member']) ? data['hydra:member'] : [];
  });
}

export async function fetchMessageDetail(
  account: TempAccount,
  messageId: string,
  onTokenRefreshed?: (updated: TempAccount) => void,
  signal?: AbortSignal,
): Promise<MailDetail> {
  return withTokenRetry(account, onTokenRefreshed, (token) =>
    requestJson<MailDetail>(
      `/api/mail/messages/${encodeURIComponent(messageId)}?provider=${encodeURIComponent(account.apiBase)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      },
    ),
  );
}

export async function markMessageSeen(
  account: TempAccount,
  messageId: string,
): Promise<void> {
  try {
    await requestJson<unknown>(
      `/api/mail/messages/${encodeURIComponent(messageId)}/seen?provider=${encodeURIComponent(account.apiBase)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${account.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: account.apiBase }),
      },
    );
  } catch {
    // Non-blocking status sync
  }
}

export async function deleteMessage(
  account: TempAccount,
  messageId: string,
  onTokenRefreshed?: (updated: TempAccount) => void,
): Promise<void> {
  await withTokenRetry(account, onTokenRefreshed, (token) =>
    requestJson<void>(
      `/api/mail/messages/${encodeURIComponent(messageId)}?provider=${encodeURIComponent(account.apiBase)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    ),
  );
}

export async function deleteMailboxAccount(
  account: TempAccount,
): Promise<void> {
  try {
    await requestJson<void>(
      `/api/mail/accounts/${encodeURIComponent(account.id)}?provider=${encodeURIComponent(account.apiBase)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${account.token}` },
      },
    );
  } catch {
    // Even if upstream account cleanup fails, clear local session gracefully
  }
}

export async function fetchTelegramBotStatus(): Promise<
  import('../types/mail').TelegramBotStatusInfo
> {
  return requestJson<import('../types/mail').TelegramBotStatusInfo>(
    '/api/telegram/status',
  );
}

export async function exportAccountToTelegram(
  account: TempAccount,
): Promise<import('../types/mail').SyncExportResponse> {
  return requestJson<import('../types/mail').SyncExportResponse>(
    '/api/sync/export',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    },
  );
}

export async function importAccountFromSyncCode(
  code: string,
): Promise<TempAccount> {
  const res = await requestJson<{ account: TempAccount }>('/api/sync/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.account;
}

export async function fetchForwardStatus(): Promise<
  import('../types/mail').ForwardStatusInfo
> {
  return requestJson<import('../types/mail').ForwardStatusInfo>(
    '/api/mail/forward/status',
  );
}

export async function forwardInboxMessage(
  account: TempAccount,
  params: { messageId: string; to: string; note?: string },
  onTokenRefreshed?: (updated: TempAccount) => void,
): Promise<import('../types/mail').ForwardEmailResponse> {
  return withTokenRetry(account, onTokenRefreshed, (token) =>
    requestJson<import('../types/mail').ForwardEmailResponse>(
      '/api/mail/forward',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: account.apiBase,
          messageId: params.messageId,
          to: params.to,
          note: params.note,
          disposableAddress: account.address,
        }),
      },
      15000,
    ),
  );
}

