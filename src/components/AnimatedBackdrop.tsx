import { useEffect, useRef } from 'react';

export function AnimatedBackdrop() {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let rafId = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 3;

    const onPointerMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          if (spotlightRef.current) {
            spotlightRef.current.style.transform = `translate3d(${targetX - 260}px, ${targetY - 260}px, 0)`;
          }
          rafId = 0;
        });
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#05050f] via-[#090a1a] to-[#0e091e]"
    >
      {/* Subtle drifting radial dot grid */}
      <div
        className="animate-grid-drift absolute -inset-12 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.045) 1px, transparent 0)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* Flowing ambient nebula orbs */}
      <div
        className="animate-orb-a pointer-events-none absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full opacity-45 blur-[110px]"
        style={{
          background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)',
        }}
      />
      <div
        className="animate-orb-b pointer-events-none absolute -right-44 -bottom-48 h-[640px] w-[640px] rounded-full opacity-45 blur-[115px]"
        style={{
          background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)',
        }}
      />
      <div
        className="animate-orb-c pointer-events-none absolute top-[32%] left-1/2 h-[460px] w-[460px] rounded-full opacity-35 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)',
        }}
      />
      <div
        className="animate-orb-a pointer-events-none absolute bottom-[12%] left-[8%] h-[340px] w-[340px] rounded-full opacity-30 blur-[95px]"
        style={{
          background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)',
        }}
      />

      {/* Interactive pointer-tracking ambient glow */}
      <div
        ref={spotlightRef}
        className="pointer-events-none fixed top-0 left-0 h-[540px] w-[540px] rounded-full opacity-25 blur-[90px] transition-opacity duration-500"
        style={{
          transform: 'translate3d(30vw, 20vh, 0)',
          background:
            'radial-gradient(circle, rgba(168, 85, 247, 0.5) 0%, rgba(59, 130, 246, 0.25) 45%, transparent 72%)',
        }}
      />
    </div>
  );
}
