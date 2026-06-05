/**
 * YouTube Downloader — Frontend Application Logic
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allFormats = [];
let selectedFormatId = null;
let currentUrl = '';
let activeFilter = 'all';
let activeSort = 'resolution_desc';
let progressSource = null;
let currentVideoInfo = null;
let currentPlaylistEntries = [];
let isDownloadingQueue = false;
let currentTaskId = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

// Tabs
const tabDownloader = $('tab-downloader');
const tabHistory = $('tab-history');
const viewDownloader = $('view-downloader');
const viewHistory = $('view-history');
const historyGallery = $('history-gallery');

const urlInput = $('url-input');
const fetchBtn = $('fetch-btn');
const fetchBtnText = $('fetch-btn-text');
const fetchSpinner = $('fetch-spinner');
const depBanner = $('dep-banner');

// Advanced
const startTimeInput = $('start-time');
const endTimeInput = $('end-time');
const embedSubtitlesCheck = $('embed-subtitles');

const videoInfoSection = $('video-info-section');
const videoThumbnail = $('video-thumbnail');
const videoTitle = $('video-title');
const videoChannel = $('video-channel');
const videoDuration = $('video-duration');
const videoViews = $('video-views');
const videoViewsItem = $('video-views-item');

// Playlist
const playlistInfoSection = $('playlist-info-section');
const playlistTitle = $('playlist-title');
const playlistCount = $('playlist-count');
const playlistUl = $('playlist-ul');
const btnDownloadPlaylist = $('btn-download-playlist');

// Search Results
const searchResultsSection = $('search-results-section');
const searchResultsCount = $('search-results-count');
const searchResultsGrid = $('search-results-grid');

const formatsSection = $('formats-section');
const formatCount = $('format-count');
const formatsTbody = $('formats-tbody');
const filtersBar = $('filters-bar');
const sortSelect = $('sort-select');

const actionsSection = $('actions-section');
const btnDownloadSelected = $('btn-download-selected');
const btnDownloadBest = $('btn-download-best');
const btnDownloadMp4 = $('btn-download-mp4');
const btnDownloadAudio = $('btn-download-audio');

const progressSection = $('progress-section');
const progressStatus = $('progress-status');
const progressPercentage = $('progress-percentage');
const progressBar = $('progress-bar');
const progressSpeed = $('progress-speed');
const progressEta = $('progress-eta');
const progressDlStatus = $('progress-dl-status');
const progressMessage = $('progress-message');
const progressComplete = $('progress-complete');
const progressCompleteText = $('progress-complete-text');
const progressError = $('progress-error');
const progressErrorText = $('progress-error-text');
const btnCancelDownload = $('btn-cancel-download');

const mergeModal = $('merge-modal');
const mergeBtnVideoOnly = $('merge-btn-video-only');
const mergeBtnMerge = $('merge-btn-merge');

const errorToast = $('error-toast');
const errorToastMessage = $('error-toast-message');
const errorToastClose = $('error-toast-close');

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  checkDependencies();
  setupEventListeners();
});

async function checkDependencies() {
  try {
    const res = await fetch('/api/check-deps');
    const data = await res.json();
    const issues = [];
    if (!data.ffmpeg) issues.push('FFmpeg is not installed. Run: brew install ffmpeg');
    if (!data.ytdlp) issues.push('yt-dlp is not available.');
    if (issues.length > 0) {
      depBanner.textContent = '⚠️ ' + issues.join(' | ');
      depBanner.classList.add('visible');
    }
  } catch {
    // Server might not be up yet
  }
}

function setupEventListeners() {
  tabDownloader.addEventListener('click', () => switchTab('downloader'));
  tabHistory.addEventListener('click', () => switchTab('history'));

  fetchBtn.addEventListener('click', handleFetch);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetch();
  });

  filtersBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    filtersBar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderFormats();
  });

  sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    renderFormats();
  });

  btnDownloadSelected.addEventListener('click', handleDownloadSelected);
  btnDownloadBest.addEventListener('click', () => startDownload('best'));
  btnDownloadMp4.addEventListener('click', () => startDownload('best_mp4'));
  btnDownloadAudio.addEventListener('click', () => startDownload('audio_only'));
  
  btnDownloadPlaylist.addEventListener('click', downloadPlaylistQueue);
  
  btnCancelDownload.addEventListener('click', async () => {
    if (!currentTaskId) return;
    btnCancelDownload.disabled = true;
    btnCancelDownload.textContent = "Cancelling...";
    try {
      await fetch(`/api/download/cancel/${currentTaskId}`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  });

  mergeBtnVideoOnly.addEventListener('click', () => {
    closeMergeModal();
    startDownload('selected', selectedFormatId);
  });
  mergeBtnMerge.addEventListener('click', () => {
    closeMergeModal();
    startDownload('merge', selectedFormatId);
  });

  errorToastClose.addEventListener('click', hideError);
  mergeModal.addEventListener('click', (e) => {
    if (e.target === mergeModal) closeMergeModal();
  });
}

// ---------------------------------------------------------------------------
// Tabs & History
// ---------------------------------------------------------------------------

function switchTab(tab) {
  if (tab === 'downloader') {
    tabDownloader.classList.add('active');
    tabHistory.classList.remove('active');
    viewDownloader.style.display = 'block';
    viewHistory.style.display = 'none';
  } else {
    tabHistory.classList.add('active');
    tabDownloader.classList.remove('active');
    viewDownloader.style.display = 'none';
    viewHistory.style.display = 'block';
    loadHistory();
  }
}

async function loadHistory() {
  historyGallery.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch('/api/history');
    const groupedData = await res.json();
    if (groupedData.length === 0) {
      historyGallery.innerHTML = '<p style="color:var(--text-muted)">No downloads yet.</p>';
      return;
    }
    historyGallery.innerHTML = '';
    
    groupedData.forEach(group => {
      // Date Header
      const header = document.createElement('h3');
      header.className = 'history-date-header';
      
      // Convert YYYY-MM-DD to DD-MM-YYYY for display
      const [year, month, day] = group.date.split('-');
      header.textContent = `${day}-${month}-${year}`;
      
      historyGallery.appendChild(header);
      
      // Grid Container
      const grid = document.createElement('div');
      grid.className = 'history-gallery-grid';
      
      group.items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-card';
        el.innerHTML = `
          <img src="${item.thumbnail}" alt="Thumbnail" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22><rect width=%2216%22 height=%229%22 fill=%22%23222%22/></svg>'">
          <div class="history-card-body">
            <div class="history-card-title">${escapeHtml(item.title)}</div>
            <div class="history-card-meta">${escapeHtml(item.download_date)}</div>
            <button class="btn btn-sm btn-primary redownload-btn" data-url="${escapeHtml(item.url)}" style="margin-top: 10px; width: 100%;">
              ⬇ Redownload
            </button>
          </div>
        `;
        
        // Attach redownload click
        el.querySelector('.redownload-btn').addEventListener('click', (e) => {
          const url = e.target.dataset.url;
          urlInput.value = url;
          switchTab('downloader');
          handleFetch(); // Auto-fetch
        });
        
        grid.appendChild(el);
      });
      
      historyGallery.appendChild(grid);
    });
  } catch (err) {
    historyGallery.innerHTML = '<p style="color:red">Failed to load history.</p>';
  }
}

// ---------------------------------------------------------------------------
// Fetch video info
// ---------------------------------------------------------------------------

async function handleFetch() {
  const inputVal = urlInput.value.trim();
  if (!inputVal) {
    showError('Please enter a YouTube URL or search query.');
    return;
  }
  
  let url = inputVal;
  if (!isValidYouTubeUrl(url)) {
    url = `ytsearch20:${url}`;
  }

  currentUrl = url;
  setFetchLoading(true);
  hideAllSections();

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: { error: 'Unknown error' } }));
      const detail = err.detail || err;
      throw new Error(detail.error || 'Failed to fetch video information');
    }

    const data = await res.json();
    
    if (data.extractor === 'youtube:search' || data.id?.startsWith('ytsearch')) {
      displaySearchResults(data);
      showSearchResultsSection();
    } else if (data.entries) {
      // Playlist
      displayPlaylistInfo(data);
      currentPlaylistEntries = data.entries;
      showPlaylistSections();
    } else {
      // Single Video
      currentVideoInfo = data;
      displayVideoInfo(data);
      allFormats = data.formats || [];
      selectedFormatId = null;
      btnDownloadSelected.disabled = true;
      renderFormats();
      showSections();
    }
  } catch (err) {
    showError(err.message || 'Failed to fetch video information');
  } finally {
    setFetchLoading(false);
  }
}

function isValidYouTubeUrl(url) {
  const patterns = [
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/playlist\?list=[\w-]+/,
    /^(https?:\/\/)?youtu\.be\/[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
    /^(https?:\/\/)?m\.youtube\.com\/watch\?v=[\w-]+/,
  ];
  return patterns.some(p => p.test(url));
}

function setFetchLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtnText.textContent = loading ? 'Fetching…' : 'Search / Fetch';
  fetchSpinner.style.display = loading ? 'inline-block' : 'none';
}

// ---------------------------------------------------------------------------
// Display Info
// ---------------------------------------------------------------------------

function displayVideoInfo(data) {
  videoThumbnail.src = data.thumbnail || '';
  videoThumbnail.alt = data.title || 'Video thumbnail';
  videoTitle.textContent = data.title || 'Unknown';
  videoChannel.textContent = data.channel || 'Unknown';
  videoDuration.textContent = data.duration_string || '0:00';

  if (data.view_count != null) {
    videoViews.textContent = formatNumber(data.view_count) + ' views';
    videoViewsItem.style.display = 'flex';
  } else {
    videoViewsItem.style.display = 'none';
  }
}

function displayPlaylistInfo(data) {
  playlistTitle.textContent = data.title || "Playlist";
  playlistCount.textContent = `Found ${data.entries.length} videos`;
  playlistUl.innerHTML = '';
  
  data.entries.forEach((v, i) => {
    const li = document.createElement('li');
    li.className = 'playlist-li';
    li.innerHTML = `
      <input type="checkbox" class="playlist-cb" value="${i}" checked>
      <img src="${v.thumbnail || ''}" alt="thumb">
      <div class="playlist-li-title">${escapeHtml(v.title || v.id)}</div>
      <div style="font-size:0.85rem;color:var(--text-muted)">${v.duration_string || ''}</div>
    `;
    playlistUl.appendChild(li);
  });
}

function displaySearchResults(data) {
  searchResultsCount.textContent = `Showing top ${data.entries.length} results`;
  searchResultsGrid.innerHTML = '';
  
  data.entries.forEach(v => {
    // Only display actual videos (exclude live streams or playlists if yt-dlp mixes them, but ytsearch usually returns videos)
    const el = document.createElement('div');
    el.className = 'history-card';
    el.style.cursor = 'pointer';
    
    // We use history-card layout for search results since it's identical
    el.innerHTML = `
      <img src="${v.thumbnail || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}" alt="Thumbnail" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22><rect width=%2216%22 height=%229%22 fill=%22%23222%22/></svg>'">
      <div class="history-card-body">
        <div class="history-card-title">${escapeHtml(v.title)}</div>
        <div class="history-card-meta">${escapeHtml(v.uploader || v.channel || '')} • ${v.duration_string || ''}</div>
      </div>
    `;
    
    // When clicked, fetch this specific video
    el.addEventListener('click', () => {
      urlInput.value = v.url || `https://www.youtube.com/watch?v=${v.id}`;
      handleFetch();
    });
    
    searchResultsGrid.appendChild(el);
  });
}

function formatNumber(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

// ---------------------------------------------------------------------------
// Format table rendering
// ---------------------------------------------------------------------------

function renderFormats() {
  let formats = filterFormats(allFormats);
  formats = sortFormats(formats);

  formatCount.textContent = formats.length;
  formatsTbody.innerHTML = '';

  if (formats.length === 0) {
    formatsTbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;">No formats found.</td></tr>`;
    return;
  }

  formats.forEach((fmt) => {
    const tr = document.createElement('tr');
    const isSelected = selectedFormatId === fmt.format_id;
    if (isSelected) tr.classList.add('selected');

    tr.innerHTML = `
      <td><input type="radio" class="format-radio" name="format" value="${escapeHtml(fmt.format_id)}" ${isSelected ? 'checked' : ''}/></td>
      <td>${escapeHtml(fmt.format_id)}</td>
      <td>${escapeHtml(fmt.resolution)}</td>
      <td>${escapeHtml(fmt.container.toUpperCase())}</td>
      <td>${formatFileSize(fmt.filesize || fmt.filesize_approx)}</td>
      <td>${formatCodec(fmt.vcodec)}</td>
      <td>${formatCodec(fmt.acodec)}</td>
      <td>${fmt.fps != null ? Math.round(fmt.fps) : '—'}</td>
      <td>${typeBadge(fmt.type_label)}</td>
    `;
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      tr.querySelector('.format-radio').checked = true;
      selectFormat(fmt.format_id);
    });
    tr.querySelector('input')?.addEventListener('change', () => selectFormat(fmt.format_id));
    formatsTbody.appendChild(tr);
  });
}

function selectFormat(formatId) {
  selectedFormatId = formatId;
  btnDownloadSelected.disabled = false;
  formatsTbody.querySelectorAll('tr').forEach(tr => {
    const r = tr.querySelector('.format-radio');
    if (r && r.value === formatId) tr.classList.add('selected');
    else tr.classList.remove('selected');
  });
}

function filterFormats(formats) {
  switch (activeFilter) {
    case 'video_audio': return formats.filter(f => f.type_label === 'Video + Audio');
    case 'video_only': return formats.filter(f => f.type_label === 'Video Only');
    case 'audio_only': return formats.filter(f => f.type_label === 'Audio Only');
    case 'mp4': return formats.filter(f => f.container?.toLowerCase() === 'mp4');
    case 'webm': return formats.filter(f => f.container?.toLowerCase() === 'webm');
    default: return formats;
  }
}

function sortFormats(formats) {
  const sorted = [...formats];
  switch (activeSort) {
    case 'resolution_desc': sorted.sort((a, b) => (b.height || 0) - (a.height || 0)); break;
    case 'resolution_asc': sorted.sort((a, b) => (a.height || 0) - (b.height || 0)); break;
    case 'size_desc': sorted.sort((a, b) => (getSize(b)) - (getSize(a))); break;
    case 'size_asc': sorted.sort((a, b) => (getSize(a)) - (getSize(b))); break;
  }
  return sorted;
}

function getSize(fmt) { return fmt.filesize || fmt.filesize_approx || 0; }

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatCodec(codec) {
  if (!codec || codec === 'none') return '<span style="color:var(--text-muted)">—</span>';
  const short = codec.replace('avc1.', 'H.264/').replace('av01.', 'AV1/').replace('vp9', 'VP9').replace('vp09.', 'VP9/').replace('mp4a.', 'AAC/').replace('opus', 'Opus');
  return escapeHtml(short.length > 18 ? short.substring(0, 18) + '…' : short);
}

function typeBadge(type) {
  switch (type) {
    case 'Video + Audio': return `<span class="badge badge-video-audio">✔ Video + Audio</span>`;
    case 'Video Only': return `<span class="badge badge-video-only">📹 Video Only</span> <span class="badge badge-no-audio">🔇 No Audio</span>`;
    case 'Audio Only': return `<span class="badge badge-audio-only">🎵 Audio Only</span>`;
    default: return escapeHtml(type);
  }
}

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Download actions
// ---------------------------------------------------------------------------

function handleDownloadSelected() {
  if (!selectedFormatId) return showError('Please select a format first.');
  const fmt = allFormats.find(f => f.format_id === selectedFormatId);
  if (fmt && fmt.type_label === 'Video Only') {
    openMergeModal();
    return;
  }
  startDownload('selected', selectedFormatId);
}

// Wrap in a promise so playlist queueing works
function startDownloadAsync(url, action, formatId = null, title = null, thumbnail = null) {
  return new Promise(async (resolve, reject) => {
    resetProgress();
    progressSection.classList.add('visible');
    disableActions(true);

    try {
      const body = { 
        url, action,
        start_time: startTimeInput.value.trim() || null,
        end_time: endTimeInput.value.trim() || null,
        download_subtitles: embedSubtitlesCheck.checked,
        title: title || (currentVideoInfo ? currentVideoInfo.title : "Unknown"),
        thumbnail: thumbnail || (currentVideoInfo ? currentVideoInfo.thumbnail : "")
      };
      if (formatId) body.format_id = formatId;

      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Download failed' }));
        throw new Error(err.detail?.error || err.detail || 'Download failed');
      }

      const data = await res.json();
      currentTaskId = data.task_id;
      
      btnCancelDownload.style.display = 'inline-block';
      btnCancelDownload.disabled = false;
      btnCancelDownload.innerHTML = '⏹ Cancel Download';
      
      // SSE Listener wrapped in promise
      const source = new EventSource(`/api/download/progress/${data.task_id}`);
      progressSource = source;

      source.onmessage = (event) => {
        try {
          const pData = JSON.parse(event.data);
          updateProgress(pData);
          if (pData.status === 'complete') {
            source.close();
            resolve();
          } else if (pData.status === 'error') {
            source.close();
            reject(new Error(pData.message));
          }
        } catch {}
      };

      source.onerror = () => {
        source.close();
        reject(new Error("Connection lost"));
      };

    } catch (err) {
      showError(err.message || 'Failed to start download');
      progressSection.classList.remove('visible');
      disableActions(false);
      reject(err);
    }
  });
}

function startDownload(action, formatId = null) {
  startDownloadAsync(currentUrl, action, formatId).catch(() => {});
}

async function downloadPlaylistQueue() {
  const checkboxes = Array.from(playlistUl.querySelectorAll('.playlist-cb:checked'));
  if (checkboxes.length === 0) return showError("No videos selected!");

  isDownloadingQueue = true;
  disableActions(true);
  btnDownloadPlaylist.disabled = true;

  for (let i = 0; i < checkboxes.length; i++) {
    const idx = parseInt(checkboxes[i].value, 10);
    const video = currentPlaylistEntries[idx];
    
    // Update UI
    progressStatus.textContent = `Queue: ${i+1}/${checkboxes.length}`;
    try {
      await startDownloadAsync(video.url, 'best_mp4', null, video.title, video.thumbnail);
    } catch(err) {
      console.error("Failed video in playlist", err);
    }
  }

  isDownloadingQueue = false;
  btnDownloadPlaylist.disabled = false;
  progressStatus.textContent = "Playlist Download Finished!";
}

function updateProgress(data) {
  const pct = data.percentage || 0;
  progressBar.style.width = `${pct}%`;
  progressPercentage.textContent = `${pct.toFixed(1)}%`;
  if (data.speed) progressSpeed.textContent = data.speed;
  if (data.eta) progressEta.textContent = data.eta;

  const statusMap = { queued: 'Queued', downloading: 'Downloading', merging: 'Merging', complete: 'Complete', error: 'Error' };
  progressDlStatus.textContent = statusMap[data.status] || data.status;
  
  if (!isDownloadingQueue) {
    progressStatus.textContent = statusMap[data.status] || 'Processing…';
  }

  if (data.message) {
    progressMessage.textContent = data.message;
    progressMessage.style.display = 'block';
  }

  if (data.status === 'complete') {
    progressBar.style.width = '100%';
    progressPercentage.textContent = '100%';
    progressCompleteText.textContent = `Saved as: ${data.filename ? data.filename.split('/').pop() : 'File'}`;
    progressComplete.style.display = 'flex';
    progressError.style.display = 'none';
    btnCancelDownload.style.display = 'none';
    disableActions(false);
  }

  if (data.status === 'error') {
    progressErrorText.textContent = data.message || 'Download failed';
    progressError.style.display = 'flex';
    progressComplete.style.display = 'none';
    btnCancelDownload.style.display = 'none';
    disableActions(false);
  }
}

function resetProgress() {
  progressBar.style.width = '0%';
  progressPercentage.textContent = '0%';
  progressSpeed.textContent = '—';
  progressEta.textContent = '—';
  progressDlStatus.textContent = 'Queued';
  progressStatus.textContent = 'Preparing…';
  progressMessage.style.display = 'none';
  progressMessage.textContent = '';
  progressComplete.style.display = 'none';
  progressError.style.display = 'none';
  btnCancelDownload.style.display = 'none';
}

function openMergeModal() { mergeModal.classList.add('visible'); }
function closeMergeModal() { mergeModal.classList.remove('visible'); }

function hideAllSections() {
  videoInfoSection.classList.remove('visible');
  formatsSection.classList.remove('visible');
  actionsSection.classList.remove('visible');
  progressSection.classList.remove('visible');
  
  playlistInfoSection.classList.remove('visible');
  playlistInfoSection.style.display = 'none';
  
  searchResultsSection.classList.remove('visible');
  searchResultsSection.style.display = 'none';
}

function showSections() {
  videoInfoSection.classList.add('visible');
  formatsSection.classList.add('visible');
  actionsSection.classList.add('visible');
}

function showPlaylistSections() {
  playlistInfoSection.style.display = 'block';
  playlistInfoSection.classList.add('visible');
  progressSection.classList.remove('visible');
}

function showSearchResultsSection() {
  searchResultsSection.style.display = 'block';
  searchResultsSection.classList.add('visible');
  progressSection.classList.remove('visible');
}

function disableActions(disabled) {
  btnDownloadBest.disabled = disabled;
  btnDownloadMp4.disabled = disabled;
  btnDownloadAudio.disabled = disabled;
  if (disabled) btnDownloadSelected.disabled = true;
  else btnDownloadSelected.disabled = !selectedFormatId;
}

let errorTimeout = null;
function showError(msg) {
  errorToastMessage.textContent = msg;
  errorToast.classList.add('visible');
  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(hideError, 6000);
}
function hideError() {
  errorToast.classList.remove('visible');
  if (errorTimeout) { clearTimeout(errorTimeout); errorTimeout = null; }
}
