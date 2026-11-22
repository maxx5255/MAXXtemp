import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  MailCheck,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { InboxStatus, TempAccount } from '../types/mail';
import { spawnConfettiBurst } from '../utils/confetti';

interface AddressCardProps {
  account: TempAccount | null;
  status: InboxStatus;
  pollIntervalMs: number;
  lastSyncedAt: number;
  onCopySuccess: () => void;
  onCopyError: (msg: string) => void;
  onRequestNew: () => void;
  onRefresh: () => void;
  onRequestDelete: () => void;
}

const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function useScrambleText(target: string, active: boolean) {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (!active || !target || target === 'Generating…' || target === '—') {
      setDisplay(target);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target);
      return;
    }

    let frame = 0;
    const totalFrames = 18;
    const timer = window.setInterval(() => {
      frame += 1;
      const progress = frame / totalFrames;
      const revealedCount = Math.floor(progress * target.length);

      const scrambled = target
        .split('')
        .map((ch, idx) => {
          if (idx < revealedCount || ch === '@' || ch === '.') return ch;
          return SCRAMBLE_CHARS[
            Math.floor(Math.random() * SCRAMBLE_CHARS.length)
          ];
        })
        .join('');

      setDisplay(scrambled);
      if (frame >= totalFrames) {
        window.clearInterval(timer);
        setDisplay(target);
      }
    }, 24);

    return () => window.clearInterval(timer);
  }, [target, active]);

  return display;
}

export function AddressCard({
  account,
  status,
  pollIntervalMs,
  lastSyncedAt,
  onCopySuccess,
  onCopyError,
  onRequestNew,
  onRefresh,
  onRequestDelete,
}: AddressCardProps) {
  const [copied, setCopied] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);
  const [syncProgress, setSyncProgress] = useState(0);
  const copyBtnRef = useRef<HTMLButtonElement>(null);

  const rawDisplay =
    status === 'creating'
      ? 'Generating…'
      : account?.address || (status === 'deleted' ? 'No active inbox' : '—');

  const scrambledAddress = useScrambleText(
    rawDisplay,
    Boolean(account?.address) && status !== 'creating',
  );

  // Subtle live countdown progress indicator between auto-polls
  useEffect(() => {
    if (status !== 'live' && status !== 'syncing') {
      setSyncProgress(0);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - lastSyncedAt;
      const pct = Math.min(100, Math.max(0, (elapsed / pollIntervalMs) * 100));
      setSyncProgress(pct);
    };
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, [status, lastSyncedAt, pollIntervalMs]);

  const handleCopy = async () => {
    if (!account?.address) {
      onCopyError('Generate an inbox address first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(account.address);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = account.address;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch {
        onCopyError('Clipboard access was blocked by the browser.');
        return;
      }
    }

    setCopied(true);
    setRippleKey((k) => k + 1);
    spawnConfettiBurst(copyBtnRef.current, 26);
    onCopySuccess();
    window.setTimeout(() => setCopied(false), 2000);
  };

  const isBusy = status === 'creating';
  const isSyncing = status === 'syncing';

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Temporary email address"
      className="relative mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[#121226]/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
    >
      {/* Top hairline iridescent highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/60 to-transparent"
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-400">
          <MailCheck className="h-4 w-4 text-purple-400" />
          <span>Your Temporary Address</span>
        </div>
        {account && (
          <span className="font-mono-tabular text-xs text-slate-400">
            Auto-sync {Math.max(1, Math.ceil(((100 - syncProgress) / 100) * (pollIntervalMs / 1000)))}s
          </span>
        )}
      </div>

      {/* Email address display bar */}
      <div className="group relative flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 p-1.5 pl-4 transition-colors duration-200 focus-within:border-purple-400/50 hover:border-purple-400/35">
        {isBusy && (
          <div
            aria-hidden="true"
            className="animate-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-purple-400/10 to-transparent"
          />
        )}

        <div
          data-testid="email-address-value"
          className="font-mono-tabular min-w-0 flex-1 py-2.5 text-sm font-semibold tracking-tight text-slate-100 select-all break-all sm:text-lg"
        >
          {scrambledAddress}
        </div>

        <motion.button
          ref={copyBtnRef}
          type="button"
          onClick={handleCopy}
          disabled={!account || isBusy}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Copy email address"
          className={`relative flex h-11 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-semibold text-white transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-45 ${
            copied
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-[0_6px_22px_rgba(16,185,129,0.45)]'
              : 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_6px_20px_rgba(168,85,247,0.4)] hover:from-purple-400 hover:to-pink-400'
          }`}
        >
          {rippleKey > 0 && (
            <motion.span
              key={rippleKey}
              initial={{ scale: 0.3, opacity: 0.65 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              aria-hidden="true"
              className="pointer-events-none absolute h-10 w-10 rounded-full bg-white/40"
            />
          )}

          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="copied"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Check className="h-4 w-4" strokeWidth={2.7} />
                <span>Copied</span>
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Copy className="h-4 w-4" />
                <span>Copy</span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Subtle sync progress bar */}
      <div
        aria-hidden="true"
        className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/5"
      >
        <div
          className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-sky-400 transition-transform duration-150 ease-linear"
          style={{
            transform: `translateX(-${100 - syncProgress}%)`,
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <motion.button
          type="button"
          onClick={onRequestNew}
          disabled={isBusy}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-4 text-sm font-semibold whitespace-nowrap text-white shadow-[0_6px_20px_rgba(124,58,237,0.35)] transition-shadow hover:shadow-[0_10px_28px_rgba(168,85,247,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          <span>New Address</span>
        </motion.button>

        <motion.button
          type="button"
          onClick={onRefresh}
          disabled={!account || isBusy}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold whitespace-nowrap text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RefreshCw
            className={`h-4 w-4 ${isSyncing ? 'animate-spin text-purple-300' : ''}`}
          />
          <span>{isSyncing ? 'Syncing…' : 'Refresh'}</span>
        </motion.button>

        <motion.button
          type="button"
          onClick={onRequestDelete}
          disabled={!account || isBusy}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold whitespace-nowrap text-slate-200 transition-colors hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-1"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete Inbox</span>
        </motion.button>
      </div>

      <p className="mt-3.5 hidden items-center justify-center gap-3 text-xs text-slate-500 sm:flex">
        <span>Press C to copy</span>
        <span aria-hidden="true">·</span>
        <span>Press R to sync</span>
        <span aria-hidden="true">·</span>
        <span>Press N for new address</span>
      </p>
    </motion.section>
  );
}
