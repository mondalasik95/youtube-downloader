@echo off
setlocal
echo ==========================================
echo      YouTube Downloader - Windows Setup
echo ==========================================
echo.

echo [1/4] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Python is not installed or not in PATH. Please install Python 3.12+ from python.org
    pause
    exit /b 1
) else (
    for /f "tokens=2" %%I in ('python --version 2^>^&1') do echo   [+] Python %%I found.
)

echo.
echo [2/4] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] FFmpeg is not installed or not in PATH. Please download FFmpeg and add it to your system PATH.
    pause
    exit /b 1
) else (
    echo   [+] FFmpeg found.
)

echo.
echo [3/4] Installing Python dependencies...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt
python -m pip install --quiet sse-starlette
if %errorlevel% neq 0 (
    echo [X] Failed to install dependencies.
    pause
    exit /b 1
) else (
    echo   [+] All dependencies installed.
)

echo.
echo [4/4] Checking yt-dlp...
python -c "import yt_dlp" >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] yt-dlp import failed.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%I in ('python -c "import yt_dlp; print(yt_dlp.version.__version__)"') do echo   [+] yt-dlp %%I found.
)

echo.
echo ==========================================
echo  Setup complete!
echo ==========================================
echo To start the server, run:
echo   python main.py
echo Then open your browser to: http://localhost:8000
echo.
pause
