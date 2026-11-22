import { useState } from 'react';
import {
  ArrowRightLeft,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Send,
  Smartphone,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  SyncExportResponse,
  TelegramBotStatusInfo,
  TempAccount,
} from '../types/mail';

interface TelegramSyncCardProps {
  account: TempAccount | null;
  botStatus: TelegramBotStatusInfo | null;
  onExportCode: () => Promise<SyncExportResponse | null>;
  onImportCode: (code: string) => Promise<boolean>;
  onCopySuccess: (text: string) => void;
}

export function TelegramSyncCard({
  account,
  botStatus,
  onExportCode,
  onImportCode,
  onCopySuccess,
}: TelegramSyncCardProps) {
  const [exportInfo, setExportInfo] = useState<SyncExportResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleGenerateLink = async () => {
    setExporting(true);
    try {
      const res = await onExportCode();
      if (res) setExportInfo(res);
    } finally {
      setExporting(false);
    }
  };

  const handleCopyCommand = async () => {
    if (!exportInfo) return;
    const cmd = `/link ${exportInfo.code}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(true);
      onCopySuccess(`Copied ${cmd}`);
      window.setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = importInput.trim().toUpperCase();
    if (!cleaned) return;
    setImporting(true);
    try {
      const ok = await onImportCode(cleaned);
      if (ok) {
        setImportInput('');
      }
    } finally {
      setImporting(false);
    }
  };

  const isConnected = Boolean(botStatus?.connected);
  const isConfigured = Boolean(botStatus?.configured);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Telegram bot sync"
      className="relative mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#121226]/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/25">
            <Send className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-100">
              Telegram Bot Sync
            </h2>
            <p className="text-xs text-slate-400">
              Use the same inbox simultaneously on Website and Telegram
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          {isConnected && botStatus?.botUsername ? (
            <a
              href={`https://t.me/${botStatus.botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sky-300 transition-colors hover:text-sky-200"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>@{botStatus.botUsername}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : isConfigured ? (
            <span className="text-amber-300">Bot connecting…</span>
          ) : (
            <span className="text-slate-400">
              Set TELEGRAM_BOT_TOKEN in Secrets
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Export Website -> Telegram */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-black/25 p-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Smartphone className="h-4 w-4 text-sky-400" />
              <span>Continue in Telegram</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Generate a one-time link to mirror this web inbox and get instant Telegram OTP alerts.
            </p>
          </div>

          <div className="mt-4 space-y-2.5">
            <motion.button
              type="button"
              disabled={!account || exporting}
              onClick={handleGenerateLink}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(14,165,233,0.3)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>
                {exporting
                  ? 'Creating link…'
                  : exportInfo
                    ? 'Regenerate Telegram Link'
                    : 'Connect Active Inbox'}
              </span>
            </motion.button>

            <AnimatePresence>
              {exportInfo && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="space-y-2 rounded-xl border border-sky-400/25 bg-sky-500/10 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-semibold text-sky-100">
                      /link {exportInfo.code}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCommand}
                      aria-label="Copy Telegram link command"
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-white/20"
                    >
                      {copiedCmd ? (
                        <Check className="h-3 w-3 text-emerald-300" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>{copiedCmd ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {exportInfo.deepLink && (
                    <a
                      href={exportInfo.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500/25 text-xs font-semibold text-sky-100 ring-1 ring-sky-400/35 transition-colors hover:bg-sky-500/35"
                    >
                      <span>Open in Telegram</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Import Telegram -> Website */}
        <form
          onSubmit={handleImportSubmit}
          className="flex flex-col justify-between rounded-2xl border border-white/10 bg-black/25 p-4"
        >
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-100">
              <ArrowRightLeft className="h-4 w-4 text-purple-400" />
              <span>Import from Telegram</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Tap <span className="text-slate-200">📊 Statistics</span> (or send{' '}
              <span className="font-mono-tabular text-slate-300">/web</span>) in
              the Telegram bot and paste the 8-character code here.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              value={importInput}
              onChange={(e) => setImportInput(e.target.value.toUpperCase())}
              placeholder="Sync code (e.g. A7K9P2QX)"
              maxLength={12}
              aria-label="Telegram sync code"
              className="font-mono-tabular h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs font-semibold tracking-wider text-slate-100 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none"
            />
            <motion.button
              type="submit"
              disabled={!importInput.trim() || importing}
              whileTap={{ scale: 0.97 }}
              className="h-10 shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-semibold whitespace-nowrap text-slate-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {importing ? 'Syncing…' : 'Sync'}
            </motion.button>
          </div>
        </form>
      </div>
    </motion.section>
  );
}
