#!/usr/bin/env bash
# ==========================================================================
# YouTube Downloader — Setup Script for macOS
# ==========================================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     YouTube Downloader — Setup           ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# --------------------------------------------------------------------------
# 1. Python check
# --------------------------------------------------------------------------
echo -e "${BOLD}[1/4] Checking Python…${NC}"

if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 12 ]; then
        echo -e "  ${GREEN}✔${NC} Python $PY_VERSION found"
    else
        echo -e "  ${YELLOW}⚠${NC} Python $PY_VERSION found (3.12+ recommended)"
    fi
else
    echo -e "  ${RED}✗${NC} Python 3 not found. Please install Python 3.12+ (e.g. via brew, apt, or python.org)"
    exit 1
fi

# --------------------------------------------------------------------------
# 2. FFmpeg check
# --------------------------------------------------------------------------
echo -e "${BOLD}[2/4] Checking FFmpeg…${NC}"

if command -v ffmpeg &>/dev/null; then
    FF_VERSION=$(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')
    echo -e "  ${GREEN}✔${NC} FFmpeg $FF_VERSION found"
else
    echo -e "  ${RED}✗${NC} FFmpeg not found."
    echo -e "  Please install FFmpeg (e.g. via ${BOLD}brew install ffmpeg${NC} on macOS or ${BOLD}apt install ffmpeg${NC} on Linux)"
    exit 1
fi

# --------------------------------------------------------------------------
# 3. Install Python dependencies
# --------------------------------------------------------------------------
echo -e "${BOLD}[3/4] Installing Python dependencies…${NC}"

python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet -r requirements.txt

# Check for sse-starlette (required for SSE endpoints)
python3 -m pip install --quiet sse-starlette

echo -e "  ${GREEN}✔${NC} All dependencies installed"

# --------------------------------------------------------------------------
# 4. Verify yt-dlp
# --------------------------------------------------------------------------
echo -e "${BOLD}[4/4] Checking yt-dlp…${NC}"

if python3 -c "import yt_dlp" 2>/dev/null; then
    YT_VERSION=$(python3 -c "import yt_dlp; print(yt_dlp.version.__version__)")
    echo -e "  ${GREEN}✔${NC} yt-dlp $YT_VERSION found"
else
    echo -e "  ${RED}✗${NC} yt-dlp import failed"
    exit 1
fi

# --------------------------------------------------------------------------
# Done
# --------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}✅ Setup complete!${NC}"
echo ""
echo -e "Run the application with:"
echo -e "  ${BOLD}python3 main.py${NC}"
echo ""
echo -e "Then open: ${BOLD}http://localhost:8000${NC}"
echo ""
