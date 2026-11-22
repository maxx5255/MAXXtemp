import { Mail } from 'lucide-react';
import { motion } from 'motion/react';

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 flex flex-col items-center text-center"
    >
      <div className="mb-2.5 flex items-center gap-3.5">
        <motion.div
          whileHover={{ scale: 1.06, rotate: -4 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 text-white shadow-[0_0_28px_rgba(168,85,247,0.45)]"
        >
          <Mail className="h-5 w-5" strokeWidth={2.3} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/25"
          />
        </motion.div>

        <h1 className="animate-gradient-text bg-gradient-to-r from-purple-300 via-pink-300 to-sky-300 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
          MAXXtemp
        </h1>
      </div>

      <p className="text-sm font-medium text-slate-400">
        Instant disposable email{' '}
        <span aria-hidden="true" className="mx-1.5 text-slate-600">
          ·
        </span>{' '}
        Private, encrypted proxy, auto-refreshing
      </p>
    </motion.header>
  );
}
