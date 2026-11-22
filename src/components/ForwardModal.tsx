import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Forward,
  Info,
  RotateCw,
  Send,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  ForwardStatusInfo,
  MailDetail,
  MailSummary,
} from '../types/mail';
import {
  buildForwardedEmailPayload,
  isValidPersonalEmail,
  normalizeHtmlBody,
  stripHtmlToText,
} from '../utils/mailLogic';

const SAVED_FORWARD_EMAIL_KEY = 'mailbox_forward_email_v1';

interface ForwardModalProps {
  message: MailSummary | null;
  detail: MailDetail | undefined;
  isLoadingDetail: boolean;
  disposableAddress: string | null;
  forwardStatus: ForwardStatusInfo | null;
  onClose: () => void;
  onForwardViaServer: (params: {
    messageId: string;
    to: string;
    note?: string;
  }) => Promise<boolean>;
  onCopySuccess: (msg: string) => void;
  onMailtoOpened: (recipient: string) => void;
}

export function ForwardModal({
  message,
  detail,
  isLoadingDetail,
  disposableAddress,
  forwardStatus,
  onClose,
  onForwardViaServer,
  onCopySuccess,
  onMailtoOpened,
}: ForwardModalProps) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [note, setNote] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!message) return;
    setNote('');
    setShowPreview(false);
    setSubmitting(false);
    setServerError(null);
    setSentSuccess(false);
    setCopiedBody(false);

    try {
      const saved = localStorage.getItem(SAVED_FORWARD_EMAIL_KEY);
      if (saved && isValidPersonalEmail(saved)) {
        setRecipientEmail(saved);
      } else {
        setRecipientEmail('');
      }
    } catch {
      setRecipientEmail('');
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [message?.id]);

  useEffect(() => {
    if (!message) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [message, onClose]);

  const trimmedEmail = recipientEmail.trim();
  const isEmailValid = isValidPersonalEmail(trimmedEmail);
  const showValidationError = trimmedEmail.length > 0 && !isEmailValid;

  const plainBody = useMemo(() => {
    if (!message) return '';
    if (detail) {
      const htmlString = normalizeHtmlBody(detail.html);
      return (
        detail.text?.trim() ||
        stripHtmlToText(htmlString) ||
        detail.intro?.trim() ||
        '(empty message)'
      );
    }
    return message.intro?.trim() || '(loading message body…)';
  }, [message, detail]);

  const forwardedPayload = useMemo(() => {
    if (!message) return null;
    return buildForwardedEmailPayload({
      fromAddress: message.from?.address || 'Unknown sender',
      fromName: message.from?.name,
      toDisposableAddress: disposableAddress ?? undefined,
      subject: message.subject || '(no subject)',
      createdAt: message.createdAt,
      plainBody,
      recipientEmail: trimmedEmail,
      note,
    });
  }, [message, disposableAddress, plainBody, trimmedEmail, note]);

  const relayConfigured = Boolean(forwardStatus?.relayConfigured);

  const persistLastEmail = (email: string) => {
    if (!isValidPersonalEmail(email)) return;
    try {
      localStorage.setItem(SAVED_FORWARD_EMAIL_KEY, email.trim());
    } catch {
      // Ignore storage quota errors
    }
  };

  const handleServerForward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message || !isEmailValid || submitting) return;

    persistLastEmail(trimmedEmail);
    setServerError(null);

    if (!relayConfigured) {
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onForwardViaServer({
        messageId: message.id,
        to: trimmedEmail,
        note: note.trim() || undefined,
      });
      if (ok) {
        setSentSuccess(true);
      } else {
        setServerError('Unable to forward via server relay right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyFormatted = async () => {
    if (!forwardedPayload) return;
    const fullText = `To: ${trimmedEmail || '(enter personal email)'}\nSubject: ${forwardedPayload.subject}\n\n${forwardedPayload.textBody}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedBody(true);
      onCopySuccess('Forwarded email copied to clipboard');
      window.setTimeout(() => setCopiedBody(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <AnimatePresence>
      {message && forwardedPayload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forward-modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="mail-scroll relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-[#121228]/95 p-5 shadow-2xl backdrop-blur-xl sm:p-6"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close forward dialog"
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-purple-400"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25">
              <Forward className="h-5 w-5" />
            </div>

            <h2
              id="forward-modal-title"
              className="text-lg font-bold text-slate-100"
            >
              Forward Email
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Send a copy of this message to your personal email inbox.
            </p>

            {/* Clean metadata header separated by hairline borders */}
            <div className="mt-4 space-y-1 border-y border-white/10 py-3 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 font-semibold text-slate-400">
                  From
                </span>
                <span className="truncate font-medium text-slate-200">
                  {message.from?.name
                    ? `${message.from.name} <${message.from.address}>`
                    : message.from?.address || 'Unknown sender'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 font-semibold text-slate-400">
                  Subject
                </span>
                <span className="truncate font-medium text-slate-100">
                  {forwardedPayload.subject}
                </span>
              </div>
            </div>

            <form onSubmit={handleServerForward} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="forward-recipient-input"
                  className="mb-1.5 block text-xs font-semibold text-slate-300"
                >
                  Personal Email Address
                </label>
                <input
                  ref={inputRef}
                  id="forward-recipient-input"
                  type="email"
                  autoComplete="email"
                  value={recipientEmail}
                  onChange={(e) => {
                    setRecipientEmail(e.target.value);
                    setSentSuccess(false);
                    setServerError(null);
                  }}
                  placeholder="you@gmail.com"
                  aria-invalid={showValidationError}
                  className="font-mono-tabular h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3.5 text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
                />
                {showValidationError && (
                  <p className="mt-1.5 text-xs text-amber-300">
                    Enter a valid personal email address (e.g. name@gmail.com).
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="forward-note-input"
                  className="mb-1.5 block text-xs font-semibold text-slate-300"
                >
                  Personal Note (optional)
                </label>
                <textarea
                  id="forward-note-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Add a reminder or note above the forwarded message…"
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
                />
              </div>

              {/* Preview toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="text-xs font-semibold text-sky-300 transition-colors hover:text-sky-200"
                >
                  {showPreview
                    ? 'Hide forwarded message preview'
                    : 'Preview forwarded message'}
                </button>

                {showPreview && (
                  <div className="mail-scroll mt-2 max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words text-slate-300">
                    {isLoadingDetail && !detail ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <RotateCw className="h-3.5 w-3.5 animate-spin" />
                        Loading full message…
                      </span>
                    ) : (
                      forwardedPayload.textBody
                    )}
                  </div>
                )}
              </div>

              {!relayConfigured && (
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-sky-100">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                  <span>
                    Send directly through your email app now, or add{' '}
                    <code className="font-mono-tabular text-sky-200">
                      SMTP_*
                    </code>{' '}
                    /{' '}
                    <code className="font-mono-tabular text-sky-200">
                      RESEND_API_KEY
                    </code>{' '}
                    in Secrets for 1-click background forwarding.
                  </span>
                </div>
              )}

              {serverError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-200">
                  {serverError}
                </p>
              )}

              {sentSuccess && (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200">
                  <Check className="h-4 w-4 text-emerald-300" />
                  <span>
                    Forwarded to {trimmedEmail}
                    {forwardStatus?.relayProvider
                      ? ` via ${forwardStatus.relayProvider.toUpperCase()}`
                      : ''}
                    .
                  </span>
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCopyFormatted}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-semibold whitespace-nowrap text-slate-200 transition-colors hover:bg-white/10"
                >
                  {copiedBody ? (
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedBody ? 'Copied' : 'Copy Email'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-10 rounded-xl border border-white/10 px-4 text-xs font-semibold whitespace-nowrap text-slate-300 transition-colors hover:bg-white/10"
                  >
                    {sentSuccess ? 'Done' : 'Cancel'}
                  </button>

                  {relayConfigured ? (
                    <button
                      type="submit"
                      disabled={!isEmailValid || submitting || isLoadingDetail}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 text-xs font-semibold whitespace-nowrap text-white shadow-lg transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {submitting ? (
                        <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {submitting ? 'Forwarding…' : 'Send Forwarded Email'}
                      </span>
                    </button>
                  ) : (
                    <a
                      href={isEmailValid ? forwardedPayload.mailtoUrl : undefined}
                      aria-disabled={!isEmailValid}
                      onClick={(e) => {
                        if (!isEmailValid) {
                          e.preventDefault();
                          return;
                        }
                        persistLastEmail(trimmedEmail);
                        onMailtoOpened(trimmedEmail);
                      }}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 text-xs font-semibold whitespace-nowrap text-white shadow-lg transition-opacity ${
                        isEmailValid
                          ? 'hover:opacity-95'
                          : 'pointer-events-none opacity-45'
                      }`}
                    >
                      <span>Forward via Email App</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
