# YouTube Downloader

A local web-based YouTube video downloader. Runs entirely on your machine — no cloud, no accounts, no tracking. Now built with advanced bypass techniques to unlock 8K (4320p) AV1 streams without requiring authentication.

## Features

- 🎬 **Download up to 8K**: Uses advanced client spoofing (`android_vr`) to bypass YouTube's SABR streaming block, unlocking 4K and 8K AV1 streams out of the box!
- 🔍 **Browse all available formats**: Clear type badges (Video+Audio / Video Only / Audio Only) to help you choose the exact format you want.
- 🔀 **Automatic Audio Merging**: YouTube separates audio and video for high resolutions. This app automatically downloads the best audio and perfectly merges it with your selected high-res video using FFmpeg.
- 🎵 **Extract audio as MP3**: Single-click audio extraction.
- 📊 **Real-time Download Progress**: See live speed, ETA, and download percentages via Server-Sent Events (SSE).
- 🌙 **Premium dark-mode UI**: Sleek, glassmorphism design.
- 🔧 **Sort & Filter**: Easily filter formats by type, container, resolution, and file size.

## Prerequisites

- **Python 3.12+**
- **FFmpeg** (Must be installed and added to your system PATH)

### Installing FFmpeg
- **macOS:** `brew install ffmpeg`
- **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install ffmpeg`
- **Windows:** Download from the [official FFmpeg site](https://ffmpeg.org/download.html), extract, and add the `bin` folder to your Windows Environment Variables.

## Installation

1. Clone or download this project to your machine.
2. Open a terminal (or command prompt) inside the `yt-downloader` folder.
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
1. Paste a YouTube URL into the input field and click **Fetch Formats**.
2. Browse the table of formats. Use the filter chips (All / Video+Audio / Video Only / Audio Only / MP4 / WebM) to find what you need.
3. Choose a download action:
   - **Download Selected:** Downloads the exact format you picked. If it's a "Video Only" format (like 8K), you'll be prompted to automatically download and merge the audio track with it!
   - **Best Quality:** Automatically picks the absolute best video and best audio and merges them.
   - **Best MP4:** The highest quality available specifically in the MP4 container.
   - **Audio Only (MP3):** Extracts the best audio as a high-quality MP3 file.

### Download Location
All files are saved to a folder created automatically on your machine:
```
~/Downloads/YTDownloader/
```

## Project Structure

```
yt-downloader/
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

## License
For personal use only. Not for distribution or commercial use.
