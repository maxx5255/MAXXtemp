import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedBackdrop } from './components/AnimatedBackdrop';
import { Header } from './components/Header';
import { AddressCard } from './components/AddressCard';
import { InboxCard } from './components/InboxCard';
import { ConfirmModal, type ModalMode } from './components/ConfirmModal';
import { ForwardModal } from './components/ForwardModal';
import { ToastStack } from './components/ToastStack';
import { TelegramSyncCard } from './components/TelegramSyncCard';
import {
  createAndLoginAccount,
  deleteMailboxAccount,
  deleteMessage,
  exportAccountToTelegram,
  fetchAvailableDomains,
  fetchForwardStatus,
  fetchInboxMessages,
  fetchMessageDetail,
  fetchTelegramBotStatus,
  forwardInboxMessage,
  importAccountFromSyncCode,
  markMessageSeen,
} from './services/mailApi';
import type {
  ForwardStatusInfo,
  InboxStatus,
  MailDetail,
  MailDomain,
  MailSummary,
  TelegramBotStatusInfo,
  TempAccount,
  ToastItem,
} from './types/mail';

const STORAGE_KEY = 'mailbox_account_v2';
const POLL_INTERVAL_MS = 6000;

export default function App() {
  const [account, setAccount] = useState<TempAccount | null>(null);
  const [domains, setDomains] = useState<MailDomain[]>([]);
  const [botStatus, setBotStatus] = useState<TelegramBotStatusInfo | null>(null);
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [status, setStatus] = useState<InboxStatus>('creating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, MailDetail>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [forwardTarget, setForwardTarget] = useState<MailSummary | null>(null);
  const [forwardStatus, setForwardStatus] = useState<ForwardStatusInfo | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => Date.now());

  const accountRef = useRef<TempAccount | null>(null);
  const syncSeqRef = useRef(0);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  const addToast = useCallback(
    (message: string, type: ToastItem['type'] = 'info', durationMs = 2800) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, type, durationMs }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const persistAccount = useCallback((acc: TempAccount | null) => {
    setAccount(acc);
    accountRef.current = acc;
    try {
      if (acc) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota issues
    }
  }, []);

  const refreshInbox = useCallback(
    async (silent = true) => {
      const active = accountRef.current;
      if (!active) return;

      const seq = ++syncSeqRef.current;
      if (!silent) {
        setStatus('syncing');
      }

      try {
        const list = await fetchInboxMessages(active, (updated) => {
          persistAccount(updated);
        });

        if (seq !== syncSeqRef.current) return;

        // Notify if genuinely new messages arrived during background polling
        if (silent && knownMessageIdsRef.current.size >= 0) {
          const newCount = list.filter(
            (m) => !knownMessageIdsRef.current.has(m.id),
          ).length;
          if (newCount > 0 && knownMessageIdsRef.current.size > 0) {
            addToast(
              `${newCount} new ${newCount === 1 ? 'email' : 'emails'} received`,
              'info',
            );
          }
        }
        knownMessageIdsRef.current = new Set(list.map((m) => m.id));

        setMessages(list);
        setStatus('live');
        setErrorMessage(null);
        setLastSyncedAt(Date.now());
        if (!silent) {
          addToast('Inbox synced', 'success', 2000);
        }
      } catch (err) {
        if (seq !== syncSeqRef.current) return;
        const msg =
          err instanceof Error ? err.message : 'Unable to refresh inbox';
        setStatus('error');
        setErrorMessage(msg);
        if (!silent) {
          addToast(msg, 'error', 3600);
        }
      }
    },
    [addToast, persistAccount],
  );

  const generateNewInbox = useCallback(
    async (customLocalPart?: string, preferredDomain?: string) => {
      syncSeqRef.current += 1;
      setStatus('creating');
      setErrorMessage(null);
      setExpandedId(null);
      setMessages([]);
      setDetailsById({});
      knownMessageIdsRef.current = new Set();

      try {
        const newAcc = await createAndLoginAccount({
          customLocalPart,
          preferredDomain,
        });
        persistAccount(newAcc);
        setMessages([]);
        setStatus('live');
        setLastSyncedAt(Date.now());
        addToast(`Inbox ready: ${newAcc.address}`, 'success');
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not create inbox';
        persistAccount(null);
        setStatus('error');
        setErrorMessage(msg);
        addToast(msg, 'error', 4000);
      }
    },
    [addToast, persistAccount, refreshInbox],
  );

  // Initial bootstrap: load domains + Telegram status + handle ?sync= or restore saved account
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      fetchAvailableDomains()
        .then((res) => {
          if (!cancelled) setDomains(res.domains);
        })
        .catch(() => {});

      fetchTelegramBotStatus()
        .then((st) => {
          if (!cancelled) setBotStatus(st);
        })
        .catch(() => {});

      fetchForwardStatus()
        .then((st) => {
          if (!cancelled) setForwardStatus(st);
        })
        .catch(() => {});

      // Check for ?sync=CODE deep link from Telegram /web command
      const params = new URLSearchParams(window.location.search);
      const syncCode = params.get('sync')?.trim();
      if (syncCode) {
        try {
          const imported = await importAccountFromSyncCode(syncCode);
          if (cancelled) return;
          persistAccount(imported);
          window.history.replaceState({}, '', window.location.pathname);
          const list = await fetchInboxMessages(imported, (updated) => {
            if (!cancelled) persistAccount(updated);
          });
          if (cancelled) return;
          knownMessageIdsRef.current = new Set(list.map((m) => m.id));
          setMessages(list);
          setStatus('live');
          setLastSyncedAt(Date.now());
          addToast(`Synced Telegram inbox: ${imported.address}`, 'success');
          return;
        } catch (err) {
          window.history.replaceState({}, '', window.location.pathname);
          const msg =
            err instanceof Error ? err.message : 'Sync code invalid or expired';
          addToast(msg, 'error', 3500);
        }
      }

      let savedRaw: string | null = null;
      try {
        savedRaw = localStorage.getItem(STORAGE_KEY);
      } catch {
        savedRaw = null;
      }

      if (savedRaw) {
        try {
          const parsed = JSON.parse(savedRaw) as TempAccount;
          if (parsed?.address && parsed?.token && parsed?.apiBase) {
            persistAccount(parsed);
            const list = await fetchInboxMessages(parsed, (updated) => {
              if (!cancelled) persistAccount(updated);
            });
            if (cancelled) return;
            knownMessageIdsRef.current = new Set(list.map((m) => m.id));
            setMessages(list);
            setStatus('live');
            setLastSyncedAt(Date.now());
            return;
          }
        } catch {
          persistAccount(null);
        }
      }

      if (!cancelled) {
        await generateNewInbox();
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [addToast, generateNewInbox, persistAccount]);

  // Auto-polling while account is active
  useEffect(() => {
    if (!account || status === 'creating' || status === 'deleted') {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshInbox(true);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [account, status, refreshInbox]);

  // Global keyboard shortcuts (C = Copy, R = Refresh, N = New Address)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modalMode || forwardTarget || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'c' && accountRef.current) {
        e.preventDefault();
        navigator.clipboard
          ?.writeText(accountRef.current.address)
          .then(() => {
            addToast('Email address copied to clipboard', 'success', 2000);
          })
          .catch(() => {});
      } else if (key === 'r' && accountRef.current) {
        e.preventDefault();
        void refreshInbox(false);
      } else if (key === 'n') {
        e.preventDefault();
        setModalMode('new-address');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalMode, forwardTarget, addToast, refreshInbox]);

  const handleToggleExpand = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }

      setExpandedId(id);

      // Optimistically mark read locally
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, seen: true } : m)),
      );

      const active = accountRef.current;
      if (!active) return;

      if (!detailsById[id]) {
        setLoadingDetailId(id);
        try {
          const detail = await fetchMessageDetail(active, id, (updated) => {
            persistAccount(updated);
          });
          setDetailsById((prev) => ({ ...prev, [id]: detail }));
          void markMessageSeen(active, id);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to load message body';
          addToast(msg, 'error');
        } finally {
          setLoadingDetailId((cur) => (cur === id ? null : cur));
        }
      } else {
        void markMessageSeen(active, id);
      }
    },
    [addToast, detailsById, expandedId, persistAccount],
  );

  const handleOpenForwardModal = useCallback(
    async (msg: MailSummary) => {
      setForwardTarget(msg);

      const active = accountRef.current;
      if (!active || detailsById[msg.id]) return;

      setLoadingDetailId(msg.id);
      try {
        const detail = await fetchMessageDetail(active, msg.id, (updated) => {
          persistAccount(updated);
        });
        setDetailsById((prev) => ({ ...prev, [msg.id]: detail }));
      } catch {
        // Modal falls back cleanly to message.intro if detail load fails
      } finally {
        setLoadingDetailId((cur) => (cur === msg.id ? null : cur));
      }
    },
    [detailsById, persistAccount],
  );

  const handleForwardViaServer = useCallback(
    async (params: { messageId: string; to: string; note?: string }) => {
      const active = accountRef.current;
      if (!active) return false;
      try {
        const res = await forwardInboxMessage(active, params, (updated) => {
          persistAccount(updated);
        });
        addToast(`Forwarded email to ${res.recipient}`, 'success', 3200);
        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not forward email';
        addToast(msg, 'error', 3600);
        return false;
      }
    },
    [addToast, persistAccount],
  );

  const handleDeleteMessage = useCallback(
    async (id: string) => {
      const active = accountRef.current;
      if (!active) return;

      try {
        await deleteMessage(active, id, (updated) => {
          persistAccount(updated);
        });
        setMessages((prev) => prev.filter((m) => m.id !== id));
        knownMessageIdsRef.current.delete(id);
        if (expandedId === id) setExpandedId(null);
        if (forwardTarget?.id === id) setForwardTarget(null);
        addToast('Message deleted', 'success', 2200);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not delete message';
        addToast(msg, 'error');
      }
    },
    [addToast, expandedId, forwardTarget?.id, persistAccount],
  );

  const handleConfirmDeleteInbox = useCallback(async () => {
    const active = accountRef.current;
    setModalMode(null);
    syncSeqRef.current += 1;

    if (active) {
      await deleteMailboxAccount(active);
    }

    persistAccount(null);
    setMessages([]);
    setDetailsById({});
    setExpandedId(null);
    knownMessageIdsRef.current = new Set();
    setStatus('deleted');
    addToast('Inbox deleted', 'success');
  }, [addToast, persistAccount]);

  const handleConfirmNewInbox = useCallback(
    (customLocalPart?: string, domain?: string) => {
      setModalMode(null);
      void generateNewInbox(customLocalPart, domain);
    },
    [generateNewInbox],
  );

  const handleExportToTelegram = useCallback(async () => {
    const active = accountRef.current;
    if (!active) return null;
    try {
      const res = await exportAccountToTelegram(active);
      addToast(`Sync code ready: ${res.code}`, 'success', 2500);
      return res;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not generate sync link';
      addToast(msg, 'error');
      return null;
    }
  }, [addToast]);

  const handleImportFromTelegram = useCallback(
    async (code: string) => {
      try {
        const imported = await importAccountFromSyncCode(code);
        syncSeqRef.current += 1;
        setExpandedId(null);
        setDetailsById({});
        knownMessageIdsRef.current = new Set();
        persistAccount(imported);
        setStatus('live');
        setLastSyncedAt(Date.now());
        addToast(`Synced inbox: ${imported.address}`, 'success');
        await refreshInbox(true);
        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Invalid or expired sync code';
        addToast(msg, 'error');
        return false;
      }
    },
    [addToast, persistAccount, refreshInbox],
  );

  return (
    <div className="relative min-h-screen">
      <AnimatedBackdrop />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <Header />

        <AddressCard
          account={account}
          status={status}
          pollIntervalMs={POLL_INTERVAL_MS}
          lastSyncedAt={lastSyncedAt}
          onCopySuccess={() =>
            addToast('Email address copied to clipboard', 'success', 2200)
          }
          onCopyError={(msg) => addToast(msg, 'error')}
          onRequestNew={() => setModalMode('new-address')}
          onRefresh={() => void refreshInbox(false)}
          onRequestDelete={() => setModalMode('delete-inbox')}
        />

        <InboxCard
          messages={messages}
          status={status}
          errorMessage={errorMessage}
          expandedId={expandedId}
          detailsById={detailsById}
          loadingDetailId={loadingDetailId}
          onToggleExpand={(id) => void handleToggleExpand(id)}
          onDeleteMessage={(id) => void handleDeleteMessage(id)}
          onForwardMessage={(msg) => void handleOpenForwardModal(msg)}
          onRetryCreate={() => void generateNewInbox()}
          onCreateNew={() => setModalMode('new-address')}
          onCopyOtp={(code) => addToast(`Copied code ${code}`, 'success', 2000)}
        />

        <TelegramSyncCard
          account={account}
          botStatus={botStatus}
          onExportCode={handleExportToTelegram}
          onImportCode={handleImportFromTelegram}
          onCopySuccess={(msg) => addToast(msg, 'success', 2000)}
        />
      </main>

      <ConfirmModal
        mode={modalMode}
        domains={domains}
        hasActiveAccount={Boolean(account)}
        onClose={() => setModalMode(null)}
        onConfirmNew={handleConfirmNewInbox}
        onConfirmDelete={() => void handleConfirmDeleteInbox()}
      />

      <ForwardModal
        message={forwardTarget}
        detail={forwardTarget ? detailsById[forwardTarget.id] : undefined}
        isLoadingDetail={
          Boolean(forwardTarget) && loadingDetailId === forwardTarget?.id
        }
        disposableAddress={account?.address ?? null}
        forwardStatus={forwardStatus}
        onClose={() => setForwardTarget(null)}
        onForwardViaServer={handleForwardViaServer}
        onCopySuccess={(msg) => addToast(msg, 'success', 2200)}
        onMailtoOpened={(recipient) => {
          addToast(`Opened email app to forward to ${recipient}`, 'info', 2800);
        }}
      />
    </div>
  );
}
