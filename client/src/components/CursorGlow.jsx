import { useEffect, useRef } from 'react';

const LEAD = 0.14;
const TRAIL = 0.045;

/**
 * Fixed background layer: a warm spotlight follows the cursor, a cool blob trails behind it
 * and a dot grid shows through around the pointer. Works via CSS variables and one rAF loop
 * that sleeps once the motion settles.
 */
export function CursorGlow() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    const start = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.3 };
    const target = { ...start };
    const lead = { ...start };
    const trail = { ...start };
    let frame = 0;

    const apply = () => {
      el.style.setProperty('--gx', `${lead.x}px`);
      el.style.setProperty('--gy', `${lead.y}px`);
      el.style.setProperty('--tx', `${trail.x}px`);
      el.style.setProperty('--ty', `${trail.y}px`);
    };
    apply();
    if (reduced || !finePointer) return undefined;

    const step = () => {
      lead.x += (target.x - lead.x) * LEAD;
      lead.y += (target.y - lead.y) * LEAD;
      trail.x += (target.x - trail.x) * TRAIL;
      trail.y += (target.y - trail.y) * TRAIL;
      apply();
      const settled = Math.abs(target.x - trail.x) < 0.5 && Math.abs(target.y - trail.y) < 0.5;
      frame = settled ? 0 : requestAnimationFrame(step);
    };

    const onMove = (event) => {
      target.x = event.clientX;
      target.y = event.clientY;
      el.classList.add('cursor-glow--active');
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onLeave = () => el.classList.remove('cursor-glow--active');

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="cursor-glow" aria-hidden="true">
      <div className="cursor-glow__trail" />
      <div className="cursor-glow__spot" />
      <div className="cursor-glow__grid" />
    </div>
  );
}
