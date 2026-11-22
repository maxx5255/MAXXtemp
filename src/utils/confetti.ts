const CONFETTI_COLORS = [
  '#a855f7',
  '#ec4899',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
];

export function spawnConfettiBurst(anchorEl: HTMLElement | null, count = 24) {
  if (typeof window === 'undefined' || !anchorEl) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rect = anchorEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('span');
    const size = 5 + Math.random() * 5;
    const isCircle = Math.random() > 0.65;

    particle.style.position = 'fixed';
    particle.style.left = `${cx}px`;
    particle.style.top = `${cy}px`;
    particle.style.width = `${size}px`;
    particle.style.height = `${isCircle ? size : size * 0.65}px`;
    particle.style.borderRadius = isCircle ? '9999px' : '2px';
    particle.style.background =
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    particle.style.pointerEvents = 'none';
    particle.style.zIndex = '9999';
    document.body.appendChild(particle);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 50 + Math.random() * 110;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 18;
    const rot = (Math.random() - 0.5) * 720;

    const anim = particle.animate(
      [
        {
          transform: 'translate(-50%, -50%) scale(1) rotate(0deg)',
          opacity: 1,
        },
        {
          transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px)) scale(1.1) rotate(${rot * 0.5}deg)`,
          opacity: 0.95,
          offset: 0.45,
        },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 35}px)) scale(0.1) rotate(${rot}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 720 + Math.random() * 320,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    );

    anim.onfinish = () => particle.remove();
  }
}
