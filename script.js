// ==================== KONFIGURASI & GLOBAL STATE ====================
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const surahContainer = document.getElementById('surahListContainer');
const searchInput = document.getElementById('searchSurah');
const detailContent = document.getElementById('detailContent');
const backBtn = document.getElementById('backToListBtn');

let allSurahs = [];
let currentFilter = '';
let activeAbortController = null;
let isLoadingDetail = false;
let debounceTimer = null;

// Audio state
let currentAudio = null;
let currentReciter = '05';
let currentSurahNomor = null;
let currentSurahAyatData = [];
let cachedAudioFull = null;

// UI elements
let seekSlider, currentTimeSpan, durationSpan, playPauseBtn;
let isPlayingFull = false;

// ==================== UTILITIES ====================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}
function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
function getPlaceReveal(surah) {
  if (surah.tempatTurun === 'Mekah' || surah.tempatTurun === 'Madinah') return surah.tempatTurun;
  const makkiyah = [1,6,7,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114];
  return makkiyah.includes(surah.nomor) ? 'Mekah' : 'Madinah';
}

// ==================== RENDER DAFTAR SURAH ====================
function renderSurahList() {
  if (!allSurahs.length) {
    surahContainer.innerHTML = `<div class="loading-spinner">Memuat data surah...</div>`;
    return;
  }
  const filterLower = currentFilter.toLowerCase().trim();
  let filtered = allSurahs;
  if (filterLower) {
    filtered = allSurahs.filter(s =>
      (s.namaLatin && s.namaLatin.toLowerCase().includes(filterLower)) ||
      (s.arti && s.arti.toLowerCase().includes(filterLower)) ||
      (s.nama && s.nama.toLowerCase().includes(filterLower))
    );
  }
  if (filtered.length === 0) {
    surahContainer.innerHTML = `<div class="error-msg">✨ Tidak ditemukan surat dengan kata "${escapeHtml(currentFilter)}"</div>`;
    return;
  }
  surahContainer.innerHTML = filtered.map(surah => `
    <div class="surah-card" data-surah-id="${surah.nomor}">
      <div class="surah-info">
        <span class="surah-number">${surah.nomor}. ${surah.tempatTurun || getPlaceReveal(surah)} • ${surah.jumlahAyat} ayat</span>
        <div class="surah-name">
          <span class="arabic-name">${escapeHtml(surah.nama)}</span>
          <span class="latin-name">${escapeHtml(surah.namaLatin)}</span>
        </div>
        <div class="surah-meta"><span>${escapeHtml(surah.arti)}</span></div>
      </div>
      <div class="surah-badge">Baca →</div>
    </div>
  `).join('');
}

// ==================== AUDIO HANDLING ====================
function stopAllAudio() {
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudio._progressInterval) clearInterval(currentAudio._progressInterval);
    currentAudio = null;
  }
  isPlayingFull = false;
  if (playPauseBtn) playPauseBtn.textContent = '▶';
  const nowPlaying = document.getElementById('nowPlayingStatus');
  if (nowPlaying) nowPlaying.innerText = '';
}

function playSingleAudio(url) {
  stopAllAudio();
  const audio = new Audio(url);
  currentAudio = audio;
  audio.play().catch(err => console.warn('Audio play error:', err));
  audio.onended = () => { if (currentAudio === audio) currentAudio = null; };
  audio.onerror = () => { if (currentAudio === audio) currentAudio = null; };
}

function setupProgressForAudio(audio) {
  const sliderContainer = document.querySelector('.slider-container');
  if (sliderContainer) sliderContainer.style.display = 'flex';

  const updateUI = () => {
    if (!audio || !seekSlider || !currentTimeSpan || !durationSpan) return;
    const current = audio.currentTime || 0;
    const duration = audio.duration || 0;
    seekSlider.max = duration || 0;
    seekSlider.value = current;
    currentTimeSpan.textContent = formatTime(current);
    if (duration && !isNaN(duration)) {
      durationSpan.textContent = formatTime(duration);
    }
  };

  if (audio._progressInterval) clearInterval(audio._progressInterval);
  audio._progressInterval = setInterval(updateUI, 200);

  audio.addEventListener('loadedmetadata', updateUI);
  audio.addEventListener('timeupdate', updateUI);
  audio.addEventListener('ended', () => {
    updateUI();
    stopAllAudio();
  });
  audio.addEventListener('play', () => {
    isPlayingFull = true;
    if (playPauseBtn) playPauseBtn.textContent = '⏸';
  });
  audio.addEventListener('pause', () => {
    isPlayingFull = false;
    if (playPauseBtn) playPauseBtn.textContent = '▶';
  });

  if (seekSlider) {
    seekSlider.oninput = (e) => {
      if (audio) audio.currentTime = parseFloat(e.target.value);
    };
  }
}

function playFullSurah() {
  if (!cachedAudioFull) {
    alert('Data audio tidak tersedia.');
    return;
  }
  const url = cachedAudioFull[currentReciter];
  if (!url) {
    alert(`Audio full surah untuk qari ${RECITER_MAP[currentReciter] || currentReciter} tidak tersedia.`);
    return;
  }

  if (currentAudio && currentAudio.src === url && currentAudio.paused) {
    currentAudio.play();
    return;
  }

  stopAllAudio();
  const audio = new Audio(url);
  currentAudio = audio;
  setupProgressForAudio(audio);

  const nowPlaying = document.getElementById('nowPlayingStatus');
  if (nowPlaying) nowPlaying.innerText = `🎧 Memutar full surah (${RECITER_MAP[currentReciter] || currentReciter})`;

  audio.play().catch(err => {
    console.warn('Full surah play error:', err);
    if (nowPlaying) nowPlaying.innerText = 'Gagal memutar audio';
  });
}

function pauseFullSurah() {
  if (currentAudio) currentAudio.pause();
}

async function updateAudioForReciter(reciterKey) {
  if (!currentSurahAyatData.length) return;
  currentReciter = reciterKey;

  for (let ayat of currentSurahAyatData) {
    const ayatNum = ayat.nomorAyat;
    const card = document.querySelector(`.ayat-card[data-ayat-id="${currentSurahNomor}-${ayatNum}"]`);
    if (!card) continue;
    let btn = card.querySelector('.audio-btn');
    const audioObj = ayat.audio || {};
    const newUrl = audioObj[reciterKey] || Object.values(audioObj)[0] || '';

    if (btn) {
      if (newUrl) btn.setAttribute('data-audio', newUrl);
      else btn.remove();
    } else if (newUrl) {
      btn = document.createElement('button');
      btn.className = 'audio-btn';
      btn.setAttribute('data-audio', newUrl);
      btn.innerHTML = '🔊 Putar Audio';
      const arabicEl = card.querySelector('.arabic-text');
      card.insertBefore(btn, arabicEl);
    }
  }

  stopAllAudio();
  const nowSpan = document.getElementById('nowPlayingStatus');
  if (nowSpan) nowSpan.innerText = `Qari berubah ke ${RECITER_MAP[reciterKey] || reciterKey}. Silakan putar ulang.`;
}

// ==================== LOAD DETAIL SURAH ====================
async function loadSurahDetail(nomor) {
  if (isLoadingDetail) return;
  stopAllAudio();
  if (activeAbortController) activeAbortController.abort();
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;
  isLoadingDetail = true;
  currentSurahNomor = nomor;

  listView.classList.add('hidden');
  detailView.classList.remove('hidden');
  detailContent.innerHTML = `<div class="loading-spinner">⏳ Membuka Surat, memohon berkah...</div>`;

  try {
    const timeoutId = setTimeout(() => activeAbortController.abort(), 15000);
    const [detailRes, tafsirRes] = await Promise.all([
      fetch(API_SURAH_DETAIL(nomor), { signal }),
      fetch(API_TAFSIR(nomor), { signal })
    ]);
    clearTimeout(timeoutId);

    if (!detailRes.ok) throw new Error(`Gagal memuat surat (${detailRes.status})`);
    const detailJson = await detailRes.json();
    if (detailJson.code !== 200 || !detailJson.data) throw new Error('Data surat tidak valid');

    const surah = detailJson.data;
    const ayatArray = surah.ayat || [];
    currentSurahAyatData = ayatArray;
    cachedAudioFull = surah.audioFull || {};

    const available = Object.keys(cachedAudioFull).filter(k => RECITER_MAP[k]);
    if (!cachedAudioFull[currentReciter] && available.length) {
      currentReciter = available[0];
    }

    let tafsirMap = new Map();
    if (tafsirRes.ok) {
      const tafsirJson = await tafsirRes.json();
      if (tafsirJson.code === 200 && tafsirJson.data?.tafsir) {
        tafsirJson.data.tafsir.forEach(item => {
          if (item.ayat && item.teks) tafsirMap.set(item.ayat, item.teks);
        });
      }
    }

    let qariOptionsHtml = '';
    const reciterEntries = Object.entries(RECITER_MAP);
    if (available.length) {
      qariOptionsHtml = `
        <div class="qari-selector">
          <label>🎙️ Qari:</label>
          <select id="qariSelect">
            ${available.map(k => `<option value="${k}" ${k === currentReciter ? 'selected' : ''}>${RECITER_MAP[k]}</option>`).join('')}
          </select>
        </div>
      `;
    } else {
      qariOptionsHtml = `
        <div class="qari-selector">
          <label>🎙️ Qari:</label>
          <select id="qariSelect">
            ${reciterEntries.map(([k, name]) => `<option value="${k}" ${k === currentReciter ? 'selected' : ''}>${name}</option>`).join('')}
          </select>
        </div>
      `;
    }

    let ayatHtml = '';
    const uniqueSeed = Date.now() + Math.random().toString(36);
    for (let ayat of ayatArray) {
      const ayatNum = ayat.nomorAyat;
      const arab = ayat.teksArab || '';
      const latin = ayat.teksLatin || '';
      const indo = ayat.teksIndonesia || '';
      const tafsirRaw = tafsirMap.get(ayatNum) || '';
      const tafsirClean = tafsirRaw ? stripHtml(tafsirRaw) : '';
      const hasTafsir = tafsirClean.length > 0;

      let audioUrl = '';
      if (ayat.audio) {
        audioUrl = ayat.audio[currentReciter] || Object.values(ayat.audio)[0] || '';
      }

      const uniqueId = `tafsir-full-${nomor}-${ayatNum}-${uniqueSeed}`;
      let tafsirPreviewHtml = '', tafsirFullHtml = '', toggleButtonHtml = '';

      if (hasTafsir) {
        const previewLimit = 120;
        const needToggle = tafsirClean.length > previewLimit;
        const previewText = needToggle ? tafsirClean.substring(0, previewLimit) + '…' : tafsirClean;
        tafsirPreviewHtml = `<div class="tafsir-preview">📖 Tafsir: ${escapeHtml(previewText)}</div>`;
        tafsirFullHtml = `<div id="${uniqueId}" class="tafsir-full">📖 Tafsir lengkap: ${escapeHtml(tafsirClean)}</div>`;
        if (needToggle) {
          toggleButtonHtml = `<button class="btn-toggle-tafsir" data-target="${uniqueId}">Selengkapnya</button>`;
        } else {
          tafsirFullHtml = `<div class="tafsir-full show">📖 Tafsir: ${escapeHtml(tafsirClean)}</div>`;
          tafsirPreviewHtml = '';
        }
      } else {
        tafsirPreviewHtml = `<div class="tafsir-preview">📖 Tafsir: (Tidak tersedia)</div>`;
      }

      ayatHtml += `
        <div class="ayat-card" data-ayat-id="${nomor}-${ayatNum}">
          <div class="ayat-number">${ayatNum}</div>
          ${audioUrl ? `<button class="audio-btn" data-audio="${escapeHtml(audioUrl)}">🔊 Putar Audio</button>` : ''}
          <div class="arabic-text">${escapeHtml(arab)}</div>
          <div class="latin-text">${escapeHtml(latin)}</div>
          <div class="translation">${escapeHtml(indo) || 'Terjemahan belum tersedia'}</div>
          <div class="tafsir-wrapper">
            ${tafsirPreviewHtml}
            ${tafsirFullHtml}
            ${toggleButtonHtml}
          </div>
        </div>
      `;
    }

    const tempatTurun = surah.tempatTurun || getPlaceReveal(surah);
    const deskripsiClean = surah.deskripsi
      ? stripHtml(surah.deskripsi).substring(0, 200) + (surah.deskripsi.length > 200 ? '...' : '')
      : `Surat ${surah.namaLatin} terdiri dari ${surah.jumlahAyat} ayat, diturunkan di ${tempatTurun}.`;

    const fullHtml = `
      <div class="detail-header">
        <div class="surah-title-arabic">${escapeHtml(surah.nama)}</div>
        <div class="surah-title-latin">${escapeHtml(surah.namaLatin)} <span style="font-size:0.9rem;">• ${escapeHtml(surah.arti)}</span></div>
        <div style="display: flex; justify-content: center; gap: 12px; margin: 8px 0;">
          <span class="surah-badge">${surah.jumlahAyat} Ayat</span>
          <span class="surah-badge">${escapeHtml(tempatTurun)}</span>
        </div>
        <div class="surah-desc">${escapeHtml(deskripsiClean)}</div>

        <div class="audio-player">
          <div class="player-main-row">
            <button id="playSurahBtn" class="play-surah-btn">▶</button>
            <div class="slider-container">
              <span class="current-time" id="currentTime">0:00</span>
              <input type="range" id="seekSlider" class="seek-slider" value="0" min="0" max="100" step="0.1">
              <span class="duration-time" id="durationTime">0:00</span>
            </div>
          </div>
          <div class="qari-row">
            ${qariOptionsHtml}
          </div>
        </div>
        <div id="nowPlayingStatus" class="now-playing"></div>
      </div>
      <div class="ayat-list">${ayatHtml}</div>
    `;

    detailContent.innerHTML = fullHtml;

    seekSlider = document.getElementById('seekSlider');
    currentTimeSpan = document.getElementById('currentTime');
    durationSpan = document.getElementById('durationTime');
    playPauseBtn = document.getElementById('playSurahBtn');

    const playBtn = document.getElementById('playSurahBtn');
    const qariSelect = document.getElementById('qariSelect');

    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentAudio && !currentAudio.paused) {
          pauseFullSurah();
        } else {
          playFullSurah();
        }
      });
    }
    if (qariSelect) {
      qariSelect.addEventListener('change', (e) => {
        const newReciter = e.target.value;
        if (newReciter !== currentReciter) updateAudioForReciter(newReciter);
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    detailContent.innerHTML = `
      <div class="error-msg">⚠️ Gagal memuat surat: ${escapeHtml(err.message)}. Cek koneksi atau coba lagi.</div>
      <button id="retryDetailBtn" class="back-btn" style="margin-top:1rem;">↻ Muat Ulang</button>
    `;
    document.getElementById('retryDetailBtn')?.addEventListener('click', () => loadSurahDetail(nomor));
  } finally {
    isLoadingDetail = false;
    activeAbortController = null;
  }
}

// ==================== EVENT LISTENERS ====================
surahContainer.addEventListener('click', (e) => {
  const card = e.target.closest('.surah-card');
  if (!card || isLoadingDetail) return;
  const surahId = parseInt(card.dataset.surahId);
  if (!isNaN(surahId)) loadSurahDetail(surahId);
});

detailContent.addEventListener('click', (e) => {
  const audioBtn = e.target.closest('.audio-btn');
  if (audioBtn) {
    e.stopPropagation();
    const url = audioBtn.getAttribute('data-audio');
    if (url) playSingleAudio(url);
    return;
  }

  const toggleBtn = e.target.closest('.btn-toggle-tafsir');
  if (toggleBtn) {
    e.stopPropagation();
    const targetId = toggleBtn.getAttribute('data-target');
    const fullDiv = document.getElementById(targetId);
    if (fullDiv) {
      const wrapper = fullDiv.closest('.tafsir-wrapper');
      const previewDiv = wrapper?.querySelector('.tafsir-preview');
      const isExpanded = fullDiv.classList.contains('show');
      if (!isExpanded) {
        previewDiv?.classList.add('hide-preview');
        fullDiv.classList.add('show');
        toggleBtn.textContent = 'Sembunyikan';
      } else {
        previewDiv?.classList.remove('hide-preview');
        fullDiv.classList.remove('show');
        toggleBtn.textContent = 'Selengkapnya';
      }
    }
  }
});

backBtn.addEventListener('click', () => {
  if (isLoadingDetail) return;
  if (activeAbortController) activeAbortController.abort();
  stopAllAudio();
  listView.classList.remove('hidden');
  detailView.classList.add('hidden');
  detailContent.innerHTML = '';
  isLoadingDetail = false;
  currentSurahAyatData = [];
  cachedAudioFull = null;
});

searchInput.addEventListener('input', (e) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    currentFilter = e.target.value;
    renderSurahList();
  }, 250);
});

// ==================== FETCH DAFTAR SURAH ====================
async function fetchSurahListWithRetry(retries = 2) {
  try {
    const response = await fetch(API_SURAH_LIST);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.code === 200 && Array.isArray(result.data)) {
      allSurahs = result.data;
      renderSurahList();
    } else {
      throw new Error('Format data tidak sesuai');
    }
  } catch (err) {
    console.error(err);
    if (retries > 0) {
      surahContainer.innerHTML = `<div class="loading-spinner">Gagal memuat, mencoba ulang (${retries})...</div>`;
      setTimeout(() => fetchSurahListWithRetry(retries - 1), 1500);
    } else {
      surahContainer.innerHTML = `
        <div class="error-msg">⚠️ Gagal memuat daftar surat. Periksa koneksi internet.</div>
        <button id="retryListBtn" class="back-btn" style="margin:1rem auto; display:block;">Coba Lagi</button>
      `;
      document.getElementById('retryListBtn')?.addEventListener('click', () => fetchSurahListWithRetry(2));
    }
  }
}

fetchSurahListWithRetry(2);

window.addEventListener('popstate', () => {
  if (!listView.classList.contains('hidden')) return;
  backBtn.click();
});
