import { useEffect, useRef, useState } from 'react';

/**
 * RollingMetric — Lightweight SSR-deterministic odometer number interpolator
 *
 * - Renders exact static formatted target value during SSR & initial hydration
 * - Smoothly eases value transitions via requestAnimationFrame on client updates
 * - Respects prefers-reduced-motion: reduce
 */
export function RollingMetric({
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  showPlusSign = false,
  durationMs = 280,
  formatFn = null,
  className = '',
  testId = undefined,
}) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [displayVal, setDisplayVal] = useState(target);
  const currentValRef = useRef(target);

  useEffect(() => {
    const startVal = currentValRef.current;
    if (startVal === target) return;

    const reducedMotion =
      typeof window === 'undefined' ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
      typeof window.requestAnimationFrame !== 'function';

    if (reducedMotion || durationMs <= 0) {
      currentValRef.current = target;
      const id =
        typeof window !== 'undefined' && typeof window.setTimeout === 'function'
          ? window.setTimeout(() => setDisplayVal(target), 0)
          : null;
      return () => {
        if (id !== null) window.clearTimeout(id);
      };
    }

    let rafId = null;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startVal + (target - startVal) * eased;
      currentValRef.current = nextVal;
      setDisplayVal(nextVal);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        currentValRef.current = target;
        setDisplayVal(target);
      }
    }

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [target, durationMs]);

  let formatted;
  if (typeof formatFn === 'function') {
    formatted = formatFn(displayVal);
  } else {
    const numStr = displayVal.toFixed(decimals);
    const sign = showPlusSign && displayVal > 0 ? '+' : '';
    formatted = `${prefix}${sign}${numStr}${suffix}`;
  }

  return (
    <span className={`lp-rolling-metric ${className}`} data-testid={testId}>
      {formatted}
    </span>
  );
}
