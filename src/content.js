/**
 * Content script entry — scrape page, compute marathon, show panel.
 */
(function () {
  if (window.__cinemaMarathonLoaded) return;
  window.__cinemaMarathonLoaded = true;

  const panel = CinemaPanel.createPanelController();
  panel.mount();

  let debounceTimer = null;
  let lastUrl = location.href;

  async function loadPrefs() {
    try {
      if (!chrome.storage || !chrome.storage.sync) return;
      const data = await chrome.storage.sync.get({
        bufferMinutes: 15,
        allowRewatch: false,
        panelOpen: false,
      });
      panel.setState({
        bufferMinutes: data.bufferMinutes,
        allowRewatch: data.allowRewatch,
        open: data.panelOpen,
      });
    } catch (_) {
      /* extension context may be unavailable on some pages */
    }
  }

  function savePrefs(partial) {
    try {
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set(partial);
      }
    } catch (_) {
      /* ignore */
    }
  }

  function titlesLookWeak(rows) {
    if (!rows || !rows.length) return true;
    const weak = rows.filter((r) => {
      const t = (r && r.title) || "";
      return /^unknown/i.test(t) || !CinemaAdapterGeneric.looksLikeTitle(t);
    });
    return weak.length / rows.length > 0.5;
  }

  function scrapePage() {
    let data = null;
    if (CinemaAdapterBookMyShow.isBookMyShow()) {
      data = CinemaAdapterBookMyShow.scrape();
    } else if (CinemaAdapterDistrict.isDistrict()) {
      data = CinemaAdapterDistrict.scrape();
    }

    const needGeneric =
      !data ||
      !data.rows ||
      data.rows.length < 2 ||
      titlesLookWeak(data.rows);

    if (needGeneric) {
      const generic = CinemaAdapterGeneric.scrape();
      if (!data) {
        data = {
          site: "unknown",
          venue: generic.venue,
          day: generic.day,
          rows: generic.rows,
          source: generic.source,
        };
      } else if (
        generic.rows.length > data.rows.length ||
        (titlesLookWeak(data.rows) && !titlesLookWeak(generic.rows))
      ) {
        data = {
          ...data,
          rows: generic.rows,
          source: data.source + "+" + generic.source,
          venue: data.venue || generic.venue,
        };
      }
    }

    return data;
  }

  let lastComputeKey = "";

  function pathElsLive(result) {
    return !!(
      result &&
      result.path &&
      result.path.every((s) => !s.el || s.el.isConnected)
    );
  }

  function recompute(options = {}) {
    const state = panel.getState();
    const scrape = options.scrape || scrapePage();
    const screenings = CinemaSchedule.normalizeScreenings(scrape.rows, scrape.day, {
      venue: scrape.venue,
      defaultRuntimeMin: CinemaTime.DEFAULT_RUNTIME_MIN,
    });

    const result = CinemaSchedule.findMaxMarathon(screenings, {
      bufferMinutes: state.bufferMinutes,
      allowRewatch: state.allowRewatch,
    });

    const computeKey = [
      location.href,
      state.bufferMinutes,
      state.allowRewatch,
      scrape.source,
      scrape.rows.length,
      scrape.rows.map((r) => `${r.title}|${r.startText}`).join(";"),
      result.path.map((s) => `${s.title}|${s.start}|${s.end}`).join(">"),
    ].join("||");

    if (
      !options.force &&
      computeKey === lastComputeKey &&
      pathElsLive(state.result)
    ) {
      return { scrape, screenings, result: state.result };
    }
    lastComputeKey = computeKey;

    let message = "";
    if (screenings.length === 0) {
      message =
        "No showtimes detected on this page yet. Navigate to a theater’s full show list for a date.";
    } else if (screenings.some((s) => s.estimatedEnd)) {
      message =
        "Some end times are estimated (default ~2h 30m). Actual runtimes may change the max chain.";
    }

    panel.setState({
      scrape,
      result,
      status: "ready",
      message,
    });

    const path = (result && result.path) || [];
    if (panel.hasHighlights() || path.length) {
      panel.highlightPath(path, { scroll: false });
    }
    if (typeof CinemaPageOverlay !== "undefined" && typeof CinemaPageOverlay.sync === "function") {
      CinemaPageOverlay.sync(result);
    }

    return { scrape, screenings, result };
  }

  function scheduleRecompute() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      recompute();
    }, 400);
  }

  panel.setRefreshHandler(() => {
    panel.clearHighlights();
    lastComputeKey = "";
    recompute({ force: true });
  });

  let lastOptsKey = "";
  panel.setOnChange((state) => {
    savePrefs({
      bufferMinutes: state.bufferMinutes,
      allowRewatch: state.allowRewatch,
      panelOpen: state.open,
    });

    // Recompute only when buffer / rewatch options change (not on open/result updates)
    const optsKey = `${state.bufferMinutes}|${state.allowRewatch}`;
    if (state.scrape && optsKey !== lastOptsKey) {
      lastOptsKey = optsKey;
      const result = CinemaSchedule.findMaxMarathon(
        CinemaSchedule.normalizeScreenings(state.scrape.rows, state.scrape.day, {
          venue: state.scrape.venue,
        }),
        {
          bufferMinutes: state.bufferMinutes,
          allowRewatch: state.allowRewatch,
        }
      );
          panel.setState({ result });
          const path = (result && result.path) || [];
          if (panel.hasHighlights() || path.length) {
            panel.highlightPath(path, { scroll: false });
          }
          if (
            typeof CinemaPageOverlay !== "undefined" &&
            typeof CinemaPageOverlay.sync === "function"
          ) {
            CinemaPageOverlay.sync(result);
          }
    }
  });

  // SPA navigation
  const urlCheck = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      panel.clearHighlights();
      scheduleRecompute();
    }
  }, 800);

  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        const s = panel.getState();
        const partial = {};
        if (
          changes.bufferMinutes &&
          changes.bufferMinutes.newValue !== s.bufferMinutes
        ) {
          partial.bufferMinutes = changes.bufferMinutes.newValue;
        }
        if (
          changes.allowRewatch &&
          changes.allowRewatch.newValue !== s.allowRewatch
        ) {
          partial.allowRewatch = changes.allowRewatch.newValue;
        }
        if (Object.keys(partial).length) panel.setState(partial);
      });
    }
  } catch (_) {
    /* ignore */
  }

  function isOurUi(node) {
    if (!node) return false;
    if (node.id === "cmp-root" || node.id === "cmp-movie-ticks") return true;
    if (node.nodeType === 1 && node.closest) {
      if (node.closest("#cmp-root, #cmp-movie-ticks")) return true;
    }
    return false;
  }

  // DOM mutations (lazy-loaded showtimes) — ignore our own panel / tick layer
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) => {
      const t = m.target;
      if (isOurUi(t)) return false;
      const nodes = [...m.addedNodes, ...m.removedNodes];
      if (nodes.some((n) => isOurUi(n))) return false;
      return true;
    });
    if (relevant) scheduleRecompute();
  });

  function startObserver() {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
    });
  }

  // History API hooks for client-side routing
  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function () {
      const ret = original.apply(this, arguments);
      window.dispatchEvent(new Event("cmp-location"));
      return ret;
    };
  });
  window.addEventListener("popstate", () => {
    window.dispatchEvent(new Event("cmp-location"));
  });
  window.addEventListener("cmp-location", () => {
    lastUrl = location.href;
    panel.clearHighlights();
    scheduleRecompute();
  });

  loadPrefs().then(() => {
    startObserver();
    recompute();
    // Open panel by default on first useful detection
    const s = panel.getState();
    if (s.result && s.result.maxCount >= 2 && s.open === false) {
      // keep fab minimized; user can open
    }
  });

  // Cleanup if extension reloads
  window.addEventListener("beforeunload", () => {
    clearInterval(urlCheck);
    observer.disconnect();
  });
})();
