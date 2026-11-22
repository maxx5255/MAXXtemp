import { useEffect, useState } from 'react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { MailDomain } from '../types/mail';
import { sanitizeCustomLocalPart } from '../utils/mailLogic';

export type ModalMode = 'new-address' | 'delete-inbox' | null;

interface ConfirmModalProps {
  mode: ModalMode;
  domains: MailDomain[];
  hasActiveAccount: boolean;
  onClose: () => void;
  onConfirmNew: (customLocalPart?: string, domain?: string) => void;
  onConfirmDelete: () => void;
}

export function ConfirmModal({
  mode,
  domains,
  hasActiveAccount,
  onClose,
  onConfirmNew,
  onConfirmDelete,
}: ConfirmModalProps) {
  const [customPrefix, setCustomPrefix] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');

  useEffect(() => {
    if (mode === 'new-address') {
      setCustomPrefix('');
      setSelectedDomain(domains[0]?.domain ?? '');
    }
  }, [mode, domains]);

  useEffect(() => {
    if (!mode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose]);

  const sanitizedPreview = sanitizeCustomLocalPart(customPrefix);

  return (
    <AnimatePresence>
      {mode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#121228]/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-purple-400"
            >
              <X className="h-4 w-4" />
            </button>

            {mode === 'new-address' ? (
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300 ring-1 ring-purple-400/25">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2
                  id="modal-title"
                  className="text-lg font-bold text-slate-100"
                >
                  Create New Address
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  {hasActiveAccount
                    ? 'Switching creates a fresh disposable inbox and clears your current local session.'
                    : 'Choose a custom username or leave it blank for an instant random address.'}
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="custom-prefix-input"
                      className="mb-1.5 block text-xs font-semibold text-slate-300"
                    >
                      Custom username (optional)
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 focus-within:border-purple-400/60">
                      <input
                        id="custom-prefix-input"
                        type="text"
                        value={customPrefix}
                        onChange={(e) => setCustomPrefix(e.target.value)}
                        placeholder="Leave blank for random"
                        maxLength={32}
                        className="font-mono-tabular min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                      />
                      {selectedDomain && (
                        <span className="font-mono-tabular shrink-0 text-xs text-slate-400">
                          @{selectedDomain}
                        </span>
                      )}
                    </div>
                    {customPrefix.trim().length > 0 &&
                      sanitizedPreview.length < 3 && (
                        <p className="mt-1 text-xs text-amber-300">
                          Enter at least 3 valid characters (letters, numbers, dot, underscore, hyphen).
                        </p>
                      )}
                  </div>

                  {domains.length > 1 && (
                    <div>
                      <label
                        htmlFor="domain-select"
                        className="mb-1.5 block text-xs font-semibold text-slate-300"
                      >
                        Domain
                      </label>
                      <select
                        id="domain-select"
                        value={selectedDomain}
                        onChange={(e) => setSelectedDomain(e.target.value)}
                        className="font-mono-tabular w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-slate-100 focus:border-purple-400/60 focus:outline-none"
                      >
                        {domains.map((d) => (
                          <option
                            key={d.id}
                            value={d.domain}
                            className="bg-[#121228] text-slate-100"
                          >
                            @{d.domain}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      customPrefix.trim().length > 0 &&
                      sanitizedPreview.length < 3
                    }
                    onClick={() => {
                      onConfirmNew(
                        sanitizedPreview.length >= 3
                          ? sanitizedPreview
                          : undefined,
                        selectedDomain || undefined,
                      );
                    }}
                    className="h-10 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Generate Inbox
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/15 text-red-400 ring-1 ring-red-400/25">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h2
                  id="modal-title"
                  className="text-lg font-bold text-slate-100"
                >
                  Delete Current Inbox?
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  This permanently deletes the temporary address and all received messages. You can create a new address anytime.
                </p>

                <div className="mt-6 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10"
                  >
                    Keep Inbox
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmDelete}
                    className="h-10 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                  >
                    Delete Permanently
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
