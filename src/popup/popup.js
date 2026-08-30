const bufferEl = document.getElementById("buffer");
const rewatchEl = document.getElementById("rewatch");
const statusEl = document.getElementById("status");

function showStatus(text) {
  statusEl.hidden = false;
  statusEl.textContent = text;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusEl.hidden = true;
  }, 1500);
}

chrome.storage.sync.get({ bufferMinutes: 15, allowRewatch: false }, (data) => {
  bufferEl.value = data.bufferMinutes;
  rewatchEl.checked = data.allowRewatch;
});

function persist() {
  const bufferMinutes = Math.min(
    60,
    Math.max(0, parseInt(bufferEl.value, 10) || 0)
  );
  chrome.storage.sync.set(
    {
      bufferMinutes,
      allowRewatch: rewatchEl.checked,
    },
    () => showStatus("Saved")
  );
}

bufferEl.addEventListener("change", persist);
rewatchEl.addEventListener("change", persist);
