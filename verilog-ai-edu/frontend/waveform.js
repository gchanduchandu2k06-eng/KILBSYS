const waveformSignals = document.getElementById("waveform-signals");
const waveformCanvas = document.getElementById("waveform-canvas");
const waveformMessage = document.getElementById("waveform-message");
const waveformCursorTime = document.getElementById("waveform-cursor-time");
const waveRadixSelect = document.getElementById("wave-radix");
const openWaveformButton = document.getElementById("open-waveform");
const closeWaveformButton = document.getElementById("close-waveform");
const zoomInButton = document.getElementById("wave-zoom-in");
const zoomOutButton = document.getElementById("wave-zoom-out");
const panLeftButton = document.getElementById("wave-pan-left");
const panRightButton = document.getElementById("wave-pan-right");
const fitButton = document.getElementById("wave-fit");
const vcdDownload = document.getElementById("vcd-download");
const waveformOpenArea = document.getElementById("waveform-open-area");

let waveData = null;
let waveView = { start: 0, end: 1 };
let cursorTime = null;

function openWaveformWindow() {
  showPage("waveform");
  drawWaveform();
}

function closeWaveformWindow() {
  showPage("output");
}

function parseVCD(text) {
  const lines = text.split(/\r?\n/);
  const signals = [];
  const signalById = {};
  let currentTime = 0;
  let inDefinitions = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("$scope")) {
      inDefinitions = true;
      continue;
    }

    if (line.startsWith("$enddefinitions")) {
      inDefinitions = false;
      continue;
    }

    if (inDefinitions && line.startsWith("$var")) {
      const parts = line.split(/\s+/);
      const width = parseInt(parts[2], 10);
      const id = parts[3];
      const name = parts[4];

      if (!signalById[id]) {
        const signal = {
          id: id,
          name: name,
          width: width,
          changes: [{ time: 0, value: "x" }]
        };

        signals.push(signal);
        signalById[id] = signal;
      }
      continue;
    }

    if (line.startsWith("#")) {
      currentTime = parseFloat(line.substring(1));
      continue;
    }

    if (line.startsWith("b") || line.startsWith("B")) {
      const spaceIndex = line.indexOf(" ");
      const value = line.substring(1, spaceIndex);
      const id = line.substring(spaceIndex + 1);

      if (signalById[id]) {
        signalById[id].changes.push({ time: currentTime, value: value });
      }
      continue;
    }

    if (/^[01xzXZ]/.test(line)) {
      const value = line[0];
      const id = line.substring(1);

      if (signalById[id]) {
        signalById[id].changes.push({ time: currentTime, value: value });
      }
    }
  }

  let maxTime = 0;

  signals.forEach(function(signal) {
    signal.changes.forEach(function(change) {
      if (change.time > maxTime) maxTime = change.time;
    });
  });

  return { signals: signals, maxTime: maxTime || 1 };
}

function formatValue(value, width, radix) {
  if (!value) return "x";
  if (width === 1) return value;
  if (/[^01]/.test(value)) return value;

  if (radix === 2) return value;

  const decimal = parseInt(value, 2);
  if (isNaN(decimal)) return value;

  if (radix === 10) return decimal.toString(10);
  return "0x" + decimal.toString(16).toUpperCase();
}

function buildSignalList() {
  waveformSignals.innerHTML = "";

  waveData.signals.forEach(function(signal) {
    const row = document.createElement("div");
    row.className = "wave-signal-name";
    row.textContent = signal.name;
    waveformSignals.appendChild(row);
  });
}

function drawWaveform() {
  if (!waveData || !waveformCanvas) return;

  const canvas = waveformCanvas;
  const context = canvas.getContext("2d");

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const bgColor = isDark ? "#0a0a0a" : "#ffffff";
  const rulerBg = isDark ? "#141414" : "#f4f4f4";
  const rulerBorder = isDark ? "#333333" : "#cccccc";
  const rulerText = isDark ? "#999999" : "#555555";
  const gridBorder = isDark ? "#1f1f1f" : "#e5e5e5";
  const waveStroke = isDark ? "#ffffff" : "#000000";
  const textFill = isDark ? "#cccccc" : "#222222";
  const cursorStroke = isDark ? "#ffffff" : "#000000";

  const signals = waveData.signals;
  const rulerHeight = 24;
  const rowHeight = 36;
  const targetHeight = Math.max(160, rulerHeight + Math.max(1, signals.length) * rowHeight);

  canvas.style.height = targetHeight + "px";
  canvas.width = canvas.clientWidth || 800;
  canvas.height = targetHeight;

  const width = canvas.width;
  const height = canvas.height;

  context.fillStyle = bgColor;
  context.fillRect(0, 0, width, height);

  if (signals.length === 0) {
    context.fillStyle = rulerText;
    context.font = "12px sans-serif";
    context.fillText("No signals found in VCD waveform.", 20, 40);
    return;
  }

  const left = 10;
  const right = width - 10;
  const waveWidth = Math.max(right - left, 10);

  const startTime = waveData.maxTime * waveView.start;
  const endTime = waveData.maxTime * waveView.end;
  const timeSpan = Math.max(endTime - startTime, 1);

  // Time ruler background
  context.fillStyle = rulerBg;
  context.fillRect(0, 0, width, rulerHeight);

  context.strokeStyle = rulerBorder;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, rulerHeight);
  context.lineTo(width, rulerHeight);
  context.stroke();

  context.fillStyle = rulerText;
  context.font = "11px monospace";

  for (let i = 0; i <= 10; i++) {
    const fraction = i / 10;
    const x = left + fraction * waveWidth;
    const time = startTime + fraction * timeSpan;

    context.beginPath();
    context.moveTo(x, rulerHeight - 6);
    context.lineTo(x, rulerHeight);
    context.stroke();

    context.fillText(time.toFixed(0) + "ns", x + 2, 15);
  }

  signals.forEach(function(signal, index) {
    const top = rulerHeight + index * rowHeight;
    const middle = top + rowHeight / 2;

    // Grid divider
    context.strokeStyle = gridBorder;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, top);
    context.lineTo(width, top);
    context.stroke();

    const changes = signal.changes;
    const xForTime = function(time) {
      return left + ((time - startTime) / timeSpan) * waveWidth;
    };

    // Digital waveform line (monochrome white or black)
    context.strokeStyle = waveStroke;
    context.lineWidth = 2;
    context.beginPath();

    let previousX = left;
    let previousValue = "x";
    let previousY = middle;

    changes.forEach(function(change) {
      const x = xForTime(change.time);

      if (x < left) {
        previousValue = change.value;
        return;
      }

      const isHigh = previousValue === "1";
      const y = isHigh ? top + 7 : top + rowHeight - 7;

      context.moveTo(previousX, previousY);
      context.lineTo(x, previousY);
      context.lineTo(x, y);

      previousX = x;
      previousY = y;
      previousValue = change.value;
    });

    context.lineTo(right, previousY);
    context.stroke();

    // Value annotations
    context.fillStyle = textFill;
    context.font = "11px monospace";

    changes.forEach(function(change) {
      const x = xForTime(change.time);
      if (x < left || x > right - 10) return;

      const radixVal = waveRadixSelect ? parseInt(waveRadixSelect.value, 10) : 2;
      const label = formatValue(change.value, signal.width, radixVal);
      context.fillText(label, x + 4, top + 14);
    });
  });

  if (cursorTime !== null) {
    const x = left + ((cursorTime - startTime) / timeSpan) * waveWidth;

    if (x >= left && x <= right) {
      context.strokeStyle = cursorStroke;
      context.setLineDash([4, 2]);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, rulerHeight);
      context.lineTo(x, height);
      context.stroke();
      context.setLineDash([]);

      if (waveformCursorTime) {
        waveformCursorTime.textContent = "Cursor: " + cursorTime + "ns";
      }
    }
  }
}

function loadWaveform(url) {
  waveformMessage.textContent = "Loading waveform...";

  const defaultBase = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://127.0.0.1:8000" : "https://kilbsys-1.onrender.com";
  const baseUrl = (window.API_BASE || defaultBase).replace(/\/$/, "");
  fetch(baseUrl + url)
    .then(function(response) {
      if (!response.ok) throw new Error("Waveform request failed");
      return response.text();
    })
    .then(function(vcdText) {
      waveData = parseVCD(vcdText);
      waveView = { start: 0, end: 1 };
      cursorTime = null;

      buildSignalList();
      waveformMessage.textContent = "Waveform loaded. Click the waveform to place a cursor.";
      openWaveformWindow();
      drawWaveform();
    })
    .catch(function(error) {
      waveformMessage.textContent = "Could not load waveform.";
      openWaveformWindow();
    });
}

if (openWaveformButton) openWaveformButton.addEventListener("click", openWaveformWindow);
if (closeWaveformButton) closeWaveformButton.addEventListener("click", closeWaveformWindow);

if (zoomInButton) {
  zoomInButton.addEventListener("click", function() {
    if (!waveData) return;
    const center = (waveView.start + waveView.end) / 2;
    const halfSpan = (waveView.end - waveView.start) / 4;
    waveView.start = Math.max(0, center - halfSpan);
    waveView.end = Math.min(1, center + halfSpan);
    drawWaveform();
  });
}

if (zoomOutButton) {
  zoomOutButton.addEventListener("click", function() {
    if (!waveData) return;
    const center = (waveView.start + waveView.end) / 2;
    const halfSpan = (waveView.end - waveView.start) / 2;
    waveView.start = Math.max(0, center - halfSpan);
    waveView.end = Math.min(1, center + halfSpan);
    drawWaveform();
  });
}

if (panLeftButton) {
  panLeftButton.addEventListener("click", function() {
    if (!waveData) return;
    const span = waveView.end - waveView.start;
    const shift = span * 0.2;
    waveView.start = Math.max(0, waveView.start - shift);
    waveView.end = Math.max(span, waveView.end - shift);
    drawWaveform();
  });
}

if (panRightButton) {
  panRightButton.addEventListener("click", function() {
    if (!waveData) return;
    const span = waveView.end - waveView.start;
    const shift = span * 0.2;
    waveView.start = Math.min(1 - span, waveView.start + shift);
    waveView.end = Math.min(1, waveView.end + shift);
    drawWaveform();
  });
}

if (fitButton) {
  fitButton.addEventListener("click", function() {
    waveView = { start: 0, end: 1 };
    drawWaveform();
  });
}

if (waveRadixSelect) {
  waveRadixSelect.addEventListener("change", drawWaveform);
}

if (waveformCanvas) {
  waveformCanvas.addEventListener("click", function(event) {
    if (!waveData) return;

    const rect = waveformCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;

    const left = 10;
    const right = waveformCanvas.clientWidth - 10;
    const waveWidth = right - left;

    const startTime = waveData.maxTime * waveView.start;
    const endTime = waveData.maxTime * waveView.end;

    cursorTime = Math.round(startTime + ((x - left) / waveWidth) * (endTime - startTime));
    drawWaveform();
  });
}

window.addEventListener("resize", function() {
  if (waveData && waveformCanvas) drawWaveform();
});

window.renderVcdOnCanvas = function(vcdText) {
  try {
    waveData = parseVCD(vcdText);
    waveView = { start: 0, end: 1 };
    cursorTime = null;
    buildSignalList();
    if (waveformMessage) waveformMessage.textContent = "Waveform loaded. Click canvas to inspect values.";
    drawWaveform();
  } catch (err) {
    console.error("Canvas VCD render error:", err);
    if (waveformMessage) waveformMessage.textContent = "Could not render VCD on canvas.";
  }
};
