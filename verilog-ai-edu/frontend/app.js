
const surferFrame = document.getElementById("surfer-frame");
const downloadVcd = document.getElementById("download-vcd");
const reloadSurfer = document.getElementById("reload-surfer");

let currentJobId = null;
let currentSurferUrl = "";

function openSurferViewer(jobId, token) {
  currentJobId = jobId;

  const vcdUrl = `http://127.0.0.1:8001/${token}`;
  currentSurferUrl =
    `https://app.surfer-project.org/?load_url=${encodeURIComponent(vcdUrl)}`;

  surferFrame.src = currentSurferUrl;
}

downloadVcd.addEventListener("click", () => {
  if (currentJobId) {
    window.open(`/waveform/${currentJobId}`, "_blank");
  }
});

reloadSurfer.addEventListener("click", () => {
  if (currentSurferUrl) {
    surferFrame.src = currentSurferUrl;
  }
});
