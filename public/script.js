let eventSource = null;
let downloadCanceled = false;
let currentSessionId = null;

let downloadedCount = 0;
let totalTracks = 0;

const downloadBtn = document.getElementById("download-button");
const cancelBtn = document.getElementById("cancel-button");
const trackPanel = document.getElementById("track-panel");
const trackList = document.getElementById("track-list");
const progressElement = document.getElementById("progress");
const counterElement = document.getElementById("counter");

document
  .getElementById("download-form")
  .addEventListener("submit", function (event) {
    event.preventDefault();
    downloadCanceled = false;

    const url = document.getElementById("playlist-url").value;
    trackList.innerHTML = "";
    progressElement.textContent = "⏳ Fetching playlist info...";
    progressElement.style.color = "#1db954";
    counterElement.classList.add("hidden");

    // UI setup
    downloadBtn.style.display = "none";
    cancelBtn.style.display = "block";
    document.body.classList.add("downloading");
    trackPanel.classList.add("active");

    // Step 1: get total track count
    fetch("/playlist-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((res) => res.json())
      .then((data) => {
        totalTracks = data.total || 0;
        counterElement.textContent = `0 / ${totalTracks}`;
        counterElement.classList.remove("hidden");

        // Step 2: start actual download
        startDownload(url);
      })
      .catch((err) => {
        progressElement.textContent = "❌ Failed to fetch playlist info.";
        progressElement.style.color = "#ff4c4c";
        resetUI();
        console.error(err);
      });
  });

function startDownload(url) {
  eventSource = new EventSource("/events");

  eventSource.onmessage = (event) => {
    if (downloadCanceled) return;
    const data = JSON.parse(event.data);
    if (data.track) {
      downloadedCount++;
      const li = document.createElement("li");
      li.textContent = data.track;
      li.style.setProperty("--delay", `${downloadedCount * 0.04}s`);
      trackList.appendChild(li);
      counterElement.textContent = `${downloadedCount} / ${totalTracks}`;
    }
  };

  fetch("/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
    .then((response) => {
      if (!response.ok) throw new Error("Failed to start download.");
      currentSessionId = response.headers.get("X-Session-ID");
      return response.blob();
    })
    .then((blob) => {
      if (downloadCanceled) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "playlist.zip";
      link.click();
      progressElement.textContent = "✅ Download complete!";
      resetUI();
    })
    .catch((error) => {
      if (!downloadCanceled) {
        progressElement.textContent = "❌ Error: " + error.message;
        progressElement.style.color = "#ff4c4c";
        resetUI();
      }
    });
}

cancelBtn.addEventListener("click", () => {
  downloadCanceled = true;
  eventSource?.close();
  progressElement.textContent = "⛔ Download canceled.";
  resetUI();

  if (currentSessionId) {
    fetch("/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId }),
    });
  }
});

function resetUI() {
  downloadBtn.style.display = "block";
  cancelBtn.style.display = "none";
  document.body.classList.remove("downloading");
  trackPanel.classList.remove("active");
  counterElement.classList.add("hidden");
  downloadedCount = 0;
  totalTracks = 0;
}
