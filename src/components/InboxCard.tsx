import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Forward,
  Inbox,
  KeyRound,
  Mail,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  InboxStatus,
  MailDetail,
  MailFilter,
  MailSummary,
} from '../types/mail';
import {
  extractOtpCodes,
  filterMessages,
  formatRelativeTime,
  getSenderInitial,
  normalizeHtmlBody,
  stripHtmlToText,
} from '../utils/mailLogic';

interface InboxCardProps {
  messages: MailSummary[];
  status: InboxStatus;
  errorMessage: string | null;
  expandedId: string | null;
  detailsById: Record<string, MailDetail>;
  loadingDetailId: string | null;
  onToggleExpand: (id: string) => void;
  onDeleteMessage: (id: string) => void;
  onForwardMessage: (msg: MailSummary) => void;
  onRetryCreate: () => void;
  onCreateNew: () => void;
  onCopyOtp: (code: string) => void;
}

const AVATAR_GRADIENTS = [
  'from-purple-500 to-indigo-500',
  'from-pink-500 to-rose-500',
  'from-sky-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
];

function pickAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function InboxCard({
  messages,
  status,
  errorMessage,
  expandedId,
  detailsById,
  loadingDetailId,
  onToggleExpand,
  onDeleteMessage,
  onForwardMessage,
  onRetryCreate,
  onCreateNew,
  onCopyOtp,
}: InboxCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<MailFilter>('all');
  const [viewModeById, setViewModeById] = useState<
    Record<string, 'text' | 'html'>
  >({});
  const [copiedOtp, setCopiedOtp] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.seen).length,
    [messages],
  );

  const visibleMessages = useMemo(
    () => filterMessages(messages, searchQuery, filterMode),
    [messages, searchQuery, filterMode],
  );

  const handleOtpClick = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback ignored if blocked
    }
    setCopiedOtp(code);
    onCopyOtp(code);
    window.setTimeout(() => setCopiedOtp(null), 1800);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Inbox"
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121226]/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/45 to-transparent"
      />

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-5 w-5 text-purple-400" />
          <h2 className="text-base font-bold tracking-tight text-slate-100">
            Inbox
          </h2>
          <span
            data-testid="inbox-count"
            className="font-mono-tabular text-sm font-semibold text-slate-400"
          >
            <span aria-hidden="true" className="mr-1.5 text-slate-600">
              ·
            </span>
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            {unreadCount > 0 ? ` (${unreadCount} unread)` : ''}
          </span>
        </div>

        {/* Live Telemetry Indicator */}
        <div
          data-testid="inbox-status"
          className={`flex items-center gap-2 text-xs font-semibold ${
            status === 'live'
              ? 'text-emerald-400'
              : status === 'syncing' || status === 'creating'
                ? 'text-amber-300'
                : status === 'error'
                  ? 'text-red-400'
                  : 'text-slate-400'
          }`}
        >
          {status === 'live' && (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <Wifi className="h-3.5 w-3.5" />
              <span>Live</span>
            </>
          )}
          {(status === 'syncing' || status === 'creating') && (
            <>
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
              <span>{status === 'creating' ? 'Creating' : 'Syncing'}</span>
            </>
          )}
          {status === 'error' && (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>Connection issue</span>
            </>
          )}
          {status === 'deleted' && <span>Deleted</span>}
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      {status !== 'creating' &&
        status !== 'deleted' &&
        messages.length > 0 && (
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sender or subject…"
                aria-label="Search messages"
                className="h-9 w-full rounded-xl border border-white/10 bg-black/30 pr-3 pl-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-purple-400/50 focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Filter messages"
              className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
            >
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`h-7 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                  filterMode === 'all'
                    ? 'bg-purple-500/25 text-purple-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({messages.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('unread')}
                className={`h-7 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                  filterMode === 'unread'
                    ? 'bg-purple-500/25 text-purple-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>
        )}

      {/* Content Area */}
      <div className="mail-scroll max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
        {status === 'creating' ? (
          <div className="space-y-2.5 py-2" aria-label="Loading inbox">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-white/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-40 rounded bg-white/10" />
                    <div className="h-3 w-64 max-w-full rounded bg-white/5" />
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="animate-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"
                />
              </div>
            ))}
          </div>
        ) : status === 'error' && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              Could not reach mailbox
            </h3>
            <p className="mt-1.5 max-w-sm text-sm text-slate-400">
              {errorMessage || 'Temporary connection issue. Please try again.'}
            </p>
            <button
              type="button"
              onClick={onRetryCreate}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-95"
            >
              <RotateCw className="h-4 w-4" />
              <span>Try Again</span>
            </button>
          </div>
        ) : status === 'deleted' ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400 ring-1 ring-white/10">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-100">
              Inbox deleted
            </h3>
            <p className="mt-1.5 max-w-sm text-sm text-slate-400">
              Your previous temporary address and messages have been cleared.
            </p>
            <button
              type="button"
              onClick={onCreateNew}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Inbox</span>
            </button>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {/* Animated radar envelope */}
            <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
              <motion.span
                aria-hidden="true"
                animate={{ scale: [1, 1.45, 1], opacity: [0.35, 0, 0.35] }}
                transition={{
                  duration: 3.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="absolute inset-0 rounded-3xl border border-purple-400/35"
              />
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300 ring-1 ring-purple-400/25"
              >
                <Mail className="h-7 w-7" strokeWidth={1.7} />
              </motion.div>
            </div>

            <h3 className="text-base font-bold text-slate-100">
              {messages.length > 0
                ? 'No matching messages'
                : 'Waiting for incoming mail'}
            </h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">
              {messages.length > 0
                ? 'Try clearing your search query or switching back to All messages.'
                : 'Copy your temporary address above and use it anywhere. New emails arrive here automatically.'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleMessages.map((msg, idx) => {
              const fromAddr = msg.from?.address || 'Unknown sender';
              const fromName = msg.from?.name?.trim();
              const isUnread = !msg.seen;
              const isExpanded = expandedId === msg.id;
              const detail = detailsById[msg.id];
              const isLoadingDetail = loadingDetailId === msg.id;

              const htmlString = detail ? normalizeHtmlBody(detail.html) : '';
              const plainText = detail
                ? detail.text?.trim() ||
                  stripHtmlToText(htmlString) ||
                  '(empty message)'
                : '';

              const otpCodes = detail
                ? extractOtpCodes(`${msg.subject} ${plainText}`)
                : [];

              const preferredView =
                viewModeById[msg.id] ?? (htmlString ? 'html' : 'text');

              return (
                <motion.article
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
                  transition={{
                    duration: 0.28,
                    delay: Math.min(idx * 0.04, 0.25),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`overflow-hidden rounded-2xl border transition-colors duration-200 ${
                    isExpanded
                      ? 'border-purple-400/35 bg-purple-500/[0.08]'
                      : isUnread
                        ? 'border-purple-400/25 bg-purple-500/[0.04] hover:border-purple-400/40 hover:bg-purple-500/[0.07]'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleExpand(msg.id)}
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-start gap-3.5 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-purple-400"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${pickAvatarGradient(fromAddr)} text-sm font-bold text-white shadow-sm`}
                      >
                        {getSenderInitial(fromAddr, fromName)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {isUnread && (
                              <span
                                aria-label="Unread"
                                className="h-2 w-2 shrink-0 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]"
                              />
                            )}
                            <span className="truncate text-sm font-semibold text-slate-100">
                              {fromName || fromAddr}
                            </span>
                            {fromName && (
                              <span className="hidden truncate text-xs text-slate-400 sm:inline">
                                &lt;{fromAddr}&gt;
                              </span>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono-tabular text-xs text-slate-400">
                              {formatRelativeTime(msg.createdAt)}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180 text-purple-300' : ''
                              }`}
                            />
                          </div>
                        </div>

                        <p
                          className={`mt-1 truncate text-sm ${
                            isUnread
                              ? 'font-medium text-slate-200'
                              : 'text-slate-300'
                          }`}
                        >
                          {msg.subject || '(no subject)'}
                        </p>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center pr-3">
                      <button
                        type="button"
                        onClick={() => onForwardMessage(msg)}
                        aria-label={`Forward ${msg.subject || 'message'}`}
                        title="Forward to personal email"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-sky-400/40 hover:bg-sky-500/15 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-400"
                      >
                        <Forward className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden border-t border-white/10"
                      >
                        <div className="space-y-4 p-4">
                          {isLoadingDetail && !detail ? (
                            <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
                              <RotateCw className="h-4 w-4 animate-spin text-purple-400" />
                              <span>Loading message content…</span>
                            </div>
                          ) : (
                            <>
                              {/* Detected OTP / Verification Code quick-copy */}
                              {otpCodes.length > 0 && (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
                                    <KeyRound className="h-4 w-4 text-emerald-400" />
                                    <span>Verification code detected</span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {otpCodes.map((code) => (
                                      <button
                                        key={code}
                                        type="button"
                                        onClick={() => handleOtpClick(code)}
                                        className="font-mono-tabular inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-sm font-bold text-emerald-100 ring-1 ring-emerald-400/40 transition-colors hover:bg-emerald-500/30"
                                      >
                                        <span>{code}</span>
                                        {copiedOtp === code ? (
                                          <Check className="h-3.5 w-3.5 text-emerald-300" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5 text-emerald-300" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Controls row */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                {htmlString ? (
                                  <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setViewModeById((prev) => ({
                                          ...prev,
                                          [msg.id]: 'html',
                                        }))
                                      }
                                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        preferredView === 'html'
                                          ? 'bg-purple-500/25 text-purple-200'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      Rich View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setViewModeById((prev) => ({
                                          ...prev,
                                          [msg.id]: 'text',
                                        }))
                                      }
                                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        preferredView === 'text'
                                          ? 'bg-purple-500/25 text-purple-200'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      Plain Text
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-500">
                                    Plain text message
                                  </span>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onForwardMessage(msg)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 text-xs font-semibold whitespace-nowrap text-sky-200 transition-colors hover:border-sky-400/45 hover:bg-sky-500/20"
                                  >
                                    <Forward className="h-3.5 w-3.5" />
                                    <span>Forward</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => onDeleteMessage(msg.id)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold whitespace-nowrap text-slate-300 transition-colors hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-200"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Delete Message</span>
                                  </button>
                                </div>
                              </div>

                              {/* Message Body */}
                              {preferredView === 'html' && htmlString ? (
                                <iframe
                                  title={`Email body: ${msg.subject || 'message'}`}
                                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.65;color:#e2e8f0;background:#0b0b18;margin:0;padding:16px;word-break:break-word;}a{color:#c084fc;}img{max-width:100%;height:auto;border-radius:8px;}</style></head><body>${htmlString}</body></html>`}
                                  className="h-64 w-full rounded-xl border border-white/10 bg-[#0b0b18]"
                                />
                              ) : (
                                <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-200">
                                  {plainText}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  );
}
