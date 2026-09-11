import React, { useEffect, useRef } from 'react';

export const CustomCursor: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotWrapperRef = useRef<HTMLDivElement>(null);
  const ringWrapperRef = useRef<HTMLDivElement>(null);
  const ringElementRef = useRef<HTMLDivElement>(null);

  const pos = useRef({
    targetX: -100,
    targetY: -100,
    ringX: -100,
    ringY: -100
  });

  const isVisibleRef = useRef(false);
  const isHoveredRef = useRef(false);
  const isPressedRef = useRef(false);
  const isTextRef = useRef(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    // 1. Device check: Disable completely for touch/mobile/tablet devices
    const isTouch =
      window.matchMedia('(hover: none)').matches ||
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0;

    // 2. Accessibility: Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isTouch || prefersReducedMotion) {
      return;
    }

    // Mark HTML root with custom cursor active class
    document.documentElement.classList.add('has-custom-cursor');

    const updateRingStyle = () => {
      if (!ringElementRef.current) return;
      if (isPressedRef.current) {
        ringElementRef.current.style.transform = 'scale(0.88)';
        ringElementRef.current.style.borderColor = 'rgba(0, 69, 84, 0.45)';
        ringElementRef.current.style.backgroundColor = 'rgba(68, 166, 181, 0.08)';
      } else if (isHoveredRef.current) {
        ringElementRef.current.style.transform = 'scale(1.22)';
        ringElementRef.current.style.borderColor = 'rgba(68, 166, 181, 0.6)';
        ringElementRef.current.style.backgroundColor = 'rgba(68, 166, 181, 0.05)';
      } else {
        ringElementRef.current.style.transform = 'scale(1)';
        ringElementRef.current.style.borderColor = 'rgba(0, 69, 84, 0.22)';
        ringElementRef.current.style.backgroundColor = 'rgba(68, 166, 181, 0.02)';
      }
    };

    const updateVisibility = () => {
      if (!containerRef.current) return;
      if (!isVisibleRef.current || isTextRef.current) {
        containerRef.current.style.opacity = '0';
      } else {
        containerRef.current.style.opacity = '1';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      pos.current.targetX = e.clientX;
      pos.current.targetY = e.clientY;

      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        // Snap ring position on first movement to avoid jump from offscreen
        pos.current.ringX = e.clientX;
        pos.current.ringY = e.clientY;
        updateVisibility();
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        // Detect text, form inputs, and editable areas where native cursor is essential
        const isTextInput = !!target.closest(
          'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"], [contenteditable=""], pre, code, .cursor-text'
        );
        if (isTextInput !== isTextRef.current) {
          isTextRef.current = isTextInput;
          updateVisibility();
        }

        // Detect interactive/clickable elements (buttons, links, summary, role=button)
        if (!isTextInput) {
          const isInteractive = !!target.closest(
            'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"], summary, label, .cursor-pointer'
          );
          if (isInteractive !== isHoveredRef.current) {
            isHoveredRef.current = isInteractive;
            updateRingStyle();
          }
        }
      }
    };

    const handleMouseDown = () => {
      isPressedRef.current = true;
      updateRingStyle();
    };

    const handleMouseUp = () => {
      isPressedRef.current = false;
      updateRingStyle();
    };

    const handleMouseLeave = () => {
      isVisibleRef.current = false;
      updateVisibility();
    };

    const handleMouseEnter = () => {
      isVisibleRef.current = true;
      updateVisibility();
    };

    // Smooth physics loop via requestAnimationFrame (Zero React re-renders)
    const animate = () => {
      const p = pos.current;

      // Center dot follows immediately (0 lag)
      if (dotWrapperRef.current) {
        dotWrapperRef.current.style.transform = `translate3d(${p.targetX}px, ${p.targetY}px, 0)`;
      }

      // Outer ring has subtle 100ms smoothing (lerp factor 0.24)
      p.ringX += (p.targetX - p.ringX) * 0.24;
      p.ringY += (p.targetY - p.ringY) * 0.24;

      if (ringWrapperRef.current) {
        ringWrapperRef.current.style.transform = `translate3d(${p.ringX}px, ${p.ringY}px, 0)`;
      }

      rafId.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('mouseup', handleMouseUp, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    document.addEventListener('mouseenter', handleMouseEnter, { passive: true });

    rafId.current = requestAnimationFrame(animate);

    return () => {
      document.documentElement.classList.remove('has-custom-cursor');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="custom-cursor-root fixed inset-0 pointer-events-none z-[99999] overflow-hidden opacity-0 transition-opacity duration-150 ease-out"
    >
      {/* Outer Subtle Ring (26px diameter, centered at -13px) */}
      <div
        ref={ringWrapperRef}
        className="fixed top-0 left-0 pointer-events-none will-change-transform"
      >
        <div
          ref={ringElementRef}
          className="w-[26px] h-[26px] -ml-[13px] -mt-[13px] rounded-full border border-midnight/25 bg-moonstone/[0.02] pointer-events-none transition-[transform,border-color,background-color] duration-150 ease-out"
        />
      </div>

      {/* Center Precision Dot (6px diameter, centered at -3px) */}
      <div
        ref={dotWrapperRef}
        className="fixed top-0 left-0 pointer-events-none will-change-transform"
      >
        <div
          className="w-[6px] h-[6px] -ml-[3px] -mt-[3px] rounded-full bg-midnight pointer-events-none"
        />
      </div>
    </div>
  );
};

export default CustomCursor;
