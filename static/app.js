/**
 * YouTube Downloader — Frontend Application Logic
 *
 * Handles: URL validation, metadata fetching, format table rendering,
 * filtering/sorting, download actions, SSE progress, and merge modal.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Array<Object>} */
let allFormats = [];

/** @type {string|null} */
let selectedFormatId = null;

/** @type {string} */
let currentUrl = '';

/** @type {string} */
let activeFilter = 'all';

/** @type {string} */
let activeSort = 'resolution_desc';

/** @type {EventSource|null} */
let progressSource = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const urlInput = $('url-input');
const fetchBtn = $('fetch-btn');
const fetchBtnText = $('fetch-btn-text');
const fetchSpinner = $('fetch-spinner');
const depBanner = $('dep-banner');

const videoInfoSection = $('video-info-section');
const videoThumbnail = $('video-thumbnail');
const videoTitle = $('video-title');
const videoChannel = $('video-channel');
const videoDuration = $('video-duration');
const videoViews = $('video-views');
const videoViewsItem = $('video-views-item');

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

// ---------------------------------------------------------------------------
// Dependency check
// ---------------------------------------------------------------------------

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
    // Server might not be up yet; ignore
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function setupEventListeners() {
  // Fetch formats
  fetchBtn.addEventListener('click', handleFetch);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetch();
  });

  // Filters
  filtersBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    filtersBar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderFormats();
  });

  // Sort
  sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    renderFormats();
  });

  // Download actions
  btnDownloadSelected.addEventListener('click', handleDownloadSelected);
  btnDownloadBest.addEventListener('click', () => startDownload('best'));
  btnDownloadMp4.addEventListener('click', () => startDownload('best_mp4'));
  btnDownloadAudio.addEventListener('click', () => startDownload('audio_only'));

  // Merge modal
  mergeBtnVideoOnly.addEventListener('click', () => {
    closeMergeModal();
    startDownload('selected', selectedFormatId);
  });
  mergeBtnMerge.addEventListener('click', () => {
    closeMergeModal();
    startDownload('merge', selectedFormatId);
  });

  // Error toast
  errorToastClose.addEventListener('click', hideError);

  // Close modal on overlay click
  mergeModal.addEventListener('click', (e) => {
    if (e.target === mergeModal) closeMergeModal();
  });
}

// ---------------------------------------------------------------------------
// Fetch video info
// ---------------------------------------------------------------------------

async function handleFetch() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please enter a YouTube URL.');
    return;
  }

  if (!isValidYouTubeUrl(url)) {
    showError('Please enter a valid YouTube URL.');
    return;
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
    displayVideoInfo(data);
    allFormats = data.formats || [];
    selectedFormatId = null;
    btnDownloadSelected.disabled = true;
    renderFormats();
    showSections();
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
    /^(https?:\/\/)?youtu\.be\/[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
    /^(https?:\/\/)?m\.youtube\.com\/watch\?v=[\w-]+/,
  ];
  return patterns.some(p => p.test(url));
}

function setFetchLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtnText.textContent = loading ? 'Fetching…' : 'Fetch Formats';
  fetchSpinner.style.display = loading ? 'inline-block' : 'none';
}

// ---------------------------------------------------------------------------
// Display video info
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
    formatsTbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted)">
          No formats match the current filter.
        </td>
      </tr>`;
    return;
  }

  formats.forEach((fmt) => {
    const tr = document.createElement('tr');
    const isSelected = selectedFormatId === fmt.format_id;
    if (isSelected) tr.classList.add('selected');

    tr.innerHTML = `
      <td>
        <input
          type="radio"
          class="format-radio"
          name="format"
          value="${escapeHtml(fmt.format_id)}"
          ${isSelected ? 'checked' : ''}
        />
      </td>
      <td>${escapeHtml(fmt.format_id)}</td>
      <td>${escapeHtml(fmt.resolution)}</td>
      <td>${escapeHtml(fmt.container.toUpperCase())}</td>
      <td>${formatFileSize(fmt.filesize || fmt.filesize_approx)}</td>
      <td>${formatCodec(fmt.vcodec)}</td>
      <td>${formatCodec(fmt.acodec)}</td>
      <td>${fmt.fps != null ? Math.round(fmt.fps) : '—'}</td>
      <td>${typeBadge(fmt.type_label)}</td>
    `;

    // Row click selects the radio
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const radio = tr.querySelector('.format-radio');
      if (radio) {
        radio.checked = true;
        selectFormat(fmt.format_id);
      }
    });

    const radio = tr.querySelector ? null : null; // dummy — real listener below
    tr.querySelector('input')?.addEventListener('change', () => {
      selectFormat(fmt.format_id);
    });

    formatsTbody.appendChild(tr);
  });
}

function selectFormat(formatId) {
  selectedFormatId = formatId;
  btnDownloadSelected.disabled = false;

  // Update visual selection
  formatsTbody.querySelectorAll('tr').forEach(tr => {
    const radio = tr.querySelector('.format-radio');
    if (radio && radio.value === formatId) {
      tr.classList.add('selected');
    } else {
      tr.classList.remove('selected');
    }
  });
}

function filterFormats(formats) {
  switch (activeFilter) {
    case 'video_audio':
      return formats.filter(f => f.type_label === 'Video + Audio');
    case 'video_only':
      return formats.filter(f => f.type_label === 'Video Only');
    case 'audio_only':
      return formats.filter(f => f.type_label === 'Audio Only');
    case 'mp4':
      return formats.filter(f => f.container?.toLowerCase() === 'mp4');
    case 'webm':
      return formats.filter(f => f.container?.toLowerCase() === 'webm');
    default:
      return formats;
  }
}

function sortFormats(formats) {
  const sorted = [...formats];
  switch (activeSort) {
    case 'resolution_desc':
      sorted.sort((a, b) => (b.height || 0) - (a.height || 0));
      break;
    case 'resolution_asc':
      sorted.sort((a, b) => (a.height || 0) - (b.height || 0));
      break;
    case 'size_desc':
      sorted.sort((a, b) => (getSize(b)) - (getSize(a)));
      break;
    case 'size_asc':
      sorted.sort((a, b) => (getSize(a)) - (getSize(b)));
      break;
  }
  return sorted;
}

function getSize(fmt) {
  return fmt.filesize || fmt.filesize_approx || 0;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatCodec(codec) {
  if (!codec || codec === 'none') return '<span style="color:var(--text-muted)">—</span>';
  // Shorten common codec names
  const short = codec
    .replace('avc1.', 'H.264/')
    .replace('av01.', 'AV1/')
    .replace('vp9', 'VP9')
    .replace('vp09.', 'VP9/')
    .replace('mp4a.', 'AAC/')
    .replace('opus', 'Opus');
  // Truncate if very long
  return escapeHtml(short.length > 18 ? short.substring(0, 18) + '…' : short);
}

function typeBadge(type) {
  switch (type) {
    case 'Video + Audio':
      return `<span class="badge badge-video-audio">✔ Video + Audio</span>`;
    case 'Video Only':
      return `
        <span class="badge badge-video-only">📹 Video Only</span>
        <span class="badge badge-no-audio">🔇 No Audio</span>`;
    case 'Audio Only':
      return `<span class="badge badge-audio-only">🎵 Audio Only</span>`;
    default:
      return escapeHtml(type);
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
  if (!selectedFormatId) {
    showError('Please select a format first.');
    return;
  }

  // Check if this is a video-only format
  const fmt = allFormats.find(f => f.format_id === selectedFormatId);
  if (fmt && fmt.type_label === 'Video Only') {
    openMergeModal();
    return;
  }

  startDownload('selected', selectedFormatId);
}

async function startDownload(action, formatId = null) {
  if (!currentUrl) {
    showError('No video URL set. Please fetch a video first.');
    return;
  }

  // Show progress section
  resetProgress();
  progressSection.classList.add('visible');
  disableActions(true);

  try {
    const body = { url: currentUrl, action };
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
    listenProgress(data.task_id);
  } catch (err) {
    showError(err.message || 'Failed to start download');
    progressSection.classList.remove('visible');
    disableActions(false);
  }
}

// ---------------------------------------------------------------------------
// SSE Progress
// ---------------------------------------------------------------------------

function listenProgress(taskId) {
  if (progressSource) {
    progressSource.close();
  }

  progressSource = new EventSource(`/api/download/progress/${taskId}`);

  progressSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      updateProgress(data);
    } catch {
      // Ignore parse errors
    }
  };

  progressSource.onerror = () => {
    progressSource.close();
    progressSource = null;
    // If no completion message was shown, show a generic error
    if (!progressComplete.style.display || progressComplete.style.display === 'none') {
      if (!progressError.style.display || progressError.style.display === 'none') {
        progressErrorText.textContent = 'Connection lost. The download may still be running in the background.';
        progressError.style.display = 'flex';
      }
    }
    disableActions(false);
  };
}

function updateProgress(data) {
  const pct = data.percentage || 0;

  progressBar.style.width = `${pct}%`;
  progressPercentage.textContent = `${pct.toFixed(1)}%`;

  if (data.speed) progressSpeed.textContent = data.speed;
  if (data.eta) progressEta.textContent = data.eta;

  // Status label
  const statusMap = {
    queued: 'Queued',
    downloading: 'Downloading',
    merging: 'Merging',
    complete: 'Complete',
    error: 'Error',
  };
  progressDlStatus.textContent = statusMap[data.status] || data.status;
  progressStatus.textContent = statusMap[data.status] || 'Processing…';

  // Message
  if (data.message) {
    progressMessage.textContent = data.message;
    progressMessage.style.display = 'block';
  }

  // Complete
  if (data.status === 'complete') {
    progressBar.style.width = '100%';
    progressPercentage.textContent = '100%';
    const filename = data.filename ? data.filename.split('/').pop() : 'File';
    progressCompleteText.textContent = `Download complete! Saved as: ${filename}`;
    progressComplete.style.display = 'flex';
    progressError.style.display = 'none';

    if (progressSource) {
      progressSource.close();
      progressSource = null;
    }
    disableActions(false);
  }

  // Error
  if (data.status === 'error') {
    progressErrorText.textContent = data.message || 'Download failed';
    progressError.style.display = 'flex';
    progressComplete.style.display = 'none';

    if (progressSource) {
      progressSource.close();
      progressSource = null;
    }
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
}

// ---------------------------------------------------------------------------
// Merge modal
// ---------------------------------------------------------------------------

function openMergeModal() {
  mergeModal.classList.add('visible');
}

function closeMergeModal() {
  mergeModal.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// UI Helpers
// ---------------------------------------------------------------------------

function hideAllSections() {
  videoInfoSection.classList.remove('visible');
  formatsSection.classList.remove('visible');
  actionsSection.classList.remove('visible');
  progressSection.classList.remove('visible');
}

function showSections() {
  videoInfoSection.classList.add('visible');
  formatsSection.classList.add('visible');
  actionsSection.classList.add('visible');
}

function disableActions(disabled) {
  btnDownloadBest.disabled = disabled;
  btnDownloadMp4.disabled = disabled;
  btnDownloadAudio.disabled = disabled;
  if (disabled) {
    btnDownloadSelected.disabled = true;
  } else {
    btnDownloadSelected.disabled = !selectedFormatId;
  }
}

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------

let errorTimeout = null;

function showError(msg) {
  errorToastMessage.textContent = msg;
  errorToast.classList.add('visible');

  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(hideError, 6000);
}

function hideError() {
  errorToast.classList.remove('visible');
  if (errorTimeout) {
    clearTimeout(errorTimeout);
    errorTimeout = null;
  }
}
