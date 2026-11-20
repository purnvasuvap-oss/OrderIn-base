import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_RATIO } from "./useBookSize";
import "./publicMenu.css";

// react-pageflip requires each direct child to forward a ref to its root
// DOM node — this is that wrapper, shared by every page in PublicMenu.jsx.
export const BookPage = forwardRef(function BookPage({ children, className = "" }, ref) {
  return (
    <div className={`book-page ${className}`} ref={ref}>
      {children}
    </div>
  );
});

// The engine decides single-page vs two-page spread by `stageWidth < 2 * minWidth`.
// Pages are never wider than 500px (useBookSize), so 260 guarantees single page.
// The inline min-width the engine puts on its root is neutralised in CSS.
const BOOK_MIN_WIDTH = 260;

// page-flip's renderer runs a requestAnimationFrame loop that restyles EVERY page
// on EVERY frame, even when nothing moves, and it has no way to stop it — so each
// remount (rotation, resize) leaked another permanent loop. This:
//  1. skips frames while the book is idle (only draws during a flip/drag and for
//     a few frames after anything changes), and
//  2. returns a kill switch that stops the loop and removes the engine's window
//     listeners when the book is unmounted.
function tameFlipEngine(flip) {
  const render = flip?.getRender?.();
  if (!render || typeof render.render !== "function") return () => {};

  if (!render.__omTamed) {
    render.__omTamed = true;
    const draw = render.render.bind(render);
    let dirty = 4;
    let last = [];
    ["update", "reload"].forEach((fn) => {
      if (typeof render[fn] !== "function") return;
      const original = render[fn].bind(render);
      render[fn] = (...args) => {
        dirty = 4;
        return original(...args);
      };
    });
    render.render = (timer) => {
      if (render.__omStopped) return;
      const busy = render.animation != null || render.flippingPage != null;
      const current = [render.leftPage, render.rightPage, render.bottomPage];
      if (busy || current.some((p, i) => p !== last[i])) dirty = 4;
      if (dirty <= 0) {
        render.timer = timer; // animations read their start time from this
        return;
      }
      dirty -= 1;
      last = current;
      draw(timer);
    };
  }

  return () => {
    render.__omStopped = true;
    try {
      flip.getUI?.()?.removeHandlers?.();
    } catch (e) {
      /* engine already torn down */
    }
  };
}

// Target duration of one page turn, identical on every screen size.
const FLIP_MS = 650;

// The engine derives a flip's duration from the distance in pixels the page
// travels ((pixels / 1000) * flippingTime), so small phones flipped much faster
// than tablets. A turn travels about two page-widths, so scale flippingTime to
// make every device take FLIP_MS. (`settings` is the engine's live object.)
function setFlipTiming(flip, pageWidth) {
  const settings = flip?.getSettings?.();
  if (!settings) return;
  const travel = Math.max(1, Math.min(1000, pageWidth * 2));
  settings.flippingTime = Math.round((FLIP_MS * 1000) / travel);
}

// Backward turn, drawn as an exact reverse of a forward turn.
//
// In single-page mode the library animates "previous" as a page arriving from
// an imaginary left-hand page that is off-screen on phones: ~400ms of nothing,
// then the current page blanks out and the old page swings in from outside the
// screen. Instead: switch to the previous page instantly, start a FORWARD flip
// of it posed fully turned away (so the screen still shows the current page —
// no visible change), then animate it sweeping back in from the left edge to
// lying flat. Uses the flip controller's internals (names verified in the
// page-flip 2.0.x dist build); returns false so the caller can fall back to the
// stock flipPrev() if anything is missing.
function flipBackward(flip) {
  const ctrl = flip?.getFlipController?.();
  const render = flip?.getRender?.();
  if (!ctrl || !render || typeof ctrl.start !== "function" || typeof ctrl.animateFlippingTo !== "function") {
    return false;
  }
  if (flip.getCurrentPageIndex() <= 0) return true; // nothing before the cover

  if (ctrl.calc != null) render.finishAnimation(); // complete a turn already running

  flip.turnToPrevPage();
  const rect = render.getRect();
  // Same synthetic grab point the library uses for flipNext("bottom").
  if (!ctrl.start({ x: rect.left + rect.pageWidth * 2 - 10, y: rect.height - 2 })) return true;

  ctrl.setState?.("flipping");
  // Reverse of the library's own forward path (it runs from a small fold at the
  // corner to fully turned). A path exactly along the bottom edge is degenerate
  // (no fold angle) and the library silently draws nothing, so stay just inside.
  const m = rect.height / 10;
  const turnedAway = { x: -rect.pageWidth + 2, y: rect.height - 2 };
  const nearlyFlat = { x: rect.pageWidth - m / 3, y: rect.height - m / 3 };
  ctrl.do(turnedAway); // pose before the next frame paints -> no flicker
  ctrl.animateFlippingTo(turnedAway, nearlyFlat, false); // ends flat; resets to "read"
  return true;
}

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
};

// Thin wrapper around react-pageflip's HTMLFlipBook: prev/next controls, page
// indicator, arrow keys and swipe. `size` comes from useBookSize().
function BookLayout({ pages, size }) {
  const bookRef = useRef(null);
  const stageRef = useRef(null);
  const totalPages = pages.length;
  const mode = size?.mode || "tall";
  const width = size?.width || 320;
  const height = size?.height || Math.round(width / PAGE_RATIO[mode]);

  const [currentPage, setCurrentPage] = useState(0);
  // Mirrors currentPage synchronously (used to keep the reader in place on a rebuild).
  const currentPageRef = useRef(0);
  const prevTotalRef = useRef(totalPages);
  const preloadedRef = useRef(new Set());
  const widthRef = useRef(width);
  widthRef.current = width;

  // The engine can't change page ratio or page count in place, so it is rebuilt
  // only when those change (layout mode / pagination) — plain size changes are
  // applied in place below without a rebuild.
  const bookKey = `${mode}-${totalPages}`;

  // Keep the reader roughly where they were when the book is rebuilt.
  const startPage = useMemo(() => {
    const prevTotal = prevTotalRef.current;
    let start = currentPageRef.current;
    if (prevTotal !== totalPages && prevTotal > 1) {
      start = Math.round((start / (prevTotal - 1)) * Math.max(totalPages - 1, 0));
    }
    start = Math.min(Math.max(start, 0), Math.max(totalPages - 1, 0));
    prevTotalRef.current = totalPages;
    currentPageRef.current = start;
    return start;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey]);

  useEffect(() => {
    setCurrentPage(startPage);
  }, [startPage]);

  // Tame the engine once it exists; kill it only when its root node has really
  // left the page (rebuild or unmount) — StrictMode's dev-only effect re-run
  // keeps the same DOM, so the engine survives that.
  // react-pageflip creates the engine one render after mount, so wait for it.
  useEffect(() => {
    const bookRoot = stageRef.current?.firstElementChild;
    let kill = null;
    let frame = null;
    let tries = 0;
    const attach = () => {
      const flip = bookRef.current?.pageFlip?.();
      if (flip?.getRender?.()) {
        kill = tameFlipEngine(flip);
        setFlipTiming(flip, widthRef.current);
      } else if (tries++ < 120) {
        frame = requestAnimationFrame(attach);
      }
    };
    attach();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      setTimeout(() => {
        if (kill && (!bookRoot || !bookRoot.isConnected)) kill();
      }, 0);
    };
  }, [bookKey]);

  // Same layout, new dimensions (e.g. URL bar collapsed, window resized):
  // re-measure in place, keeping the current page.
  useLayoutEffect(() => {
    try {
      const flip = bookRef.current?.pageFlip?.();
      if (flip) {
        setFlipTiming(flip, width);
        flip.update();
      }
    } catch (e) {
      /* engine not ready yet */
    }
  }, [width, height]);

  const handleFlip = useCallback(
    (e) => {
      const clamped = Math.min(Math.max(e.data, 0), Math.max(totalPages - 1, 0));
      currentPageRef.current = clamped;
      setCurrentPage(clamped);
    },
    [totalPages]
  );

  // All page turns (buttons, keys, swipes) go through here. The engine itself
  // rejects turns past the first/last page, and a tap during a running flip
  // finishes that flip first, so rapid taps never skip or overshoot.
  const turn = useCallback((direction) => {
    const flip = bookRef.current?.pageFlip?.();
    if (!flip) return;
    try {
      if (prefersReducedMotion()) {
        if (direction > 0) flip.turnToNextPage();
        else flip.turnToPrevPage();
        return;
      }
      // The library's flipPrev() is implemented as a synthetic click 10px from
      // the left edge, which `disableFlipByClick` (needed so taps on dishes
      // don't flip) silently swallows in single-page mode. Lift it just for
      // this programmatic turn.
      const settings = flip.getSettings();
      const was = settings.disableFlipByClick;
      settings.disableFlipByClick = false;
      try {
        if (direction > 0) flip.flipNext("bottom");
        else if (!flipBackward(flip)) flip.flipPrev("bottom");
      } finally {
        settings.disableFlipByClick = was;
      }
    } catch (e) {
      /* engine mid-rebuild */
    }
  }, []);

  // Preload the photos of the neighbouring pages while the book is idle.
  // Hidden pages are display:none, so their lazy photos would only start
  // downloading when a turn reveals them (empty photo slots mid-flip, worse on
  // slow networks). Fetch + decode them into the browser cache ahead of time
  // without touching the page elements, which the flip engine owns.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let cancelled = false;
    const preload = () => {
      if (cancelled) return;
      const all = stage.querySelectorAll(".book-page");
      [currentPage + 1, currentPage - 1, currentPage + 2].forEach((idx) => {
        all[idx]?.querySelectorAll("img").forEach((img) => {
          const src = img.currentSrc || img.getAttribute("src");
          if (!src || src.startsWith("data:") || preloadedRef.current.has(src)) return;
          preloadedRef.current.add(src);
          const pre = new Image();
          pre.decoding = "async";
          pre.src = src;
          pre.decode?.().catch(() => {});
        });
      });
    };
    // After the turn animation has settled, when the browser is idle.
    const t = setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(preload, { timeout: 800 });
      else preload();
    }, FLIP_MS + 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [currentPage, bookKey]);

  const goNext = useCallback(() => turn(1), [turn]);
  const goPrev = useCallback(() => turn(-1), [turn]);

  // Swipe to turn — our own pointer handling (touch, pen and mouse) instead of
  // the engine's, which ignored swipes starting on a button, needed a 250ms
  // hold before dragging, and put a non-passive touchmove listener on the
  // whole window. Vertical drags are left to the browser (touch-action: pan-y),
  // and a swipe never also "taps" the dish it started on.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let g = null;
    let swallowClickUntil = 0;

    const onDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), horizontal: null };
    };
    const onMove = (e) => {
      if (!g || e.pointerId !== g.id || g.horizontal !== null) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    };
    const onUp = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      const dt = Math.max(1, performance.now() - g.t);
      const horizontal = g.horizontal ?? Math.abs(dx) > Math.abs(dy) * 1.2;
      g = null;
      const far = Math.abs(dx) > Math.max(40, stage.clientWidth * 0.18);
      const flick = Math.abs(dx) > 24 && Math.abs(dx) / dt > 0.35;
      if (horizontal && (far || flick)) {
        swallowClickUntil = performance.now() + 400;
        turn(dx < 0 ? 1 : -1);
      }
    };
    const onCancel = () => {
      g = null;
    };
    const onClickCapture = (e) => {
      if (performance.now() < swallowClickUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onDragStart = (e) => e.preventDefault(); // Firefox image drag kills pointer events

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onCancel);
    stage.addEventListener("click", onClickCapture, true);
    stage.addEventListener("dragstart", onDragStart);
    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onCancel);
      stage.removeEventListener("click", onClickCapture, true);
      stage.removeEventListener("dragstart", onDragStart);
    };
  }, [turn]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  const ratio = PAGE_RATIO[mode];

  return (
    <div className={`book-layout book-layout--${mode}`}>
      <button
        type="button"
        className="book-nav-btn book-nav-prev"
        onClick={goPrev}
        disabled={currentPage <= 0}
        aria-label="Previous page"
      >
        <ChevronLeft size={20} />
      </button>

      <div className="book-stage" ref={stageRef} style={{ width: `${width}px`, height: `${height}px` }}>
        <HTMLFlipBook
          key={bookKey}
          width={Math.round(600 * ratio)}
          height={600}
          size="stretch"
          minWidth={BOOK_MIN_WIDTH}
          maxWidth={1000}
          minHeight={100}
          maxHeight={2000}
          startPage={startPage}
          usePortrait
          showCover
          drawShadow
          // The engine only animates; turning is driven by our buttons, arrow
          // keys and swipe handling (see `turn` and the swipe effect above).
          useMouseEvents={false}
          disableFlipByClick
          showPageCorners={false}
          flippingTime={FLIP_MS}
          maxShadowOpacity={0.35}
          className="book-flip"
          style={{}}
          ref={bookRef}
          onFlip={handleFlip}
        >
          {pages}
        </HTMLFlipBook>
      </div>

      <button
        type="button"
        className="book-nav-btn book-nav-next"
        onClick={goNext}
        disabled={currentPage >= totalPages - 1}
        aria-label="Next page"
      >
        <ChevronRight size={20} />
      </button>

      <span className="book-page-indicator" aria-live="polite">
        {totalPages > 0 ? `${currentPage + 1} / ${totalPages}` : ""}
      </span>
    </div>
  );
}

export default BookLayout;
