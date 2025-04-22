const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const archiver = require("archiver");
const SpotifyWebApi = require("spotify-web-api-node");
const NodeID3 = require("node-id3");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
const port = 3000;
const clients = [];
const downloadSessions = {};

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

app.use(express.json());
app.use(express.static("public"));

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  clients.push(res);
  req.on("close", () => {
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
  });
});

function broadcast(message) {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  clients.forEach((res) => res.write(data));
}

app.post("/playlist-info", async (req, res) => {
  const playlistUrl = req.body.url;
  if (!playlistUrl || !playlistUrl.includes("/playlist/")) {
    return res.status(400).json({ error: "Invalid Spotify playlist URL" });
  }
  const playlistId = playlistUrl.split("/playlist/")[1].split("?")[0];
  try {
    const auth = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(auth.body["access_token"]);
    let offset = 0;
    const limit = 50;
    let allTracks = [];
    while (true) {
      const data = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit,
      });
      allTracks = allTracks.concat(data.body.items);
      if (data.body.items.length < limit) break;
      offset += limit;
    }
    res.json({ total: allTracks.length });
  } catch (err) {
    console.error("Error fetching playlist info:", err.message);
    res.status(500).json({ error: "Failed to fetch playlist information." });
  }
});

app.post("/cancel", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && downloadSessions[sessionId]) {
    downloadSessions[sessionId].canceled = true;
    console.log(`🛑 Session ${sessionId} marked as canceled`);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Invalid session ID" });
  }
});

app.post("/download", async (req, res) => {
  const playlistUrl = req.body.url;
  if (!playlistUrl || !playlistUrl.includes("/playlist/")) {
    return res.status(400).json({ error: "Invalid Spotify playlist URL" });
  }

  const playlistId = playlistUrl.split("/playlist/")[1].split("?")[0];
  const playlistName = playlistId;
  const sessionId = uuidv4();
  downloadSessions[sessionId] = { canceled: false };
  res.setHeader("X-Session-ID", sessionId);
  console.log(`🎬 Started download session: ${sessionId} for playlist ${playlistName}`);

  const failedDownloads = [];

  try {
    const auth = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(auth.body["access_token"]);

    let offset = 0;
    const limit = 50;
    let allTracks = [];
    while (true) {
      const data = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit,
      });
      allTracks = allTracks.concat(data.body.items);
      if (data.body.items.length < limit) break;
      offset += limit;
    }

    const downloadDir = path.join(__dirname, "downloads", playlistName);
    fs.mkdirSync(downloadDir, { recursive: true });

    const seen = new Set();
    const queue = [];

    for (const { track } of allTracks) {
      const songName = `${track.name} - ${track.artists[0].name}`;
      if (!seen.has(songName)) {
        seen.add(songName);
        queue.push(() => downloadTrack(track, downloadDir, sessionId, failedDownloads));
      }
    }

    async function runInBatches(tasks, concurrency = 10) {
      const results = [];
      let index = 0;
      async function next() {
        if (index >= tasks.length) return;
        const task = tasks[index++];
        await task();
        await next();
      }
      const runners = [];
      for (let i = 0; i < concurrency; i++) {
        runners.push(next());
      }
      await Promise.all(runners);
    }

    await runInBatches(queue);

    if (downloadSessions[sessionId]?.canceled) {
      delete downloadSessions[sessionId];
      fs.rmSync(downloadDir, { recursive: true, force: true });
      return;
    }

    // Write failed download list if needed
    if (failedDownloads.length > 0) {
      const failedPath = path.join(downloadDir, "FAILED_DOWNLOADS.txt");
      fs.writeFileSync(failedPath, failedDownloads.join("\n"));
    }

    // DEBUG: Check final files
    console.log("✅ Files in download directory before zipping:", fs.readdirSync(downloadDir));

    const zipPath = path.join(__dirname, `${playlistName}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      fs.rmSync(downloadDir, { recursive: true, force: true });
      res.download(zipPath, `${playlistName}.zip`, () => {
        fs.rmSync(zipPath);
      });
    });

    archive.on("error", (err) => {
      console.error("Zip error:", err);
      res.status(500).json({ error: "Failed to create zip file" });
    });

    archive.pipe(output);
    fs.readdirSync(downloadDir).forEach((file) => {
      archive.file(path.join(downloadDir, file), { name: file });
    });
    archive.finalize();
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: "Server error: " + err.message });
  } finally {
    delete downloadSessions[sessionId];
  }
});

function sanitizeFilename(name) {
  return name.replace(/[\/\\?%*:|"<>]/g, "-");
}

async function downloadTrack(track, downloadDir, sessionId, failedDownloads) {
  if (downloadSessions[sessionId]?.canceled) return;
  const songName = `${track.name} - ${track.artists[0].name}`;
  const albumImageUrl = track.album.images[0]?.url;
  console.log(`🎧 Downloading: ${songName}`);
  broadcast({ track: songName, image: albumImageUrl });

  return new Promise((resolve) => {
    const yt = spawn("yt-dlp", [
      `ytsearch1:${songName}`,
      "--extract-audio",
      "--audio-format", "mp3",
      "-o", path.join(downloadDir, "%(title)s.%(ext)s")
    ]);

    yt.on("close", (code) => {
      if (code === 0) {
        const files = fs.readdirSync(downloadDir);
        const mp3File = files.find(
          (f) => f.endsWith(".mp3") && f.toLowerCase().includes(track.name.toLowerCase())
        );

        if (mp3File) {
          const fullPath = path.join(downloadDir, mp3File);
          embedMetadata(fullPath, track, albumImageUrl).then(resolve).catch(resolve);
        } else {
          console.log(`❌ No MP3 file found for ${songName}`);
          failedDownloads.push(songName);
          resolve();
        }
      } else {
        console.log(`❌ yt-dlp failed: ${songName}`);
        failedDownloads.push(songName);
        resolve();
      }
    });
  });
}

async function embedMetadata(filePath, track, imageUrl) {
  const imageBuffer = imageUrl
    ? await axios.get(imageUrl, { responseType: "arraybuffer" }).then(res => res.data)
    : null;

  const tags = {
    title: track.name,
    artist: track.artists.map(a => a.name).join(", "),
    album: track.album.name,
    albumArtist: track.album.artists.map(a => a.name).join(", "),
    genre: track.album.genres?.[0] || "",
    year: new Date(track.album.release_date).getFullYear().toString(),
    trackNumber: track.track_number?.toString(),
    partOfSet: track.disc_number?.toString(),
    image: imageBuffer
      ? {
          mime: "image/jpeg",
          type: { id: 3, name: "front cover" },
          description: "Cover",
          imageBuffer
        }
      : undefined
  };

  NodeID3.write(tags, filePath);
}

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
