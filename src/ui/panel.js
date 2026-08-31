/**
 * Floating panel UI for Cinema Marathon Planner.
 */
(function (global) {
  const ROOT_ID = "cmp-root";

  const TICK_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 11.3 3.4 8.5l1.1-1.1 1.7 1.7 4.3-4.3 1.1 1.1z"/></svg>';

  /**
   * Bind highlight to a single showtime chip, never a movie poster/row.
   * District chips are li[class*="timeblock"] (every one also has native
   * data-time-selection="1" — we do not reuse that for marathon numbering).
   */
  function resolveShowChip(screening) {
    if (!screening) return null;
    let el = screening.el;
    if (!el || el.nodeType !== 1 || !el.isConnected) return null;

    if (isPosterOrTitleLink(el)) {
      el = findChipInRow(findMovieRow(screening), screening) || el;
    }

    const timeblock = el.closest && el.closest('[class*="timeblock"]');
    if (timeblock && !isMovieRow(timeblock)) {
      return timeblock;
    }

    if (isMovieRow(el) || isPosterOrTitleLink(el)) {
      return findChipInRow(findMovieRow(screening), screening);
    }

    return el;
  }

  function isMovieRow(el) {
    if (!el || !el.className) return false;
    const c = String(el.className);
    return /movieSessions/i.test(c) || /cdpSessions/i.test(c);
  }

  function isPosterOrTitleLink(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "IMG") return true;
    if (el.closest && el.closest("[class*='movieDetailsDiv']")) return true;
    if (el.closest && el.closest("[class*='col1']") && el.tagName === "A") {
      return true;
    }
    return false;
  }

  function clockKey(text) {
    const extracted =
      global.CinemaTime && CinemaTime.extractClockText
        ? CinemaTime.extractClockText(text)
        : null;
    return (extracted || text || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function screeningClockKey(screening) {
    if (!screening) return "";
    if (screening.startText) return clockKey(screening.startText);
    if (
      Number.isFinite(screening.start) &&
      global.CinemaTime &&
      CinemaTime.formatClock
    ) {
      return clockKey(CinemaTime.formatClock(new Date(screening.start)));
    }
    return "";
  }

  function findChipInRow(row, screening) {
    if (!row) return null;
    const want = screeningClockKey(screening);
    const nodes = row.querySelectorAll(
      '[class*="timeblock"], [class*="showtime"], button, a, [role="button"]'
    );
    for (const node of nodes) {
      if (isPosterOrTitleLink(node)) continue;
      const t = (node.innerText || node.textContent || "").replace(/\s+/g, " ");
      if (want && clockKey(t) === want) {
        return (node.closest && node.closest('[class*="timeblock"]')) || node;
      }
    }
    return null;
  }

  function findMovieRow(screening) {
    const el = screening && screening.el;
    if (el && el.nodeType === 1) {
      const district = el.closest && el.closest('[class*="movieSessions"]');
      if (district) return district;
      const article = el.closest && el.closest("article.movie, article");
      if (article && article.querySelector("img, h2, h3")) return article;
      const bms = el.closest && el.closest("#venuelist li, [class*='movie-details']");
      if (bms) return bms;
    }
    const title = ((screening && screening.title) || "").trim();
    if (!title) return null;
    const headings = document.querySelectorAll(
      "[class*='movieDetailsDivHeading'], h2, h3, [class*='movie-name' i]"
    );
    for (const h of headings) {
      const ht = (h.textContent || "").replace(/\s+/g, " ").trim();
      if (ht.toLowerCase() === title.toLowerCase()) {
        return (
          (h.closest && h.closest('[class*="movieSessions"]')) ||
          (h.closest && h.closest("article")) ||
          h.parentElement
        );
      }
    }
    return null;
  }

  const TICK_SIZE = 28;
  const TICK_GAP = 10;
  const TICK_LAYER_ID = "cmp-movie-ticks";

  function getTickLayer() {
    let layer = document.getElementById(TICK_LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = TICK_LAYER_ID;
      document.documentElement.appendChild(layer);
    }
    return layer;
  }

  function layoutMovieTick(tick) {
    const row = tick && tick._cmpRow;
    if (!tick || !row || !row.isConnected) return;
    const rect = row.getBoundingClientRect();
    // Sit fully in the page gutter: right edge of the tick is TICK_GAP
    // left of the grey card. Never insert into District flex/grid.
    tick.style.width = TICK_SIZE + "px";
    tick.style.height = TICK_SIZE + "px";
    tick.style.left = rect.left - TICK_SIZE - TICK_GAP + "px";
    tick.style.top = rect.top + 18 + "px";
  }

  function layoutAllMovieTicks() {
    document.querySelectorAll("#" + TICK_LAYER_ID + " .cmp-movie-tick").forEach(layoutMovieTick);
  }

  let tickLayoutBound = false;
  function ensureTickLayoutListener() {
    if (tickLayoutBound) return;
    tickLayoutBound = true;
    document.addEventListener("scroll", layoutAllMovieTicks, true);
    window.addEventListener("resize", layoutAllMovieTicks);
  }

  /**
   * Tick lives on a document overlay, not in the movie card. District’s
   * grey card (poster + title + showtimes) stays pixel-identical.
   */
  function placeMovieTick(row) {
    if (!row || !row.isConnected) return null;
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "cmp-movie-tick";
    tick.setAttribute("aria-label", "Selected for marathon");
    tick.innerHTML = TICK_SVG;
    tick._cmpRow = row;
    tick.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    getTickLayer().appendChild(tick);
    ensureTickLayoutListener();
    layoutMovieTick(tick);
    return tick;
  }

  /**
   * @typedef {Object} PanelState
   * @property {boolean} open
   * @property {number} bufferMinutes
   * @property {boolean} allowRewatch
   * @property {object|null} scrape
   * @property {object|null} result
   * @property {string} status
   */

  function createPanelController() {
    /** @type {PanelState} */
    let state = {
      open: false,
      bufferMinutes: 15,
      allowRewatch: false,
      excludedMovieIds: [],
      scrape: null,
      result: null,
      catalog: [],
      status: "idle",
      message: "",
    };

    let root = null;
    let highlighted = [];
    let movieTicks = [];
    let onChange = null;

    function mount() {
      if (document.getElementById(ROOT_ID)) {
        root = document.getElementById(ROOT_ID);
        return root;
      }
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
      render();
      return root;
    }

    function setState(partial) {
      const next = { ...state, ...partial };
      const same =
        next.open === state.open &&
        next.bufferMinutes === state.bufferMinutes &&
        next.allowRewatch === state.allowRewatch &&
        excludedKey(next.excludedMovieIds) === excludedKey(state.excludedMovieIds) &&
        catalogKey(next.catalog) === catalogKey(state.catalog) &&
        next.status === state.status &&
        next.message === state.message &&
        resultKey(next.result) === resultKey(state.result) &&
        scrapeKey(next.scrape) === scrapeKey(state.scrape);
      state = next;
      if (!same) render();
      if (typeof onChange === "function") onChange(state);
    }

    function getState() {
      return state;
    }

    function setOnChange(fn) {
      onChange = fn;
    }

    function clearHighlights() {
      highlighted.forEach((el) => {
        if (!el) return;
        el.classList.remove("cmp-highlight-show", "cmp-highlight-first");
        el.removeAttribute("data-cmp-step"); // leftover from older numbered badges
      });
      highlighted = [];
      clearMovieTicks();
    }

    function clearMovieTicks() {
      movieTicks.forEach((tick) => {
        if (tick && tick.parentNode) tick.parentNode.removeChild(tick);
      });
      movieTicks = [];
      const layer = document.getElementById(TICK_LAYER_ID);
      if (layer && !layer.querySelector(".cmp-movie-tick") && layer.parentNode) {
        layer.parentNode.removeChild(layer);
      }
    }

    function highlightPath(path) {
      clearHighlights();
      (path || []).forEach((s, i) => {
        const el = resolveShowChip(s);
        if (el && el.isConnected) {
          el.classList.add("cmp-highlight-show");
          // Path order stays in result.path (stop i+1). Never paint digits
          // on chips — including 2, 3, … — and never copy District's
          // data-time-selection="1".
          el.removeAttribute("data-cmp-step");
          highlighted.push(el);
        }
      });
      syncMovieTicks(path);
      const firstChip = highlighted[0];
      if (firstChip && firstChip.scrollIntoView) {
        try {
          firstChip.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) {
          /* ignore */
        }
      }
      requestAnimationFrame(layoutAllMovieTicks);
    }

    function syncMovieTicks(path) {
      clearMovieTicks();
      const seen = new Set();
      (path || []).forEach((s) => {
        const row = findMovieRow(s);
        if (!row || seen.has(row)) return;
        seen.add(row);
        const tick = placeMovieTick(row);
        if (tick) movieTicks.push(tick);
      });
    }

    function render() {
      if (!root) return;
      const prevScroll = root.querySelector(".cmp-body")
        ? root.querySelector(".cmp-body").scrollTop
        : 0;

      if (!state.open) {
        root.innerHTML = "";
        const fab = document.createElement("button");
        fab.type = "button";
        fab.className = "cmp-fab";
        fab.title = "Cinema Marathon Planner";
        const count =
          state.result && state.result.maxCount > 0
            ? state.result.maxCount
            : "·";
        fab.innerHTML = `<span>🎬 Marathon</span><span class="cmp-fab-badge">${escapeHtml(
          String(count)
        )}</span>`;
        fab.addEventListener("click", () => setState({ open: true }));
        root.appendChild(fab);
        return;
      }

      const venue =
        (state.scrape && state.scrape.venue) ||
        document.title.split("|")[0].trim() ||
        "This page";
      const result = state.result;
      const path = (result && result.path) || [];

      root.innerHTML = "";
      const panel = document.createElement("div");
      panel.className = "cmp-panel";

      // Header
      const header = document.createElement("div");
      header.className = "cmp-header";
      header.innerHTML = `
        <div>
          <p class="cmp-title">Cinema Marathon</p>
          <p class="cmp-subtitle" title="${escapeAttr(venue)}">${escapeHtml(
            venue
          )}</p>
        </div>
        <button type="button" class="cmp-icon-btn" data-action="close" title="Minimize">−</button>
      `;
      panel.appendChild(header);

      const body = document.createElement("div");
      body.className = "cmp-body";

      // Stats
      const stat = document.createElement("div");
      stat.className = "cmp-stat";
      const maxCount = result ? result.maxCount : "—";
      const candidates = result ? result.totalCandidates : "—";
      stat.innerHTML = `
        <div class="cmp-stat-card">
          <p class="cmp-stat-label">Max movies</p>
          <p class="cmp-stat-value">${escapeHtml(String(maxCount))}</p>
        </div>
        <div class="cmp-stat-card">
          <p class="cmp-stat-label">Showtimes found</p>
          <p class="cmp-stat-value">${escapeHtml(String(candidates))}</p>
        </div>
      `;
      body.appendChild(stat);

      // Controls
      const controls = document.createElement("div");
      controls.className = "cmp-controls";
      controls.innerHTML = `
        <div class="cmp-row">
          <label for="cmp-buffer">Buffer between films</label>
          <span>
            <input id="cmp-buffer" type="range" min="0" max="60" step="5" value="${state.bufferMinutes}" />
            <span class="cmp-buffer-val">${state.bufferMinutes}m</span>
          </span>
        </div>
        <div class="cmp-row">
          <label for="cmp-rewatch">Allow same movie twice</label>
          <input id="cmp-rewatch" type="checkbox" ${
            state.allowRewatch ? "checked" : ""
          } />
        </div>
      `;
      body.appendChild(controls);

      const catalog = state.catalog || [];
      const excludedSet = new Set(state.excludedMovieIds || []);
      const includedCount = catalog.filter((m) => !excludedSet.has(m.movieId))
        .length;
      if (catalog.length) {
        const picker = document.createElement("div");
        picker.className = "cmp-picker";
        picker.innerHTML = `
          <div class="cmp-picker-head">
            <p class="cmp-picker-title">Movies to watch</p>
            <span class="cmp-picker-count">${includedCount}/${catalog.length}</span>
          </div>
          <p class="cmp-picker-hint">Uncheck films you’ve seen or want to skip. The marathon only uses checked titles.</p>
          <div class="cmp-picker-actions">
            <button type="button" class="cmp-link" data-action="include-all">Select all</button>
            <button type="button" class="cmp-link" data-action="include-none">Select none</button>
          </div>
        `;
        const listEl = document.createElement("div");
        listEl.className = "cmp-movie-list";
        catalog.forEach((m) => {
          const on = !excludedSet.has(m.movieId);
          const row = document.createElement("label");
          row.className = "cmp-movie-row" + (on ? "" : " is-off");
          row.innerHTML = `
            <input type="checkbox" data-movie-id="${escapeAttr(m.movieId)}" ${
              on ? "checked" : ""
            } />
            <span class="cmp-movie-name">${escapeHtml(m.title)}</span>
            <span class="cmp-movie-shows">${m.showCount} show${
              m.showCount === 1 ? "" : "s"
            }</span>
          `;
          listEl.appendChild(row);
        });
        picker.appendChild(listEl);
        body.appendChild(picker);
      }

      // Actions
      const actions = document.createElement("div");
      actions.className = "cmp-actions";
      actions.innerHTML = `
        <button type="button" class="cmp-btn" data-action="refresh">Rescan page</button>
        <button type="button" class="cmp-btn cmp-btn-primary" data-action="highlight">Highlight path</button>
      `;
      body.appendChild(actions);

      // Path or empty
      if (state.message) {
        const hint = document.createElement("p");
        hint.className = "cmp-hint";
        hint.textContent = state.message;
        body.appendChild(hint);
      }

      if (!result || result.maxCount === 0) {
        const empty = document.createElement("p");
        empty.className = "cmp-empty";
        empty.textContent =
          catalog.length && includedCount === 0
            ? "Select at least one movie above. Skipped titles stay out of the marathon."
            : "Open a cinema showtimes page for a specific date (BookMyShow or District), then hit Rescan. The planner needs multiple showtime chips on the page.";
        body.appendChild(empty);
      } else {
        const list = document.createElement("ol");
        list.className = "cmp-path";

        path.forEach((s, i) => {
          const li = document.createElement("li");
          li.className = "cmp-path-item";

          const start = CinemaTime.formatClock(new Date(s.start));
          const end = CinemaTime.formatClock(new Date(s.end));
          const runtime = Math.round((s.end - s.start) / 60000);
          const est = s.estimatedEnd ? " · est. runtime" : "";
          const fmt = s.format ? ` · ${s.format}` : "";

          li.innerHTML = `
            <div class="cmp-path-card">
              <p class="cmp-path-time">#${i + 1} · ${escapeHtml(
                start
              )} – ${escapeHtml(end)}</p>
              <p class="cmp-path-title">${escapeHtml(s.title)}</p>
              <p class="cmp-path-meta">${CinemaTime.formatDuration(
                runtime
              )}${escapeHtml(fmt)}${escapeHtml(est)}</p>
            </div>
          `;
          list.appendChild(li);

          if (i < path.length - 1) {
            const gap = result.gapsMinutes[i];
            const gapEl = document.createElement("p");
            gapEl.className = "cmp-gap" + (gap <= 5 ? " tight" : "");
            gapEl.textContent = "↓ " + CinemaTime.formatGap(gap);
            list.appendChild(gapEl);
          }
        });

        body.appendChild(list);

        const inPath = new Set((path || []).map((s) => s.movieId));
        const leftover = catalog.filter(
          (m) => !excludedSet.has(m.movieId) && !inPath.has(m.movieId)
        );
        if (leftover.length) {
          const skipNote = document.createElement("p");
          skipNote.className = "cmp-footer";
          skipNote.textContent =
            "Wanted but didn’t fit this chain: " +
            leftover.map((m) => m.title).join(", ");
          body.appendChild(skipNote);
        }

        if (result.spanMinutes) {
          const footer = document.createElement("p");
          footer.className = "cmp-footer";
          footer.textContent = `Day span ${CinemaTime.formatDuration(
            result.spanMinutes
          )} · screen time ${CinemaTime.formatDuration(
            result.totalRuntimeMin
          )} · source ${
            (state.scrape && state.scrape.source) || "unknown"
          }`;
          body.appendChild(footer);
        }
      }

      panel.appendChild(body);
      root.appendChild(panel);

      // Events
      panel.querySelector('[data-action="close"]').addEventListener("click", () => {
        setState({ open: false });
      });

      const buffer = panel.querySelector("#cmp-buffer");
      const bufferVal = panel.querySelector(".cmp-buffer-val");
      buffer.addEventListener("input", () => {
        bufferVal.textContent = `${buffer.value}m`;
      });
      buffer.addEventListener("change", () => {
        setState({ bufferMinutes: parseInt(buffer.value, 10) || 0 });
      });

      panel.querySelector("#cmp-rewatch").addEventListener("change", (e) => {
        setState({ allowRewatch: e.target.checked });
      });

      const includeAll = panel.querySelector('[data-action="include-all"]');
      const includeNone = panel.querySelector('[data-action="include-none"]');
      if (includeAll) {
        includeAll.addEventListener("click", () => {
          setState({ excludedMovieIds: [] });
        });
      }
      if (includeNone) {
        includeNone.addEventListener("click", () => {
          setState({
            excludedMovieIds: (state.catalog || []).map((m) => m.movieId),
          });
        });
      }
      panel.querySelectorAll("[data-movie-id]").forEach((input) => {
        input.addEventListener("change", (e) => {
          const id = e.target.getAttribute("data-movie-id");
          const next = new Set(state.excludedMovieIds || []);
          if (e.target.checked) next.delete(id);
          else next.add(id);
          setState({ excludedMovieIds: [...next] });
        });
      });

      panel.querySelector('[data-action="refresh"]').addEventListener("click", () => {
        if (typeof root._onRefresh === "function") root._onRefresh();
      });

      panel.querySelector('[data-action="highlight"]').addEventListener("click", () => {
        if (result && result.path) highlightPath(result.path);
      });

      body.scrollTop = prevScroll;
    }

    function setRefreshHandler(fn) {
      if (root) root._onRefresh = fn;
      // also stash for after remount
      setRefreshHandler._fn = fn;
    }

    // Re-bind refresh after each render via mount wrapper
    const _render = render;
    render = function () {
      _render();
      if (root && setRefreshHandler._fn) root._onRefresh = setRefreshHandler._fn;
    };

    function destroy() {
      clearHighlights();
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
    }

    return {
      mount,
      setState,
      getState,
      setOnChange,
      setRefreshHandler,
      highlightPath,
      clearHighlights,
      destroy,
      render,
    };
  }

  function resultKey(result) {
    if (!result) return "";
    return `${result.maxCount}|${(result.path || [])
      .map((s) => `${s.title}|${s.start}|${s.end}`)
      .join(">")}`;
  }

  function scrapeKey(scrape) {
    if (!scrape || !scrape.rows) return "";
    return `${scrape.source}|${scrape.venue}|${scrape.rows.length}|${scrape.rows
      .map((r) => `${r.title}|${r.startText}`)
      .join(";")}`;
  }

  function catalogKey(catalog) {
    if (!catalog || !catalog.length) return "";
    return catalog.map((m) => `${m.movieId}:${m.showCount}`).join(";");
  }

  function excludedKey(ids) {
    return (ids || []).slice().sort().join("|");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  global.CinemaPanel = {
    createPanelController,
    resolveShowChip,
    findMovieRow,
    placeMovieTick,
    layoutMovieTick,
    layoutAllMovieTicks,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
