/**
 * District (district.in) oriented scraper. Falls back to generic heuristics.
 */
(function (global) {
  function isDistrict() {
    return /(^|\.)district\.in$/i.test(location.hostname);
  }

  function textOf(el) {
    return global.CinemaAdapterGeneric.textOf(el);
  }

  function scrapeStructured() {
    const rows = [];
    const seen = new Set();

    const movieBlocks = document.querySelectorAll(
      [
        "[class*='movie' i]",
        "[class*='show' i]",
        "[class*='film' i]",
        "[data-testid*='movie' i]",
        "section",
        "article",
        "li",
      ].join(",")
    );

    movieBlocks.forEach((block) => {
      if (!global.CinemaAdapterGeneric.isVisible(block)) return;

      const titleEl = block.querySelector(
        "h1, h2, h3, h4, a[href*='movie' i], [class*='title' i], [class*='name' i]"
      );
      const title = textOf(titleEl);
      if (!global.CinemaAdapterGeneric.looksLikeTitle(title)) return;

      // Avoid huge containers that wrap the whole page
      const timeCandidates = block.querySelectorAll(
        "a, button, [role='button'], span, div"
      );
      let timesFound = 0;
      const localRows = [];

      timeCandidates.forEach((el) => {
        if (!global.CinemaAdapterGeneric.isVisible(el)) return;
        const t = textOf(el);
        if (!t || t.length > 48) return;
        if (/\b(sold\s*out|unavailable|closed)\b/i.test(t)) return;
        if (!CinemaTime.parseClock(t)) return;
        // leaf preference
        const childHasTime = Array.from(el.children || []).some((c) =>
          CinemaTime.parseClock(textOf(c))
        );
        if (childHasTime) return;
        timesFound += 1;
        localRows.push(preferTimeblock(el));
      });

      if (timesFound === 0 || timesFound > 30) return;

      const runtime = extractRuntime(block);
      const formatHints = textOf(block);

      localRows.forEach((el) => {
        const startText = textOf(el);
        const key = `${title}|${startText}`;
        if (seen.has(key)) return;
        seen.add(key);
        const format = (formatHints || "").match(
          /\b(IMAX|4DX|3D|2D|ICE|MX4D|ScreenX|Dolby)\b/i
        );
        rows.push({
          title,
          startText,
          runtimeMin: runtime || undefined,
          format: format ? format[1].toUpperCase() : "",
          el,
        });
      });
    });

    return rows;
  }

  function extractRuntime(root) {
    const t = textOf(root);
    const hm = t.match(
      /(\d+)\s*h(?:rs?|ours?)?(?:\s*(\d+)\s*m(?:in(?:ute)?s?)?)?/i
    );
    if (hm && /h/i.test(hm[0])) {
      return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
    }
    const mins = t.match(/\b(\d{2,3})\s*(?:min|mins|minutes)\b/i);
    if (mins) {
      const v = parseInt(mins[1], 10);
      if (v >= 60 && v <= 240) return v;
    }
    return null;
  }

  function preferTimeblock(el) {
    if (!el || el.nodeType !== 1) return el;
    return (el.closest && el.closest('li[class*="timeblock"]')) || el;
  }

  function scrape() {
    if (!isDistrict()) return null;

    let rows = scrapeStructured();
    let source = "district-structured";

    if (rows.length < 2) {
      const generic = global.CinemaAdapterGeneric.scrape();
      if (generic.rows.length > rows.length) {
        rows = generic.rows;
        source = "district+" + generic.source;
      }
    }

    return {
      site: "district",
      venue: global.CinemaAdapterGeneric.detectVenue() || "District",
      day: global.CinemaAdapterGeneric.detectDay(),
      rows,
      source,
    };
  }

  global.CinemaAdapterDistrict = {
    isDistrict,
    scrape,
    preferTimeblock,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
