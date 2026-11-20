import { useEffect, useState } from "react";

// Measures the viewport and decides how big ONE book page should be so the
// whole book (page + nav controls) always fits on screen, centred, with no
// clipping and no scrolling inside the page.
//
// Two layouts:
//  - "tall"  (phones, tablets, desktops): page ratio 3:5, controls under the book.
//  - "wide"  (short landscape screens, e.g. a phone held sideways): page ratio
//            4:5, controls on either side so the page can use the full height.
//
// The book is always a single page (never a two-page spread) — a spread puts
// the cover alone on the right half of the screen, which looks off-centre.

const OUTER_PAD = 16; // .public-menu-root padding (each side)
const CONTROLS_H = 44 + 12; // nav button height + gap (tall layout)
const SIDE_CONTROLS_W = 2 * (44 + 12); // nav buttons + gaps (wide layout)
const MAX_PAGE_W = 500; // must stay < 2 * BOOK_MIN_WIDTH (see BookLayout)
const WIDE_MAX_H = 520; // landscape screens shorter than this use "wide"

// Vertical budget of a category page (see .pm-page / .pm-menu-card CSS):
// page padding (2 * 22) + title (~44) ; each card 106px + 12px gap.
const CATEGORY_CHROME_H = 88;
const CARD_SLOT_H = 118;
const CARD_GAP = 12;

export const PAGE_RATIO = { tall: 3 / 5, wide: 4 / 5 };

export function computeBookSize(vw, vh) {
  const mode = vw > vh && vh < WIDE_MAX_H ? "wide" : "tall";
  const ratio = PAGE_RATIO[mode];

  let maxW;
  let maxH;
  if (mode === "wide") {
    maxW = vw - OUTER_PAD * 2 - SIDE_CONTROLS_W;
    maxH = vh - OUTER_PAD * 2;
  } else {
    maxW = vw - OUTER_PAD * 2;
    maxH = vh - OUTER_PAD * 2 - CONTROLS_H;
  }

  const width = Math.max(200, Math.floor(Math.min(maxW, maxH * ratio, MAX_PAGE_W)));
  const height = Math.floor(width / ratio);
  const cardsPerPage = Math.min(
    6,
    Math.max(1, Math.floor((height - CATEGORY_CHROME_H + CARD_GAP) / CARD_SLOT_H))
  );

  return { mode, width, height, cardsPerPage };
}

const readViewport = () => {
  if (typeof window === "undefined") return computeBookSize(390, 844);
  // innerWidth/innerHeight (not visualViewport) so pinch-zoom doesn't resize the book.
  return computeBookSize(window.innerWidth, window.innerHeight);
};

const sameSize = (a, b) =>
  a.mode === b.mode && a.width === b.width && a.height === b.height && a.cardsPerPage === b.cardsPerPage;

export function useBookSize() {
  const [size, setSize] = useState(readViewport);

  useEffect(() => {
    let timer = null;
    const onResize = () => {
      clearTimeout(timer);
      // Debounced: mobile browsers fire many resize events while the URL bar
      // slides in/out; only settle on the final size.
      timer = setTimeout(() => {
        const next = readViewport();
        setSize((prev) => (sameSize(prev, next) ? prev : next));
      }, 120);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return size;
}
