import React, { useEffect, useRef, useState } from 'react';

export const CustomCursor: React.FC = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({
    targetX: -100,
    targetY: -100,
    dotX: -100,
    dotY: -100,
    ringX: -100,
    ringY: -100
  });
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    // Only enable for pointer-capable devices with mouse support
    if (window.matchMedia('(hover: none)').matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      posRef.current.targetX = e.clientX;
      posRef.current.targetY = e.clientY;
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseDown = () => setIsPressed(true);
    const handleMouseUp = () => setIsPressed(false);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    const checkInteractiveTarget = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isInteractive = !!target.closest('button, a, input, select, textarea, [role="button"], .water-surface-card, .cursor-pointer');
      setIsHovered(isInteractive);
    };

    const animate = () => {
      const pos = posRef.current;

      // Exact instant snap for the small central dot
      pos.dotX += (pos.targetX - pos.dotX) * 0.45;
      pos.dotY += (pos.targetY - pos.dotY) * 0.45;

      // Fluid trailing physics for the outer aura ring (lerp factor 0.14)
      pos.ringX += (pos.targetX - pos.ringX) * 0.14;
      pos.ringY += (pos.targetY - pos.ringY) * 0.14;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${pos.dotX}px, ${pos.dotY}px, 0)`;
      }

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${pos.ringX}px, ${pos.ringY}px, 0)`;
      }

      rafId.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousemove', checkInteractiveTarget, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    rafId.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousemove', checkInteractiveTarget);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {/* Outer Soft Aura Ring */}
      <div
        ref={ringRef}
        className={`fixed top-0 left-0 -ml-4 -mt-4 rounded-full pointer-events-none transition-[width,height,background-color,border-color,opacity] duration-200 ease-out will-change-transform ${
          isHovered
            ? 'w-11 h-11 -ml-5.5 -mt-5.5 border border-moonstone/70 bg-moonstone/15 shadow-[0_0_20px_rgba(68,166,181,0.25)]'
            : isPressed
            ? 'w-6 h-6 -ml-3 -mt-3 border border-moonstone bg-moonstone/25 shadow-xs'
            : 'w-8 h-8 -ml-4 -mt-4 border border-moonstone/40 bg-moonstone/5 shadow-subtle'
        }`}
      />

      {/* Inner Precision Dot */}
      <div
        ref={dotRef}
        className={`fixed top-0 left-0 -ml-1 -mt-1 rounded-full pointer-events-none transition-[transform,background-color] duration-150 will-change-transform ${
          isHovered
            ? 'w-2.5 h-2.5 -ml-1.25 -mt-1.25 bg-moonstone shadow-[0_0_8px_#44A6B5]'
            : isPressed
            ? 'w-1.5 h-1.5 -ml-0.75 -mt-0.75 bg-midnight-light'
            : 'w-2 h-2 -ml-1 -mt-1 bg-midnight'
        }`}
      />
    </div>
  );
};
export default CustomCursor;
