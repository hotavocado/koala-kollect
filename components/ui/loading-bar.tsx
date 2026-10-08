"use client";

/* eslint-disable react-hooks/set-state-in-effect -- copied unchanged from direct-hire;
   the effect drives a timed animation off the isLoading prop. */
import { useEffect, useRef, useState } from "react";

// Aurora colors from reference image
// Green band:   #39ff7a, #00e87a, #20ffa0
// Magenta band: #c040b8, #e050ff, #ff45cc
// Teal bridge:  #00d4c8

// Bump version suffix to force style refresh when keyframes change
const STYLE_ID = "aurora-loading-bar-styles-v15";

function injectStyles() {
  // Remove any older version
  document.querySelectorAll("[id^='aurora-loading-bar-styles']").forEach((el) => {
    if (el.id !== STYLE_ID) el.remove();
  });
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes aurora-gradient-border {
      0%   { opacity: 0.38; filter: blur(12px) hue-rotate(0deg);   }
      40%  { opacity: 0.43; filter: blur(12px) hue-rotate(20deg);  }
      70%  { opacity: 0.39; filter: blur(12px) hue-rotate(-15deg); }
      100% { opacity: 0.38; filter: blur(12px) hue-rotate(0deg);   }
    }
    @keyframes head-pulse {
      0%, 100% { transform: scale(1);   opacity: 1; }
      50%       { transform: scale(1.4); opacity: 0.75; }
    }
    @keyframes particle-rise {
      0%   { transform: translateY(0)     translateX(var(--dx)) scale(1);   opacity: 1; }
      100% { transform: translateY(-12px) translateX(var(--dx)) scale(0.2); opacity: 0; }
    }
    /* Full-width pulsing aurora line — no progress, just "alive and working".
       The line breathes (opacity) while its gradient drifts sideways so the
       colors travel rather than sit static. Used by the cooking banner where
       cooks run in parallel and there's no meaningful fill fraction. */
    @keyframes aurora-line-breathe {
      0%, 100% { opacity: 0.55; }
      50%       { opacity: 1;    }
    }
    @keyframes aurora-line-drift {
      0%   { background-position:   0% 50%; }
      100% { background-position: 200% 50%; }
    }
  `;
  document.head.appendChild(style);
}

// ── Loading Bar ────────────────────────────────────────────────────────────────

interface LoadingBarProps {
  isLoading: boolean;
  onComplete?: () => void;
}

type Phase = "idle" | "crawl" | "finish" | "fadeout";

export function LoadingBar({ isLoading, onComplete }: LoadingBarProps) {
  const [width, setWidth] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { injectStyles(); }, []);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => { const t = setTimeout(fn, ms); timers.current.push(t); };

  useEffect(() => {
    if (isLoading) {
      clear();
      setOpacity(1);
      setPhase("crawl");
      setWidth(52);
      after(350,  () => setWidth(68));
      after(1100, () => setWidth(82));
      after(2600, () => setWidth(94));
    } else if (phase === "crawl") {
      clear();
      setPhase("finish");
      setWidth(100);
      after(180, () => {
        setPhase("fadeout");
        setOpacity(0);
        after(300, () => { setPhase("idle"); setWidth(0); setOpacity(1); onComplete?.(); });
      });
    }
    return clear;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  if (phase === "idle") return null;

  const easing =
    phase === "finish"  ? "width 0.16s cubic-bezier(0.22, 1, 0.36, 1)" :
    phase === "fadeout" ? "opacity 0.3s ease" :
                          "width 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

  // Bar is 4px tall. Head is 12px. To center: top = -(12-4)/2 = -4px
  const HEAD_SIZE = 12;
  const BAR_HEIGHT = 4;
  const headOffset = -((HEAD_SIZE - BAR_HEIGHT) / 2);

  return (
    <div style={{ position: "relative", width: "100%", height: BAR_HEIGHT, overflow: "visible" }}>
      {/* Track */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(90deg, rgba(192,64,184,0.06) 0%, rgba(0,232,122,0.06) 100%)",
        borderRadius: 2,
      }} />

      {/* Glow layer — same gradient as fill, blurred, sits behind */}
      <div style={{
        position: "absolute", top: -2, left: 0, bottom: -2,
        width: `${width}%`,
        opacity: opacity * 0.75,
        transition: easing,
        background: "linear-gradient(90deg, #c040b8 0%, #00d4c8 50%, #00e87a 100%)",
        filter: "blur(5px)",
        borderRadius: "0 4px 4px 0",
        pointerEvents: "none",
      }} />

      {/* Fill */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: `${width}%`,
        opacity,
        transition: easing,
        background: "linear-gradient(90deg, #c040b8 0%, #00d4c8 50%, #00e87a 100%)",
        borderRadius: "0 2px 2px 0",
      }}>
        {/* Head dot — centered on the bar */}
        {phase === "crawl" && (
          <div style={{
            position: "absolute",
            right: -(HEAD_SIZE / 2),
            top: headOffset,
            width: HEAD_SIZE,
            height: HEAD_SIZE,
            borderRadius: "50%",
            background: "radial-gradient(circle, #ffffff 0%, #b0fff0 20%, #00e87a 55%, rgba(0,232,122,0.15) 100%)",
            boxShadow: "0 0 14px 6px rgba(0,255,160,0.90), 0 0 6px 2px rgba(255,255,255,0.70), 0 0 28px 10px rgba(0,232,122,0.45)",
            animation: "head-pulse 1s ease-in-out infinite",
            zIndex: 2,
          }} />
        )}

        {/* Particles — float upward from head */}
        {phase === "crawl" && [
          { dx: "-5px", delay: "0s",    size: 3, color: "#00ff99" },
          { dx: "4px",  delay: "0.35s", size: 2, color: "#80ffcc" },
          { dx: "-2px", delay: "0.65s", size: 2, color: "#00e87a" },
          { dx: "6px",  delay: "0.9s",  size: 2, color: "#b0fff0" },
        ].map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              right: 4,
              top: headOffset + (HEAD_SIZE / 2) - (p.size / 2),
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: p.color,
              boxShadow: `0 0 4px 2px ${p.color}88`,
              "--dx": p.dx,
              animation: `particle-rise 1s ease-out ${p.delay} infinite`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

// ── Aurora Card wrapper ────────────────────────────────────────────────────────

interface AuroraCardProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AuroraCard({ active, children, className }: AuroraCardProps) {
  useEffect(() => { injectStyles(); }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* Blurred gradient ring — oversized so glow bleeds well outside card */}
      {active && (
        <div style={{
          position: "absolute",
          inset: -12,
          borderRadius: 40,
          zIndex: 0,
          pointerEvents: "none",
          background: "linear-gradient(135deg, #9900ff 0%, #00ff88 100%)",
          filter: "blur(12px) hue-rotate(0deg)",
          opacity: 0.38,
          animation: "aurora-gradient-border 8s ease-in-out infinite",
        }} />
      )}

      <div className={className} style={{ position: "relative", zIndex: 1, border: active ? "none" : undefined }}>
        {children}
      </div>
    </div>
  );
}

// ── Pulsing Aurora Line ──────────────────────────────────────────────────────
// A full-width aurora line that pulses without showing progress. For flows that
// run in PARALLEL where a fill fraction is meaningless (e.g. cooking N emails at
// once) — the line just signals "working", and the surrounding copy carries the
// real count. Breathes (opacity) + drifts (gradient travels sideways) so it
// reads as live, not stalled. A soft blurred glow sits behind, same as the
// LoadingBar's glow layer.

export function PulsingAuroraLine({ active = true }: { active?: boolean }) {
  useEffect(() => { injectStyles(); }, []);
  if (!active) return null;

  const BAR_HEIGHT = 4;
  // Repeating gradient so the colors loop seamlessly as the position drifts.
  // NOTE: use backgroundImage (NOT the `background` shorthand) — the shorthand
  // resets background-size to auto, which kills the drift animation (position
  // has nothing oversized to travel across, so the gradient sits static).
  //
  // backgroundSize 300%: the gradient is 3× the bar width, so at any moment you
  // see less than half a cycle — one soft magenta→teal→green sweep, NOT a
  // repeating rainbow. (A fixed-px tile made it tile ~5× across a wide bar and
  // read as "going crazy" — reverted. The hat no longer tracks the bar, so the
  // bar doesn't need a deterministic px→color mapping.)
  const gradient =
    "linear-gradient(90deg, #c040b8 0%, #00d4c8 25%, #00e87a 50%, #00d4c8 75%, #c040b8 100%)";
  const drift = "aurora-line-breathe 1.8s ease-in-out infinite, aurora-line-drift 2.4s linear infinite";

  return (
    <div style={{ position: "relative", width: "100%", height: BAR_HEIGHT, overflow: "visible" }}>
      {/* Glow — blurred, behind. Inset L/R so the blur halo doesn't bleed past
          the bar's left/right edges (that's what wedged a green triangle out the
          banner's top-left corner). It still bleeds down into the page below. */}
      <div style={{
        position: "absolute", top: -1, left: 6, right: 6, bottom: -1,
        backgroundImage: gradient,
        backgroundSize: "300% 100%",
        filter: "blur(4px)",
        borderRadius: 4,
        pointerEvents: "none",
        animation: drift,
        opacity: 0.45,
      }} />
      {/* Line */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: gradient,
        backgroundSize: "300% 100%",
        borderRadius: 2,
        animation: drift,
      }} />
    </div>
  );
}

// ── Aurora Progress Line ─────────────────────────────────────────────────────
// The same aurora visual as PulsingAuroraLine, but the fill WIDTH is data.
//
// ⭐ WHY A SIBLING AND NOT A PROP ON THE ONE ABOVE. PulsingAuroraLine takes a
// BOOLEAN and is correct that way: it exists for flows that run in PARALLEL,
// where a fraction is meaningless (cooking N emails at once has no ordering to
// be "40% through"). Acquisition is the opposite shape — a sequence of chunks
// against a denominator the user chose — so it gets a real fraction. Two shapes,
// two components, one visual language. Folding both into one component behind a
// mode flag is how a component with two modes drifts, and only the mode the
// nearest test exercises stays right.
//
// ⛔ NOT `LoadingBar` (this file, top). That one is a FAKE time-based crawl with
// hardcoded 52/68/82/94% stops and no data input at all. It is not a progress
// bar, it is an animation that looks like one, and extending it would put a
// second fabricated number on screen next to a real one.
//
// `value` and `max` are clamped here rather than at every call site: a caller
// reading a live backend row can legitimately hold a value above max for one
// render (a chunk over-delivers, then the terminal write reconciles), and a bar
// that renders 110% wide is a rendering bug reported as a data bug.

export function AuroraProgressLine({ value, max }: { value: number; max: number }) {
  useEffect(() => { injectStyles(); }, []);

  const BAR_HEIGHT = 4;
  const safeMax = max > 0 ? max : 1;
  const fraction = Math.min(1, Math.max(0, value / safeMax));
  const pct = `${fraction * 100}%`;

  // Same gradient as the pulsing line so the two read as one family. It is sized
  // to the TRACK and not to the fill (backgroundSize 100% of the outer width via
  // a nested absolutely-positioned layer), so the colour at a given x stays put
  // as the fill grows — a gradient scaled to the fill would re-paint the whole
  // bar on every tick and read as flicker rather than growth.
  const gradient =
    "linear-gradient(90deg, #c040b8 0%, #00d4c8 25%, #00e87a 50%, #00d4c8 75%, #c040b8 100%)";

  return (
    <div
      style={{ position: "relative", width: "100%", height: BAR_HEIGHT, overflow: "visible" }}
      role="progressbar"
      aria-valuenow={Math.round(fraction * safeMax)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
    >
      {/* Track — the unfilled remainder, so the bar has a visible length even at
          zero and the fill reads as travelling along something. */}
      <div style={{
        position: "absolute", inset: 0,
        background: "var(--secondary)",
        borderRadius: 2,
        opacity: 0.6,
      }} />

      {/* Glow — clipped to the fill so the halo grows with it. */}
      <div style={{
        position: "absolute", top: -1, left: 0, bottom: -1,
        width: pct,
        overflow: "hidden",
        pointerEvents: "none",
        transition: "width 400ms ease-out",
      }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: `${100 / (fraction || 1)}%`,
          backgroundImage: gradient,
          filter: "blur(4px)",
          borderRadius: 4,
          opacity: 0.45,
        }} />
      </div>

      {/* Fill */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0,
        width: pct,
        overflow: "hidden",
        borderRadius: 2,
        transition: "width 400ms ease-out",
      }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: `${100 / (fraction || 1)}%`,
          backgroundImage: gradient,
          borderRadius: 2,
        }} />
      </div>
    </div>
  );
}
