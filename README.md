# Cinema Marathon Planner

Chrome extension that overlays **BookMyShow** and **District** showtime pages and answers:

> How many movies can I watch today at **this theater**, without overlapping showtimes?

It scrapes the showtimes already on the page, packs a non-overlapping schedule (with a configurable buffer), and highlights the chosen show chips.

## Features

- Floating **Marathon** button on supported sites
- **Max movie chain** for the current cinema + date
- Buffer slider (0–45 minutes between films)
- Optional “allow same movie twice”
- **Highlight path** on the page’s showtime buttons
- Default runtime (~2h 30m) when end times are missing (marked as estimated)

## Install (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder: `cinema-marathon-ext`
5. Open a **cinema showtimes** page on:
   - [BookMyShow](https://in.bookmyshow.com/) — pick a venue and date with many shows  
   - [District](https://www.district.in/) — same idea
6. Click the purple **Marathon** button (bottom-right)

## Offline demo (algorithm only)

Open in a browser:

```text
cinema-marathon-ext/demo/demo.html
```

This uses the same scheduler + generic scraper on a fake cinema page (no extension required).

## Project layout

```text
cinema-marathon-ext/
  manifest.json
  icons/
  src/
    content.js              # entry: scrape → schedule → panel
    core/
      time.js               # parse clocks, format
      schedule.js           # longest path / max marathon
    adapters/
      generic.js            # DOM heuristics
      bookmyshow.js
      district.js
    ui/
      panel.js
      panel.css
    popup/                  # toolbar popup + defaults
  demo/
    demo.html
```

## How it works

1. **Adapters** read movie titles + showtime chips from the DOM (site-specific, then generic fallback).
2. **normalizeScreenings** builds intervals (`start` → `end`), using listed runtime when found.
3. **findMaxMarathon** runs a small DP on the time-ordered DAG:
   - edge A → B if `B.start ≥ A.end + buffer` and (optional) different movies
   - longest path = maximum number of films
4. **Panel** shows the path and can highlight matching DOM nodes.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Remember buffer / preferences |
| Host access to BookMyShow & District | Content scripts on those pages only |

No booking automation, no account access, no background scraping of other sites.

## Limitations

- **Markup changes** on BMS/District can break selectors; generic fallback still often works on chip-style UIs.
- **Runtimes** are not always on the showtime list → ends may be estimated.
- Best results on a **single theater’s full day list**, not the city-wide explore home page.
- SPA navigation is handled via `MutationObserver` + history hooks; if the panel looks stale, click **Rescan page**.

## Tuning

Toolbar popup (extension icon):

- Default buffer minutes  
- Allow same movie twice  

On-page panel overrides buffer for the current session and persists via `chrome.storage.sync`.

## Development notes

- Manifest V3, no build step — edit JS and click **Reload** on `chrome://extensions`.
- To test the panel on `demo/demo.html` via the extension, add to `content_scripts[0].matches`:

  ```json
  "file:///*"
  ```

  and grant file access on the extension’s details page (“Allow access to file URLs”).

## License

MIT — use and modify freely.
