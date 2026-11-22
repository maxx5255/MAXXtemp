import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ToastItem } from '../types/mail';

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-4 right-4 left-4 z-50 flex flex-col items-end gap-2.5 sm:left-auto sm:w-88"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const borderClass =
            t.type === 'success'
              ? 'border-emerald-500/40'
              : t.type === 'error'
                ? 'border-red-500/45'
                : 'border-sky-500/40';

          const barColor =
            t.type === 'success'
              ? 'bg-emerald-400'
              : t.type === 'error'
                ? 'bg-red-400'
                : 'bg-sky-400';

          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border ${borderClass} bg-[#14142b]/95 px-4 py-3 text-sm font-medium text-slate-100 shadow-2xl backdrop-blur-xl`}
            >
              <div className="flex items-center gap-3">
                {t.type === 'success' && (
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
                )}
                {t.type === 'error' && (
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-400" />
                )}
                {t.type === 'info' && (
                  <Info className="h-4.5 w-4.5 shrink-0 text-sky-400" />
                )}
                <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
                <button
                  type="button"
                  onClick={() => onDismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: t.durationMs / 1000, ease: 'linear' }}
                style={{ transformOrigin: 'left' }}
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-0.5 opacity-70 ${barColor}`}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
