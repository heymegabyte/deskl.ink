import { useEffect, useRef } from 'react';

/**
 * HeroCanvas — a lightweight, GPU-friendly cyan/violet starfield behind the
 * home overlay. Lazy-loaded (see App.tsx) so it never bloats the main bundle.
 *
 * Design constraints (per house `nebula-waiting-experience` doctrine):
 *  - Pauses rendering when the tab is hidden (document.hidden).
 *  - Fully degrades to a static CSS gradient (.ds-nebula-fallback) when the
 *    2D canvas context is unavailable OR the user prefers reduced motion — in
 *    those cases this component renders nothing and the parent's gradient shows.
 *  - transform/opacity-only motion, adaptive particle count, requestAnimationFrame.
 *
 * Kept to the 2D canvas for the Milestone-1 seed: zero deps, broad support,
 * cheap. A raw-WebGL nebula can replace the draw loop later behind the same
 * mount contract.
 */
export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return; // Parent gradient fallback is the reduced-motion experience.
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // No 2D context → fall back to the CSS gradient.

    let width = 0;
    let height = 0;
    let dpr = 1;

    interface Star {
      x: number;
      y: number;
      z: number; // depth 0..1 drives size + parallax
      hue: number; // cyan→violet range
      twinkle: number;
    }

    let stars: Star[] = [];

    const seedStars = () => {
      // Adaptive density: fewer particles on small/low-DPR screens.
      const area = width * height;
      const count = Math.min(220, Math.max(60, Math.round(area / 14000)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        hue: 185 + Math.random() * 80, // ~cyan(185) to ~violet(265)
        twinkle: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
    };

    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.006;
      ctx.clearRect(0, 0, width, height);

      // Soft nebula wash (two drifting radial glows).
      const g1x = width * (0.3 + 0.08 * Math.sin(t * 0.6));
      const g1y = height * (0.25 + 0.06 * Math.cos(t * 0.5));
      const grad1 = ctx.createRadialGradient(g1x, g1y, 0, g1x, g1y, width * 0.5);
      grad1.addColorStop(0, 'rgba(0, 229, 255, 0.10)');
      grad1.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      const g2x = width * (0.74 - 0.08 * Math.cos(t * 0.4));
      const g2y = height * (0.76 - 0.05 * Math.sin(t * 0.55));
      const grad2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, width * 0.46);
      grad2.addColorStop(0, 'rgba(124, 58, 237, 0.12)');
      grad2.addColorStop(1, 'rgba(124, 58, 237, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Parallax twinkling stars.
      for (const s of stars) {
        s.twinkle += 0.02 + s.z * 0.03;
        s.x -= 0.08 + s.z * 0.25; // slow drift left
        if (s.x < 0) s.x = width;

        const size = 0.4 + s.z * 1.6;
        const alpha = 0.25 + (Math.sin(s.twinkle) * 0.5 + 0.5) * (0.35 + s.z * 0.4);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 100%, ${65 + s.z * 15}%, ${alpha})`;
        ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (!raf) raf = window.requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}

export default HeroCanvas;
