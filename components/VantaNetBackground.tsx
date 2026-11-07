"use client";

import { useEffect, useRef } from "react";

type VantaEffect = {
  destroy: () => void;
};

type PerformanceNavigator = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
  deviceMemory?: number;
};

type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
};

function shouldUseStaticFallback() {
  const performanceNavigator = navigator as PerformanceNavigator;
  const connection = performanceNavigator.connection;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smallScreen = window.matchMedia("(max-width: 650px)").matches;
  const constrainedMemory =
    typeof performanceNavigator.deviceMemory === "number" &&
    performanceNavigator.deviceMemory <= 4;
  const constrainedCpu =
    typeof performanceNavigator.hardwareConcurrency === "number" &&
    performanceNavigator.hardwareConcurrency <= 4;
  const constrainedConnection =
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g";

  return (
    reducedMotion ||
    smallScreen ||
    constrainedMemory ||
    constrainedCpu ||
    constrainedConnection
  );
}

export default function VantaNetBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<VantaEffect | null>(null);

  useEffect(() => {
    if (!containerRef.current || shouldUseStaticFallback()) return;

    const idleWindow = window as IdleWindow;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const initialise = async () => {
      if (cancelled || effectRef.current || !containerRef.current) return;

      try {
        const [threeModule, netModule] = await Promise.all([
          import("three"),
          import("vanta/dist/vanta.net.min"),
        ]);

        if (cancelled || effectRef.current || !containerRef.current) return;

        const createNet = netModule.default;
        const effect = createNet({
          el: containerRef.current,
          THREE: threeModule,
          backgroundColor: 0xfff9f1,
          color: 0xff7400,
          points: 8,
          maxDistance: 18,
          spacing: 18,
          showDots: true,
          mouseControls: true,
          touchControls: false,
          gyroControls: false,
          scale: 1,
          scaleMobile: 1,
        }) as VantaEffect | undefined;

        if (!effect) return;
        if (cancelled) {
          effect.destroy();
          return;
        }
        effectRef.current = effect;
      } catch {
        // The static cream hero remains the intentional fallback when WebGL fails.
      }
    };

    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(initialise, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(initialise, 180);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      effectRef.current?.destroy();
      effectRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="vanta-net-background" aria-hidden="true" />;
}
