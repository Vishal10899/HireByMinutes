import React, { useEffect, useRef } from 'react';

export const AmbientCursorLight: React.FC = () => {
  const lightRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ targetX: -200, targetY: -200, currentX: -200, currentY: -200 });
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    // Only enable on pointer-capable devices
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) return;

    const handleMouseMove = (e: MouseEvent) => {
      posRef.current.targetX = e.clientX;
      posRef.current.targetY = e.clientY;
    };

    const animate = () => {
      const pos = posRef.current;
      // Gentle smoothing factor (0.08) for organic fluid water-reflection lag
      pos.currentX += (pos.targetX - pos.currentX) * 0.08;
      pos.currentY += (pos.targetY - pos.currentY) * 0.08;

      if (lightRef.current) {
        lightRef.current.style.transform = `translate3d(${pos.currentX - 250}px, ${pos.currentY - 250}px, 0)`;
      }

      rafId.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    rafId.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div
      ref={lightRef}
      aria-hidden="true"
      className="fixed top-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none select-none z-0 transition-opacity duration-700 opacity-60 dark:opacity-40"
      style={{
        background: 'radial-gradient(circle, rgba(68, 166, 181, 0.09) 0%, rgba(178, 213, 226, 0.04) 45%, transparent 70%)',
        filter: 'blur(35px)',
        willChange: 'transform'
      }}
    />
  );
};
export default AmbientCursorLight;
