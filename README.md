# YouTube Downloader

A local web-based YouTube video downloader. Runs entirely on your machine — no cloud, no accounts, no tracking. Now built with advanced bypass techniques to unlock 8K (4320p) AV1 streams without requiring authentication.

## Features

- 🎬 **Download up to 8K**: Uses advanced client spoofing (`android_vr`) to bypass YouTube's SABR streaming block, unlocking 4K and 8K AV1 streams out of the box!
- 🔍 **Native YouTube Search**: Just type a query directly into the URL bar to search and browse YouTube without leaving the app!
- ✂️ **Video Clipping**: Download exact segments of a video by specifying a start and end time (e.g. `00:01:00`).
- 📝 **Subtitle Embedding**: Automatically fetch and burn English or auto-generated subtitles directly into your video files.
- 🖼️ **Thumbnail & Metadata Magic**: Every downloaded MP4 and MP3 automatically receives the official YouTube thumbnail embedded as its Cover Art!
- 🗂️ **Download History Gallery**: Your downloads are saved chronologically by date in a sleek gallery, allowing for single-click redownloads.
- 📂 **Full Playlist Support**: Paste a playlist URL to view all videos and bulk-queue them for background downloading!
- ⏹ **Instant Cancel**: Safely abort any running download and FFmpeg conversion instantly.
- 🔀 **Automatic Audio Merging**: YouTube separates audio and video for high resolutions. This app automatically downloads the best audio and perfectly merges it with your selected high-res video using FFmpeg.
- 🎵 **Extract audio as MP3**: Single-click audio extraction.
- 📊 **Real-time Download Progress**: See live speed, ETA, and download percentages via Server-Sent Events (SSE).
- 🌙 **Premium dark-mode UI**: Sleek, glassmorphism design.

## Prerequisites

- **Python 3.12+**
- **FFmpeg** (Must be installed and added to your system PATH)

### Installing FFmpeg
- **macOS:** `brew install ffmpeg`
- **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install ffmpeg`
- **Windows:** Download from the [official FFmpeg site](https://ffmpeg.org/download.html), extract, and add the `bin` folder to your Windows Environment Variables.

## Installation

1. Clone or download this project to your machine.
2. Open a terminal (or command prompt) inside the `youtube-downloader` folder.
3. Run the setup script for your operating system:

**macOS / Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
Double-click `setup.bat` or run it from the command prompt:
```cmd
setup.bat
```

The setup script will automatically install all Python dependencies (including FastAPI, uvicorn, and yt-dlp) and verify your environment.

## Usage

Start the backend server:
```bash
python3 main.py
```
*(On Windows, you may need to type `python main.py`)*

Open your browser to: **http://localhost:8000**

### Workflow
1. **Fetch or Search**: Paste a YouTube URL (Video or Playlist) into the input field, OR simply type a search query (e.g. "Cyberpunk Trailer") and click **Search / Fetch**.
2. **Advanced Options**: Enter a clip start/end time or check the "Embed Subtitles" box before starting a download.
3. **Choose an Action**:
   - **Download Selected:** Downloads the exact format you picked from the table.
   - **Best Quality:** Automatically picks the absolute best video and best audio and merges them.
   - **Best MP4:** The highest quality available specifically in the MP4 container.
   - **Audio Only (MP3):** Extracts the best audio as a high-quality MP3 file.
   - **Download Selected Playlist Videos**: If viewing a playlist, sequentially queue and download all checked videos in the background.

### Download Location
All files are saved to a folder created automatically on your machine:
```
~/Downloads/YTDownloader/
```

## Project Structure

```
youtube-downloader/
├── main.py           # FastAPI server + backend logic
├── downloader.py     # yt-dlp wrapper (metadata, download, merge logic)
├── models.py         # Pydantic data models
├── static/
│   ├── index.html    # Single-page UI layout
│   ├── style.css     # CSS styling and dark mode
│   └── app.js        # Frontend logic and SSE handlers
├── requirements.txt  # Python package list
├── setup.sh          # Setup script for Mac/Linux
├── setup.bat         # Setup script for Windows
└── README.md         # This file
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **FFmpeg not found** | Ensure FFmpeg is installed and added to your system's PATH variable. |
| **8K Formats Missing** | The app already uses `android_vr` to bypass blocks. If they ever break, run `pip install --upgrade yt-dlp` to get the latest patches. |
| **Port 8000 in use** | Stop whatever is running on port 8000, or modify the port at the bottom of `main.py`. |

## Acknowledgments
This project is built upon the shoulders of giants. Special thanks to:
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** for the incredibly powerful media extraction engine.
- **[FFmpeg](https://ffmpeg.org/)** for the flawless audio and video merging capabilities.
- **[FastAPI](https://fastapi.tiangolo.com/)** for providing a lightning-fast Python web framework.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Disclaimer
Users are responsible for complying with YouTube's Terms of Service and applicable copyright laws. This project is provided for educational and personal-use purposes only.
