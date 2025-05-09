Here's your full, polished `README.md` with your actual screenshots embedded and everything ready for one-time copy-paste into your GitHub repo:

---

```markdown
# 🎵 Spotify Playlist Downloader

A modern web app that allows you to download any public **Spotify playlist** as a ZIP of MP3 files. Tracks are fetched via Spotify API and downloaded using `yt-dlp`, complete with album art thumbnails embedded in the MP3 metadata.

🔗 GitHub Repo: [github.com/Abhishek9589/spotidown](https://github.com/Abhishek9589/spotidown)

---

## ✨ Features

- 🎧 Download entire Spotify playlists as high-quality MP3s
- 🖼️ Automatically fetch and embed album cover art
- 📦 Generates a ZIP file for easy download
- 🎛️ Real-time progress UI with animations and track previews
- ❌ Cancel download at any time
- 🚀 Clean, dark-themed interface with animated track list

---

## 📁 Folder Structure
```

spotidown/
│
├── server.js # Node.js backend server
├── .env # Contains Spotify API credentials
├── /public
│ ├── index.html # Frontend HTML
│ ├── script.js # Frontend JavaScript logic
│ └── styles.css # Styling and animations

````

---

## ⚙️ Installation & Setup

### 1. Prerequisites

Make sure the following tools are installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) – install via:
  ```bash
  pip install -U yt-dlp
````

- [ffmpeg](https://ffmpeg.org/download.html) – ensure it's in your system PATH
- A [Spotify Developer Account](https://developer.spotify.com/) to obtain your API credentials

---

### 2. Clone the Repository

```bash
git clone https://github.com/Abhishek9589/spotidown.git
cd spotidown
```

---

### 3. Install Dependencies

```bash
npm install
```

---

### 4. Set up Environment Variables

Create a `.env` file in the root directory with your Spotify API credentials:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

---

## 🚀 Running the App

```bash
node server.js
```

Then open your browser and go to:

```
http://localhost:3000
```

---

## 🖥️ Screenshots

### 🔹 Initial UI

![Initial UI](./public/screenshots/home.png)

### 🔹 Downloading Playlist with Live Progress

![Downloading UI](./public/screenshots/downloading.png)

> Place these images in a `public/screenshots/` folder and name them `home.png` and `downloading.png` respectively.

---

## 🧩 Dependencies

- **express** – Web server
- **spotify-web-api-node** – Spotify API wrapper
- **yt-dlp** – Audio downloader from YouTube
- **archiver** – Zips the files
- **node-id3** – Embeds album art in MP3 files
- **axios** – For image fetching
- **dotenv** – Environment variable management

---

## 🛠️ How It Works

1. User enters a **Spotify playlist URL**
2. Tracks are fetched using the Spotify API
3. Each track is searched on YouTube via `yt-dlp`
4. MP3 audio is downloaded and album art embedded
5. Tracks are zipped and offered for download
6. Any failed downloads are logged in a `.txt` inside the ZIP

---

## ❗ Notes

- Only **public Spotify playlists** are supported
- Tracks without YouTube matches may be skipped
- A `.txt` file will be added to the ZIP for any failed downloads
- Ensure `yt-dlp` and `ffmpeg` are available globally

---

## 📄 License

MIT © 2025

---

Made with ❤️ by [Abhishek9589](https://github.com/Abhishek9589)

```

```
# spotidown
# spotify
