/**
 * Time helpers for parsing showtime strings and building day timestamps.
 */
(function (global) {
  const DEFAULT_RUNTIME_MIN = 150;

  const CLOCK_TOKEN =
    /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?/i;

  /**
   * Parse strings like "10:00 AM", "13:30", "1:45pm", "10:00am",
   * and noisy chips like "06:30 PM FILLING FAST".
   */
  function parseClock(text) {
    if (!text || typeof text !== "string") return null;
    const cleaned = text
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\ba\.m\.?\b/gi, "AM")
      .replace(/\bp\.m\.?\b/gi, "PM");

    let m = cleaned.match(new RegExp("^" + CLOCK_TOKEN.source + "$", "i"));
    if (!m && cleaned.length <= 48) {
      const all = [...cleaned.matchAll(new RegExp(CLOCK_TOKEN.source, "gi"))];
      if (all.length === 1) m = all[0];
    }
    if (!m) return null;

    let hours = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    if (minutes > 59 || hours > 23) return null;

    const meridiem = m[3] ? m[3].replace(/\./g, "").toUpperCase() : null;
    if (meridiem === "AM" || meridiem === "PM") {
      if (hours < 1 || hours > 12) return null;
      if (meridiem === "AM") {
        if (hours === 12) hours = 0;
      } else if (hours !== 12) {
        hours += 12;
      }
    }

    return { hours, minutes };
  }

  /**
   * Pull a showtime token out of mixed chip text. Returns the matched string or null.
   */
  function extractClockText(text) {
    if (!text || typeof text !== "string") return null;
    const cleaned = text.trim().replace(/\s+/g, " ");
    const m = cleaned.match(
      /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)?\b/
    );
    return m ? m[0].replace(/\ba\.m\.?\b/gi, "AM").replace(/\bp\.m\.?\b/gi, "PM") : null;
  }

  /**
   * Build a Date on the given base day for a clock time.
   * Late-night shows (00:00–05:59) are treated as after midnight of baseDay
   * only when allowNextDay is true and hour is small — by default we keep same calendar day.
   */
  function toDateOnDay(baseDay, clock, options = {}) {
    const d = new Date(baseDay);
    d.setHours(clock.hours, clock.minutes, 0, 0);
    if (options.nextDay) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  /**
   * Guess a calendar day from page text or URL; fallback = today (local).
   */
  function resolveDay(hint) {
    if (hint instanceof Date && !Number.isNaN(hint.getTime())) {
      return new Date(hint.getFullYear(), hint.getMonth(), hint.getDate());
    }
    if (typeof hint === "string" && hint.trim()) {
      const parsed = Date.parse(hint);
      if (!Number.isNaN(parsed)) {
        const d = new Date(parsed);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      // Formats: 2026-07-27, 27/07/2026, 27 Jul
      const iso = hint.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (iso) {
        return new Date(+iso[1], +iso[2] - 1, +iso[3]);
      }
      const dmy = hint.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmy) {
        return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Format a Date as "10:00 AM".
   */
  function formatClock(date) {
    let h = date.getHours();
    const m = date.getMinutes();
    const meridiem = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${meridiem}`;
  }

  /**
   * Format duration minutes as "2h 30m".
   */
  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  /**
   * Format gap minutes as "15 min gap" / "tight (2 min)".
   */
  function formatGap(minutes) {
    if (minutes < 0) return "overlap";
    if (minutes <= 5) return `tight (${minutes} min)`;
    return `${minutes} min gap`;
  }

  global.CinemaTime = {
    DEFAULT_RUNTIME_MIN,
    parseClock,
    extractClockText,
    toDateOnDay,
    resolveDay,
    formatClock,
    formatDuration,
    formatGap,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
