/**
 * Generic DOM heuristics for showtime pages when site-specific adapters miss.
 */
(function (global) {
  const TIME_RE =
    /\b([01]?\d|2[0-3]):([0-5]\d)\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?\b/i;
  const TIME_ONLY_RE =
    /^([01]?\d|2[0-3]):([0-5]\d)\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?$/i;
  const RUNTIME_ONLY_RE =
    /^\d+\s*h(?:rs?|ours?)?(?:\s*\d+\s*m(?:ins?)?)?(?:\s*[·•|\-].*)?$/i;
  const UNAVAILABLE_RE =
    /\b(sold\s*out|unavailable|not available|closed|cancelled|canceled)\b/i;

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function looksLikeTitle(t) {
    if (!t) return false;
    const s = t.split("\n")[0].trim();
    if (s.length < 2 || s.length > 120) return false;
    if (TIME_ONLY_RE.test(s)) return false;
    if (RUNTIME_ONLY_RE.test(s)) return false;
    if (/^\d{1,2}:\d{2}/.test(s)) return false;
    if (
      /^(IMAX|4DX|3D|2D|ICE|MX4D|ScreenX|Dolby|Atmos)(\s|$)/i.test(s) &&
      s.length < 28
    ) {
      return false;
    }
    if (/book|select\s*seats?|fill(ing)?\s*fast/i.test(s) && s.length < 28) {
      return false;
    }
    return true;
  }

  /**
   * Walk up to find a plausible movie title near a showtime element.
   */
  function findNearbyTitle(el, maxDepth = 8) {
    let node = el;
    for (let d = 0; d < maxDepth && node; d++) {
      const section = node.parentElement;
      if (!section) break;

      const headings = section.querySelectorAll(
        "h1, h2, h3, h4, [data-title], [class*='movie-name' i], [class*='moviename' i]"
      );
      for (const heading of headings) {
        const t = textOf(heading);
        if (looksLikeTitle(t)) return t.split("\n")[0].trim();
      }

      let sib = section.previousElementSibling;
      let hops = 0;
      while (sib && hops < 6) {
        const h = sib.querySelector("h1, h2, h3, h4");
        const t = textOf(h || sib);
        if (looksLikeTitle(t)) return t.split("\n")[0].trim();
        sib = sib.previousElementSibling;
        hops += 1;
      }

      node = section;
    }
    return null;
  }

  /**
   * Extract runtime minutes from nearby text like "2h 30m", "150 mins", "2 hrs 15 min".
   */
  function findNearbyRuntime(el) {
    let node = el;
    for (let d = 0; d < 6 && node; d++) {
      const t = textOf(node);
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
      node = node.parentElement;
    }
    return null;
  }

  function findFormat(el) {
    let node = el;
    for (let d = 0; d < 5 && node; d++) {
      const t = textOf(node);
      const m = t.match(/\b(IMAX|4DX|3D|2D|ICE|MX4D|ScreenX|Dolby|Atmos)\b/i);
      if (m) return m[1].toUpperCase();
      node = node.parentElement;
    }
    return "";
  }

  /**
   * Collect clickable / chip-like elements whose primary text is a clock time.
   */
  function scrapeShowtimeChips(root = document) {
    const candidates = root.querySelectorAll(
      "a, button, div, span, li, [role='button'], [class*='show' i], [class*='time' i], [class*='session' i]"
    );
    const rows = [];
    const seen = new Set();

    candidates.forEach((el) => {
      if (!isVisible(el)) return;
      const raw = textOf(el);
      if (!raw || raw.length > 48) return;
      if (UNAVAILABLE_RE.test(raw)) return;

      const clock = global.CinemaTime.parseClock(raw);
      if (!clock) return;

      const childTime = Array.from(el.querySelectorAll("a, button, span, div")).some(
        (c) => global.CinemaTime.parseClock(textOf(c))
      );
      if (childTime) return;

      const startText = global.CinemaTime.extractClockText(raw) || raw;
      const title = findNearbyTitle(el) || "Unknown movie";
      const key = `${title}|${startText}`;
      if (seen.has(key)) return;
      seen.add(key);

      rows.push({
        title,
        startText,
        runtimeMin: findNearbyRuntime(el) || undefined,
        format: findFormat(el),
        el,
      });
    });

    return rows;
  }

  /**
   * Fallback: section-based parse — each block with a title and multiple times.
   */
  function scrapeBySections(root = document) {
    const rows = [];
    const blocks = root.querySelectorAll(
      "section, article, li, [class*='movie' i], [class*='cinema' i], [class*='show' i], [class*='listing' i]"
    );

    blocks.forEach((block) => {
      if (!isVisible(block)) return;
      const heading = block.querySelector("h1, h2, h3, h4, a[href*='movie' i], [class*='name' i]");
      const title = textOf(heading);
      if (!looksLikeTitle(title)) return;

      const body = textOf(block);
      const times = [...body.matchAll(new RegExp(TIME_RE.source, "gi"))].map(
        (m) => m[0]
      );
      if (!times.length) return;
      if (times.length > 40) return; // likely whole page

      const runtimeMin = findNearbyRuntime(block) || undefined;
      const format = findFormat(block);
      const unique = [...new Set(times.map((t) => t.trim()))];

      unique.forEach((startText) => {
        // Try to bind to a specific child element
        let el = null;
        block.querySelectorAll("a, button, span, div").forEach((child) => {
          if (el) return;
          const ct = textOf(child);
          if (UNAVAILABLE_RE.test(ct)) return;
          const extracted = global.CinemaTime.extractClockText(ct);
          if (
            extracted &&
            extracted.replace(/\s/g, "").toLowerCase() ===
              startText.replace(/\s/g, "").toLowerCase()
          ) {
            el = child;
          }
        });

        rows.push({ title, startText, runtimeMin, format, el });
      });
    });

    return rows;
  }

  function detectVenue(root = document) {
    const og = document.querySelector('meta[property="og:title"]');
    if (og && og.content) {
      const part = og.content.split("|")[0].trim();
      if (part.length > 2 && part.length < 100) return part;
    }
    const h1 = root.querySelector("h1");
    if (h1) {
      const t = textOf(h1);
      if (t && t.length < 100) return t;
    }
    return document.title.split("-")[0].split("|")[0].trim() || "This theater";
  }

  function detectDay() {
    // Common URL date patterns
    const href = location.href;
    const iso = href.match(/(\d{4}-\d{2}-\d{2})/);
    if (iso) return CinemaTime.resolveDay(iso[1]);

    // Selected date chips often have aria-selected or active class
    const active = document.querySelector(
      '[aria-selected="true"], [class*="date"][class*="active" i], [class*="selected" i][class*="date" i]'
    );
    if (active) {
      const t = textOf(active);
      const d = CinemaTime.resolveDay(t);
      if (d) return d;
    }
    return CinemaTime.resolveDay(new Date());
  }

  /**
   * @returns {{ venue: string, day: Date, rows: Array, source: string }}
   */
  function scrape(root = document) {
    let rows = scrapeShowtimeChips(root);
    let source = "generic-chips";
    if (rows.length < 2) {
      const sectionRows = scrapeBySections(root);
      if (sectionRows.length > rows.length) {
        rows = sectionRows;
        source = "generic-sections";
      }
    }
    return {
      venue: detectVenue(root),
      day: detectDay(),
      rows,
      source,
    };
  }

  global.CinemaAdapterGeneric = {
    scrape,
    scrapeShowtimeChips,
    scrapeBySections,
    detectVenue,
    detectDay,
    textOf,
    isVisible,
    looksLikeTitle,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
