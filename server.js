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

// 🔄 SSE for real-time track updates
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

// 🆕 New endpoint to get track count
app.post("/playlist-info", async (req, res) => {
  const playlistUrl = req.body.url;

  if (!playlistUrl || !playlistUrl.includes("/playlist/")) {
    return res.status(400).json({ error: "Invalid Spotify playlist URL" });
  }

  const playlistIdPart = playlistUrl.split("/playlist/")[1];
  const playlistId = playlistIdPart.split("?")[0];

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
      const items = data.body.items;
      allTracks = allTracks.concat(items);
      if (items.length < limit) break;
      offset += limit;
    }

    res.json({ total: allTracks.length });
  } catch (err) {
    console.error("Error fetching playlist info:", err.message);
    res.status(500).json({ error: "Failed to fetch playlist information." });
  }
});

// ❌ Cancel endpoint
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

// 🎧 Main download endpoint
app.post("/download", async (req, res) => {
  const playlistUrl = req.body.url;

  if (!playlistUrl || !playlistUrl.includes("/playlist/")) {
    return res.status(400).json({ error: "Invalid Spotify playlist URL" });
  }

  const playlistIdPart = playlistUrl.split("/playlist/")[1];
  const playlistId = playlistIdPart.split("?")[0];
  const playlistName = playlistId;
  const sessionId = uuidv4();

  downloadSessions[sessionId] = { canceled: false };
  res.setHeader("X-Session-ID", sessionId);

  console.log(
    `🎬 Started download session: ${sessionId} for playlist ${playlistName}`
  );

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
      const items = data.body.items;
      allTracks = allTracks.concat(items);
      if (items.length < limit) break;
      offset += limit;
    }

    const downloadDir = path.join(__dirname, "downloads", playlistName);
    fs.mkdirSync(downloadDir, { recursive: true });

    for (let i = 0; i < allTracks.length; i++) {
      if (downloadSessions[sessionId]?.canceled) {
        console.log("⛔ Download canceled mid-process.");
        break;
      }

      const track = allTracks[i].track;
      const songName = `${track.name} - ${track.artists[0].name}`;
      const filePath = path.join(
        downloadDir,
        sanitizeFilename(songName) + ".mp3"
      );
      const albumImageUrl = track.album.images[0]?.url;

      console.log(`🎧 Downloading: ${songName}`);
      broadcast({ track: songName });

      await new Promise((resolve) => {
        const yt = spawn("yt-dlp", [
          `ytsearch1:${songName}`,
          "--extract-audio",
          "--audio-format",
          "mp3",
          "-o",
          filePath,
        ]);

        yt.on("close", (code) => {
          if (code === 0) {
            embedThumbnail(filePath, albumImageUrl)
              .then(() => resolve())
              .catch(() => resolve());
          } else {
            console.log(`❌ Failed: ${songName}`);
            resolve();
          }
        });
      });
    }

    if (downloadSessions[sessionId]?.canceled) {
      delete downloadSessions[sessionId];
      fs.rmSync(downloadDir, { recursive: true, force: true });
      return;
    }

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
      if (file.endsWith(".mp3")) {
        archive.file(path.join(downloadDir, file), { name: file });
      }
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
  return name.replace(/[/\\?%*:|"<>]/g, "-");
}

async function embedThumbnail(filePath, imageUrl) {
  if (!imageUrl) return;
  const imageBuffer = await axios
    .get(imageUrl, { responseType: "arraybuffer" })
    .then((res) => res.data);

  const tags = {
    image: {
      mime: "image/jpeg",
      type: 3,
      description: "Cover",
      imageBuffer: imageBuffer,
    },
  };

  NodeID3.write(tags, filePath);
}

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
