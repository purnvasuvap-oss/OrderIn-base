import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./publicMenu.css";

// react-pageflip requires each direct child to forward a ref to its root
// DOM node (see react-pageflip's "Advanced Usage" docs) — this is that
// wrapper, shared by every page component in src/publicMenu/components/.
export const BookPage = forwardRef(function BookPage({ children, className = "" }, ref) {
  return (
    <div className={`book-page ${className}`} ref={ref}>
      {children}
    </div>
  );
});

// Thin wrapper around react-pageflip's HTMLFlipBook: prev/next controls,
// a page indicator, and arrow-key navigation. `pages` is an array of
// already-built <BookPage> elements (one per physical book page) — the
// pagination/derivation of *what* goes on each page lives in PublicMenu.jsx.
function BookLayout({ pages }) {
  const bookRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = pages.length;

  const handleFlip = useCallback((e) => {
    setCurrentPage(e.data);
  }, []);

  const goNext = useCallback(() => {
    bookRef.current?.pageFlip()?.flipNext();
  }, []);

  const goPrev = useCallback(() => {
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
        width={360}
        height={640}
        size="stretch"
        minWidth={280}
        maxWidth={520}
        minHeight={480}
        maxHeight={860}
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
