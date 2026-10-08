import { useEffect, useRef } from 'react';

/**
 * HeroCanvas — the living backdrop behind the home overlay: a drifting cyan/violet nebula, a sparse
 * parallax starfield, and — the product metaphor made visible — a gentle NETWORK of luminous nodes
 * ("workstations") joined by faint cyan pathways, with a few pulses travelling between them (you +
 * your agents moving across computers). Lazy-loaded (see App.tsx) so it never bloats the main bundle
 * and never blocks LCP.
 *
 * Design constraints (house `nebula-waiting-experience` doctrine):
 *  - Pauses when the tab is hidden (document.hidden).
 *  - Fully degrades to the static CSS gradient (.ds-nebula-fallback) when 2D canvas is unavailable OR
 *    the user prefers reduced motion — it renders nothing and the parent's gradient shows.
 *  - 2D canvas, zero deps, adaptive density, requestAnimationFrame. Subtle by design: it sits behind
 *    a dim scrim + the foreground copy, so opacities stay low and it never competes with the text.
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
    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      pulse: number;
    }
    interface Pulse {
      from: number; // node index
      to: number; // node index
      t: number; // 0..1 along the edge
      speed: number;
    }

    let stars: Star[] = [];
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let linkDist = 220;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const nearestNeighbor = (i: number, exclude: number): number => {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < nodes.length; j++) {
        if (j === i || j === exclude) continue;
        const dx = nodes[j]!.x - nodes[i]!.x;
        const dy = nodes[j]!.y - nodes[i]!.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best === -1 ? i : best;
    };

    const seed = () => {
      const area = width * height;
      // Sparse starfield (dialed back so the network reads as the focus).
      const starCount = Math.min(140, Math.max(40, Math.round(area / 22000)));
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        hue: 185 + Math.random() * 80,
        twinkle: Math.random() * Math.PI * 2,
      }));

      // Workstation nodes — a handful, scaling gently with area, capped so it stays elegant.
      const nodeCount = Math.min(16, Math.max(7, Math.round(area / 90000)));
      linkDist = Math.max(160, Math.min(width, height) * 0.28);
      nodes = Array.from({ length: nodeCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: rand(-0.14, 0.14),
        vy: rand(-0.14, 0.14),
        r: rand(1.6, 3.2),
        pulse: Math.random() * Math.PI * 2,
      }));

      // A few travelling pulses between neighbouring nodes.
      const pulseCount = Math.min(4, Math.max(2, Math.round(nodeCount / 4)));
      pulses = Array.from({ length: pulseCount }, () => {
        const from = Math.floor(Math.random() * nodes.length);
        return { from, to: nearestNeighbor(from, -1), t: Math.random(), speed: rand(0.0016, 0.0036) };
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
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

      // Parallax twinkling stars (background depth).
      for (const s of stars) {
        s.twinkle += 0.02 + s.z * 0.03;
        s.x -= 0.06 + s.z * 0.2;
        if (s.x < 0) s.x = width;
        const size = 0.4 + s.z * 1.4;
        const alpha = 0.2 + (Math.sin(s.twinkle) * 0.5 + 0.5) * (0.3 + s.z * 0.35);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 100%, ${65 + s.z * 15}%, ${alpha})`;
        ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Move nodes (gentle drift, bounce off edges).
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += 0.03;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.x = Math.max(0, Math.min(width, n.x));
        n.y = Math.max(0, Math.min(height, n.y));
      }

      // Pathways between nearby nodes (opacity fades with distance).
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist > linkDist) continue;
          const alpha = (1 - dist / linkDist) * 0.16;
          ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Travelling pulses (you + your agents moving across computers).
      for (const p of pulses) {
        const a = nodes[p.from];
        const b = nodes[p.to];
        if (!a || !b) continue;
        p.t += p.speed;
        if (p.t >= 1) {
          // Arrived: hop onward to a new neighbour of the node we reached.
          p.from = p.to;
          p.to = nearestNeighbor(p.from, p.from);
          p.t = 0;
        }
        const px = a.x + (b.x - a.x) * p.t;
        const py = a.y + (b.y - a.y) * p.t;
        const halo = ctx.createRadialGradient(px, py, 0, px, py, 6);
        halo.addColorStop(0, 'rgba(0, 229, 255, 0.9)');
        halo.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nodes themselves (a bright core + a soft glow halo, gently breathing).
      for (const n of nodes) {
        const breathe = 0.6 + 0.4 * (Math.sin(n.pulse) * 0.5 + 0.5);
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
        glow.addColorStop(0, `rgba(0, 229, 255, ${0.22 * breathe})`);
        glow.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(210, 250, 255, ${0.7 * breathe})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
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
