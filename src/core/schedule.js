/**
 * Longest non-overlapping screening chain (max movies in one day).
 * Enforces at most one screening per movie unless allowRewatch is set.
 */
(function (global) {
  /**
   * @typedef {Object} Screening
   * @property {string} id
   * @property {string} movieId
   * @property {string} title
   * @property {number} start  epoch ms
   * @property {number} end    epoch ms
   * @property {boolean} [estimatedEnd]
   * @property {Element|null} [el]
   * @property {string} [format]
   * @property {string} [venue]
   */

  function canFollow(a, b, bufferMs) {
    return b.start >= a.end + bufferMs;
  }

  /**
   * DFS / backtracking over time-ordered screenings.
   * n is small on real cinema pages (usually &lt; 80).
   *
   * @param {Screening[]} screenings
   * @param {Object} options
   * @param {number} [options.bufferMinutes=15]
   * @param {boolean} [options.allowRewatch=false]
   */
  function findMaxMarathon(screenings, options = {}) {
    const bufferMinutes = Number.isFinite(options.bufferMinutes)
      ? options.bufferMinutes
      : 15;
    const allowRewatch = Boolean(options.allowRewatch);
    const bufferMs = bufferMinutes * 60 * 1000;

    const excluded = new Set(options.excludedMovieIds || []);
    const list = (screenings || [])
      .filter(
        (s) =>
          s &&
          Number.isFinite(s.start) &&
          Number.isFinite(s.end) &&
          s.end > s.start &&
          !excluded.has(s.movieId)
      )
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);

    if (list.length === 0) {
      return emptyResult("none", bufferMinutes);
    }

    const n = list.length;
    /** @type {Screening[]} */
    let bestPath = [];
    let bestSlack = -1;
    let steps = 0;
    const STEP_LIMIT = 250000;

    function isBetter(path, slack) {
      if (path.length > bestPath.length) return true;
      if (path.length < bestPath.length) return false;
      if (!path.length) return false;
      if (slack !== bestSlack) return slack > bestSlack;
      return path[path.length - 1].end < bestPath[bestPath.length - 1].end;
    }

    /**
     * @param {number} fromIdx
     * @param {number} lastEnd
     * @param {Set<string>} usedMovies
     * @param {Screening[]} path
     * @param {number} slackSum
     */
    function dfs(fromIdx, lastEnd, usedMovies, path, slackSum) {
      if (isBetter(path, slackSum)) {
        bestPath = path.slice();
        bestSlack = slackSum;
      }

      // Prune when we cannot beat current best length
      if (path.length + (n - fromIdx) < bestPath.length) return;

      for (let i = fromIdx; i < n; i++) {
        if (++steps > STEP_LIMIT) return;
        const s = list[i];
        if (s.start < lastEnd + bufferMs) continue;
        if (!allowRewatch && usedMovies.has(s.movieId)) continue;

        const gap = path.length === 0 ? 0 : s.start - lastEnd;
        path.push(s);
        if (!allowRewatch) usedMovies.add(s.movieId);
        dfs(i + 1, s.end, usedMovies, path, slackSum + gap);
        if (!allowRewatch) usedMovies.delete(s.movieId);
        path.pop();
      }
    }

    dfs(0, Number.NEGATIVE_INFINITY, new Set(), [], 0);

    const path = bestPath;
    const gapsMinutes = [];
    for (let i = 0; i < path.length - 1; i++) {
      gapsMinutes.push(Math.round((path[i + 1].start - path[i].end) / 60000));
    }

    const totalRuntimeMin = path.reduce(
      (sum, s) => sum + Math.round((s.end - s.start) / 60000),
      0
    );
    const spanMinutes =
      path.length > 0
        ? Math.round((path[path.length - 1].end - path[0].start) / 60000)
        : 0;

    return {
      maxCount: path.length,
      path,
      gapsMinutes,
      totalRuntimeMin,
      spanMinutes,
      strategy: "max-count",
      bufferMinutes,
      totalCandidates: list.length,
    };
  }

  function emptyResult(strategy, bufferMinutes) {
    return {
      maxCount: 0,
      path: [],
      gapsMinutes: [],
      totalRuntimeMin: 0,
      spanMinutes: 0,
      strategy,
      bufferMinutes: bufferMinutes || 0,
      totalCandidates: 0,
    };
  }

  /**
   * Normalize raw scraped rows into Screening objects.
   */
  function normalizeScreenings(rows, day, options = {}) {
    const defaultRuntime =
      options.defaultRuntimeMin || global.CinemaTime.DEFAULT_RUNTIME_MIN;
    const baseDay = global.CinemaTime.resolveDay(day);
    const out = [];
    let idx = 0;

    for (const row of rows || []) {
      const title = (row.title || row.movie || "Unknown").trim();
      if (!title) continue;

      const clock =
        row.clock ||
        (row.startText ? global.CinemaTime.parseClock(row.startText) : null);
      if (
        !clock &&
        !(row.start instanceof Date) &&
        !Number.isFinite(row.start)
      ) {
        continue;
      }

      let start;
      if (row.start instanceof Date) {
        start = row.start.getTime();
      } else if (Number.isFinite(row.start)) {
        start = row.start;
      } else {
        start = global.CinemaTime.toDateOnDay(baseDay, clock).getTime();
      }

      let end;
      let estimatedEnd = false;
      if (row.end instanceof Date) {
        end = row.end.getTime();
      } else if (Number.isFinite(row.end)) {
        end = row.end;
      } else if (Number.isFinite(row.runtimeMin) && row.runtimeMin > 0) {
        end = start + row.runtimeMin * 60 * 1000;
      } else if (row.endText) {
        const endClock = global.CinemaTime.parseClock(row.endText);
        if (endClock) {
          end = global.CinemaTime.toDateOnDay(baseDay, endClock).getTime();
          if (end <= start) {
            end = global.CinemaTime.toDateOnDay(baseDay, endClock, {
              nextDay: true,
            }).getTime();
          }
        }
      }

      if (!Number.isFinite(end)) {
        end = start + defaultRuntime * 60 * 1000;
        estimatedEnd = true;
      }

      if (end <= start) {
        end += 24 * 60 * 60 * 1000;
      }

      const movieId =
        row.movieId ||
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      out.push({
        id: row.id || `${movieId}-${start}-${idx}`,
        movieId,
        title,
        start,
        end,
        estimatedEnd: estimatedEnd || Boolean(row.estimatedEnd),
        el: row.el || null,
        format: row.format || "",
        venue: row.venue || options.venue || "",
      });
      idx += 1;
    }

    rollLateNightStarts(out);

    const seen = new Set();
    return out.filter((s) => {
      const key = `${s.movieId}|${s.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Unique titles from a screening list, for the include/skip picker.
   */
  function uniqueMovies(screenings) {
    const map = new Map();
    for (const s of screenings || []) {
      if (!s || !s.movieId) continue;
      const prev = map.get(s.movieId);
      if (!prev) {
        map.set(s.movieId, {
          movieId: s.movieId,
          title: s.title || s.movieId,
          showCount: 1,
        });
      } else {
        prev.showCount += 1;
      }
    }
    return [...map.values()].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }

  function rollLateNightStarts(screenings) {
    if (!screenings.length) return;
    const hours = screenings.map((s) => new Date(s.start).getHours());
    const hasEvening = hours.some((h) => h >= 18);
    const hasLateNight = hours.some((h) => h < 6);
    if (!hasEvening || !hasLateNight) return;

    const dayMs = 24 * 60 * 60 * 1000;
    screenings.forEach((s) => {
      if (new Date(s.start).getHours() < 6) {
        s.start += dayMs;
        s.end += dayMs;
      }
    });
  }

  global.CinemaSchedule = {
    findMaxMarathon,
    normalizeScreenings,
    uniqueMovies,
    canFollow,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
