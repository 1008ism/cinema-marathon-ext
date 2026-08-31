/**
 * Host-page overlay helpers (District / BookMyShow movie rows).
 * Ticks stay in the white gutter via CinemaPanel; this module looks up
 * movie blocks so content.js can sync after scrape.
 */
(function (global) {
  function textOf(el) {
    return ((el && (el.innerText || el.textContent)) || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Movie card for a screening or DOM node.
   * District titles live in [class*='movieDetailsDivHeading'], not h1–h4.
   */
  function findMovieBlock(from) {
    const el = from && from.nodeType === 1 ? from : from && from.el;
    if (el && el.nodeType === 1 && el.closest) {
      const district = el.closest(
        "[class*='movieSessions'], [class*='cdpSessions']"
      );
      if (district) return district;
      const article = el.closest("article.movie, article");
      if (
        article &&
        article.querySelector("img, h2, h3, [class*='movieDetailsDivHeading']")
      ) {
        return article;
      }
      const bms = el.closest("#venuelist li, [class*='movie-details']");
      if (bms) return bms;
    }

    const title = ((from && from.title) || "").trim();
    if (!title) return null;
    const headings = document.querySelectorAll(
      "[class*='movieDetailsDivHeading'], h1, h2, h3, h4, [class*='movie-name' i]"
    );
    for (const h of headings) {
      const ht = textOf(h);
      if (ht.toLowerCase() === title.toLowerCase()) {
        return (
          (h.closest && h.closest("[class*='movieSessions']")) ||
          (h.closest && h.closest("[class*='cdpSessions']")) ||
          (h.closest && h.closest("article")) ||
          h.parentElement
        );
      }
    }
    return null;
  }

  function sync(result) {
    const path = Array.isArray(result) ? result : (result && result.path) || [];
    if (Array.isArray(path)) {
      path.forEach((s) => findMovieBlock(s));
    }
    if (global.CinemaPanel && typeof CinemaPanel.layoutAllMovieTicks === "function") {
      CinemaPanel.layoutAllMovieTicks();
    }
  }

  function clear() {}

  global.CinemaPageOverlay = {
    sync,
    findMovieBlock,
    clear,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
