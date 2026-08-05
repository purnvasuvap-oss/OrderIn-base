import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./publicMenu.css";

// react-pageflip requires each direct child to forward a ref to its root
export const BookPage = forwardRef(function BookPage({ children, className = "" }, ref) {
  return (
    <div className={`book-page ${className}`} ref={ref}>
      {children}
    </div>
  );
});

// react-pageflip's PageFlip engine is constructed
function getBookBounds() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isLandscape = vw > vh;

  if (isLandscape) {
    // Width is plentiful, height is the scarce dimension — reserve room for the header and footer, but don't let the book shrink below 240px or grow above 560px.
    const maxHeight = Math.max(240, Math.min(560, vh - 96));
    return {
      orientation: "landscape",
      minWidth: 260,
      maxWidth: Math.max(320, Math.min(620, vw - 48)),
      minHeight: Math.min(260, maxHeight),
      maxHeight,
    };
  }

  return {
    orientation: "portrait",
    minWidth: 280,
    maxWidth: Math.min(520, vw - 32),
    minHeight: Math.min(480, Math.max(320, vh - 140)),
    maxHeight: 860,
  };
}

// Thin wrapper around react-pageflip's HTMLFlipBook: prev/next controls, page indicator, and keyboard navigation.
function BookLayout({ pages }) {
  const bookRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = pages.length;
  const [bounds, setBounds] = useState(getBookBounds);
  // Mirrors `currentPage` synchronously (state updates are async and lag
  const currentPageRef = useRef(0);
  useEffect(() => {
    setCurrentPage(0);
    currentPageRef.current = 0;
  }, [totalPages]);

  useEffect(() => {
    let frame = null;
    const handleResize = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = getBookBounds();
        // Only remount (via the key below) on an actual orientation flip to avoid unnecessary remounts on every resize event.
        setBounds((prev) => (prev.orientation === next.orientation ? prev : next));
      });
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const handleFlip = useCallback(
    (e) => {
      const clamped = Math.min(Math.max(e.data, 0), Math.max(totalPages - 1, 0));
      currentPageRef.current = clamped;
      setCurrentPage(clamped);
    },
    [totalPages]
  );

  const goNext = useCallback(() => {
    if (currentPageRef.current >= totalPages - 1) return;
    currentPageRef.current += 1;
    bookRef.current?.pageFlip()?.flipNext();
  }, [totalPages]);

  const goPrev = useCallback(() => {
    if (currentPageRef.current <= 0) return;
    currentPageRef.current -= 1;
    bookRef.current?.pageFlip()?.flipPrev();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  return (
    <div className="book-layout">
      <HTMLFlipBook
        key={`${pages.length}-${bounds.orientation}`}
        width={360}
        height={640}
        size="stretch"
        minWidth={bounds.minWidth}
        maxWidth={bounds.maxWidth}
        minHeight={bounds.minHeight}
        maxHeight={bounds.maxHeight}
        usePortrait
        showCover
        mobileScrollSupport
        drawShadow
        flippingTime={700}
        maxShadowOpacity={0.5}
        className="book-flip"
        style={{}}
        ref={bookRef}
        onFlip={handleFlip}
      >
        {pages}
      </HTMLFlipBook>

      <div className="book-controls" role="group" aria-label="Menu book navigation">
        <button
          type="button"
          className="book-nav-btn"
          onClick={goPrev}
          disabled={currentPage <= 0}
          aria-label="Previous page"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="book-page-indicator" aria-live="polite">
          {totalPages > 0 ? `${currentPage + 1} / ${totalPages}` : ""}
        </span>
        <button
          type="button"
          className="book-nav-btn"
          onClick={goNext}
          disabled={currentPage >= totalPages - 1}
          aria-label="Next page"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

export default BookLayout;
