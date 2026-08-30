/**
 * BookMyShow-oriented scraper. Falls back to generic heuristics.
 * Site markup changes often — keep selectors defensive.
 */
(function (global) {
  const HOST_RE = /bookmyshow\.com$/i;

  function isBookMyShow() {
    return HOST_RE.test(location.hostname.replace(/^www\./, "")) ||
      /bookmyshow\.com$/i.test(location.hostname);
  }

  function textOf(el) {
    return global.CinemaAdapterGeneric.textOf(el);
  }

  /**
   * Try common BMS cinema / movie listing patterns.
   */
  function scrapeStructured() {
    const rows = [];
    const seen = new Set();

    // Movie name blocks on cinema pages
    const movieBlocks = document.querySelectorAll(
      [
        "#venuelist li",
        "ul#venuelist > li",
        "[class*='movie-details']",
        "[class*='MovieDetails']",
        "[class*='cinema-movie']",
        "[data-component*='movie' i]",
        "li[class*='list' i]",
        "div[class*='showtime' i]",
      ].join(",")
    );

    movieBlocks.forEach((block) => {
      if (!global.CinemaAdapterGeneric.isVisible(block)) return;

      let title = "";
      const titleEl = block.querySelector(
        "h1, h2, h3, h4, a[href*='/movies/'], [class*='name' i], [class*='title' i], strong"
      );
      if (titleEl) title = textOf(titleEl);
      if (!global.CinemaAdapterGeneric.looksLikeTitle(title)) return;

      const runtimeMin = extractRuntime(block);
      const formatHints = textOf(block);

      const timeEls = block.querySelectorAll(
        "a.__showtime-link, a[class*='showtime-link'], a[href*='book'], a[href*='show'], button, [class*='showtime' i], [class*='__time'], [data-showtime-code], [class*='session']"
      );

      timeEls.forEach((el) => {
        if (!global.CinemaAdapterGeneric.isVisible(el)) return;
        const t = textOf(el);
        if (/\b(sold\s*out|unavailable|closed)\b/i.test(t)) return;
        const clock = CinemaTime.parseClock(t);
        if (!clock) {
          const nested = CinemaTime.extractClockText(t);
          if (!nested || !CinemaTime.parseClock(nested)) return;
          pushRow(rows, seen, title, nested, runtimeMin, formatHints, el);
          return;
        }
        pushRow(
          rows,
          seen,
          title,
          CinemaTime.extractClockText(t) || t,
          runtimeMin,
          formatHints,
          el
        );
      });
    });

    // Venue-level: showtime strips under cinema headers on movie pages
    if (rows.length < 2) {
      document
        .querySelectorAll(
          "[class*='venue' i], [class*='cinema' i], [id*='venue'], [data-id*='venue']"
        )
        .forEach((venueBlock) => {
          if (!global.CinemaAdapterGeneric.isVisible(venueBlock)) return;
          const venueName =
            textOf(
              venueBlock.querySelector(
                "h1, h2, h3, h4, a[href*='cinemas'], [class*='name' i]"
              )
            ) || "";

          // On a single-movie page, title from document
          const pageTitle = extractPageMovieTitle();
          const title = pageTitle || venueName || "Movie";

          venueBlock.querySelectorAll("a, button, span, div").forEach((el) => {
            if (!global.CinemaAdapterGeneric.isVisible(el)) return;
            const t = textOf(el);
            if (/\b(sold\s*out|unavailable|closed)\b/i.test(t)) return;
            if (!CinemaTime.parseClock(t) || t.length > 48) return;
            pushRow(
              rows,
              seen,
              title,
              t,
              extractRuntime(document.body),
              textOf(venueBlock),
              el,
              venueName
            );
          });
        });
    }

    return rows;
  }

  function pushRow(rows, seen, title, startText, runtimeMin, formatHints, el, venue) {
    const key = `${title}|${startText}|${venue || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    const format = (formatHints || "").match(
      /\b(IMAX|4DX|3D|2D|ICE|MX4D|ScreenX|Dolby)\b/i
    );
    rows.push({
      title,
      startText,
      runtimeMin: runtimeMin || undefined,
      format: format ? format[1].toUpperCase() : "",
      venue: venue || "",
      el,
    });
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

  function extractPageMovieTitle() {
    const h1 = document.querySelector("h1");
    if (h1) {
      const t = textOf(h1);
      if (t && t.length < 100) return t;
    }
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) return og.content.split("|")[0].trim();
    return "";
  }

  function scrape() {
    if (!isBookMyShow()) {
      return null;
    }

    let rows = scrapeStructured();
    let source = "bookmyshow-structured";

    if (rows.length < 2) {
      const generic = global.CinemaAdapterGeneric.scrape();
      if (generic.rows.length > rows.length) {
        rows = generic.rows;
        source = "bookmyshow+" + generic.source;
      }
    }

    return {
      site: "bookmyshow",
      venue:
        global.CinemaAdapterGeneric.detectVenue() ||
        extractPageMovieTitle() ||
        "BookMyShow",
      day: global.CinemaAdapterGeneric.detectDay(),
      rows,
      source,
    };
  }

  global.CinemaAdapterBookMyShow = {
    isBookMyShow,
    scrape,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
