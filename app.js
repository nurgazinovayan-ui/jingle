// Jingle — онлайн музыкальный плеер (без зависимостей)

const $ = (sel) => document.querySelector(sel);

const audio = $("#audio");
const app = document.body;
const els = {
  title: $("#title"),
  artist: $("#artist"),
  coverImg: $("#coverImg"),
  coverFallback: $("#coverFallback"),
  seek: $("#seek"),
  current: $("#currentTime"),
  duration: $("#duration"),
  play: $("#playBtn"),
  prev: $("#prevBtn"),
  next: $("#nextBtn"),
  shuffle: $("#shuffleBtn"),
  repeat: $("#repeatBtn"),
  mute: $("#muteBtn"),
  volume: $("#volume"),
  list: $("#trackList"),
  count: $("#count"),
  search: $("#search"),
  status: $("#status"),
  fileInput: $("#fileInput"),
  dropOverlay: $("#dropOverlay"),
};

// ---------- Хранилище настроек ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("jingle:" + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem("jingle:" + key, JSON.stringify(value)); } catch {}
  },
};

// ---------- Состояние ----------
const state = {
  tracks: [],
  index: -1,
  shuffle: store.get("shuffle", false),
  repeat: store.get("repeat", "off"), // off | all | one
  history: [],
  filter: "",
  durations: store.get("durations", {}),
  seeking: false,
};

// ---------- Утилиты ----------
const fmt = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

const setRangeFill = (input) => {
  const min = +input.min || 0;
  const max = +input.max || 100;
  input.style.setProperty("--p", `${((+input.value - min) / (max - min)) * 100}%`);
};

let statusTimer;
const showStatus = (msg, ms = 4000) => {
  els.status.textContent = msg;
  clearTimeout(statusTimer);
  if (msg) statusTimer = setTimeout(() => (els.status.textContent = ""), ms);
};

const current = () => state.tracks[state.index];

// ---------- Загрузка плейлиста ----------
async function loadPlaylist() {
  try {
    const res = await fetch("/api/tracks", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data.tracks || [];
  } catch {
    // Фолбэк для локального запуска без serverless-функций (например, `npx serve`)
    try {
      const mod = await import("/data/playlist.js");
      return mod.playlist;
    } catch {
      showStatus("Не удалось загрузить плейлист. Добавьте свои файлы.", 6000);
      return [];
    }
  }
}

// ---------- Рендер плейлиста ----------
const ICON_REMOVE =
  '<svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

function renderList() {
  const q = state.filter.trim().toLowerCase();
  els.list.innerHTML = "";
  const frag = document.createDocumentFragment();
  let shown = 0;

  state.tracks.forEach((t, i) => {
    if (q && !`${t.title} ${t.artist}`.toLowerCase().includes(q)) return;
    shown++;

    const li = document.createElement("li");
    li.className = "track" + (i === state.index ? " active" : "");
    li.tabIndex = 0;
    li.dataset.index = i;

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = i + 1;

    const info = document.createElement("div");
    info.className = "info";
    const tt = document.createElement("div");
    tt.className = "t";
    tt.textContent = t.title;
    const ta = document.createElement("div");
    ta.className = "a";
    ta.textContent = t.artist || "Неизвестный исполнитель";
    info.append(tt, ta);

    const dur = document.createElement("span");
    dur.className = "dur";
    const d = state.durations[t.id];
    dur.textContent = d ? fmt(d) : "";

    const extra = document.createElement("span");
    if (t.local) {
      extra.className = "remove-wrap";
      extra.innerHTML = `<button class="remove" title="Убрать из плейлиста" aria-label="Убрать">${ICON_REMOVE}</button>`;
    }

    li.append(num, info, dur, extra);
    frag.append(li);
  });

  els.list.append(frag);
  if (!shown) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = state.tracks.length ? "Ничего не найдено" : "Плейлист пуст";
    els.list.append(empty);
  }
  els.count.textContent = state.tracks.length ? `· ${state.tracks.length}` : "";
}

function markActive() {
  els.list.querySelectorAll(".track").forEach((li) => {
    li.classList.toggle("active", +li.dataset.index === state.index);
  });
}

// ---------- Воспроизведение ----------
function load(index, { autoplay = true, startAt = 0 } = {}) {
  const t = state.tracks[index];
  if (!t) return;
  state.index = index;

  audio.src = t.src;
  if (startAt) {
    audio.addEventListener("loadedmetadata", () => { audio.currentTime = startAt; }, { once: true });
  }

  els.title.textContent = t.title;
  els.artist.textContent = t.artist || "Неизвестный исполнитель";
  document.title = `${t.title} — ${t.artist || "Jingle"}`;

  if (t.cover) {
    els.coverImg.src = t.cover;
    els.coverImg.hidden = false;
    els.coverFallback.hidden = true;
  } else {
    els.coverImg.hidden = true;
    els.coverFallback.hidden = false;
  }

  els.seek.value = 0;
  setRangeFill(els.seek);
  els.current.textContent = "0:00";
  els.duration.textContent = state.durations[t.id] ? fmt(state.durations[t.id]) : "0:00";

  markActive();
  updateMediaSession();
  store.set("last", { id: t.id, time: startAt });

  if (autoplay) play();
}

async function play() {
  if (state.index < 0) {
    if (!state.tracks.length) return;
    load(state.shuffle ? randomIndex() : 0, { autoplay: false });
  }
  try {
    await audio.play();
  } catch (err) {
    if (err.name !== "AbortError") showStatus("Воспроизведение заблокировано браузером — нажмите ▶");
  }
}

const pause = () => audio.pause();
const toggle = () => (audio.paused ? play() : pause());

function randomIndex() {
  const n = state.tracks.length;
  if (n <= 1) return 0;
  let i;
  do { i = Math.floor(Math.random() * n); } while (i === state.index);
  return i;
}

function next(auto = false) {
  const n = state.tracks.length;
  if (!n) return;
  if (state.index >= 0) state.history.push(state.index);

  if (state.shuffle) return load(randomIndex());
  if (state.index + 1 < n) return load(state.index + 1);
  // Конец плейлиста
  if (!auto || state.repeat === "all") return load(0);
  load(0, { autoplay: false });
}

function prev() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  const n = state.tracks.length;
  if (!n) return;
  if (state.shuffle && state.history.length) return load(state.history.pop());
  load(state.index > 0 ? state.index - 1 : n - 1);
}

// ---------- Режимы ----------
function renderModes() {
  els.shuffle.setAttribute("aria-pressed", state.shuffle);
  els.repeat.dataset.mode = state.repeat;
  els.repeat.setAttribute("aria-pressed", state.repeat !== "off");
  els.repeat.title = { off: "Повтор: выкл (R)", all: "Повтор: весь плейлист (R)", one: "Повтор: один трек (R)" }[state.repeat];
  audio.loop = state.repeat === "one";
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  state.history = [];
  store.set("shuffle", state.shuffle);
  renderModes();
}

function cycleRepeat() {
  state.repeat = { off: "all", all: "one", one: "off" }[state.repeat];
  store.set("repeat", state.repeat);
  renderModes();
}

// ---------- Громкость ----------
function setVolume(v) {
  audio.volume = Math.min(1, Math.max(0, v));
  els.volume.value = audio.volume;
  setRangeFill(els.volume);
  if (audio.volume > 0 && audio.muted) audio.muted = false;
  store.set("volume", audio.volume);
}

function toggleMute() {
  audio.muted = !audio.muted;
  store.set("muted", audio.muted);
}

// ---------- Media Session (кнопки на клавиатуре / экране блокировки) ----------
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const t = current();
  if (!t) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist || "",
    album: "Jingle",
    artwork: t.cover ? [{ src: t.cover, sizes: "512x512" }] : [],
  });
}

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const actions = {
    play,
    pause,
    previoustrack: prev,
    nexttrack: () => next(),
    seekbackward: (d) => (audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10))),
    seekforward: (d) => (audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10))),
    seekto: (d) => (audio.currentTime = d.seekTime),
  };
  for (const [action, fn] of Object.entries(actions)) {
    try { ms.setActionHandler(action, fn); } catch {}
  }
}

// ---------- Свои файлы ----------
function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: "Мой файл", title: base };
}

function addFiles(files) {
  const audioFiles = [...files].filter((f) => f.type.startsWith("audio/") || /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i.test(f.name));
  if (!audioFiles.length) {
    showStatus("Это не похоже на аудиофайлы");
    return;
  }
  const startIndex = state.tracks.length;
  for (const f of audioFiles) {
    const { artist, title } = parseName(f.name);
    state.tracks.push({
      id: "local-" + crypto.randomUUID(),
      title,
      artist,
      src: URL.createObjectURL(f),
      local: true,
    });
  }
  renderList();
  if (audio.paused) load(startIndex);
}

function removeTrack(i) {
  const t = state.tracks[i];
  if (!t) return;
  const wasCurrent = i === state.index;
  if (t.local) URL.revokeObjectURL(t.src);
  state.tracks.splice(i, 1);
  state.history = state.history.filter((h) => h !== i).map((h) => (h > i ? h - 1 : h));

  if (wasCurrent) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    state.index = -1;
    if (state.tracks.length) load(Math.min(i, state.tracks.length - 1), { autoplay: false });
    else {
      els.title.textContent = "Выберите трек";
      els.artist.textContent = "—";
    }
  } else if (i < state.index) {
    state.index--;
  }
  renderList();
}

// ---------- События аудио ----------
const syncPlaying = () => app.classList.toggle("playing", !audio.paused);
for (const ev of ["play", "pause", "emptied", "ended", "loadstart"]) audio.addEventListener(ev, syncPlaying);
audio.addEventListener("waiting", () => app.classList.add("loading"));
audio.addEventListener("playing", () => app.classList.remove("loading"));
audio.addEventListener("canplay", () => app.classList.remove("loading"));

audio.addEventListener("loadedmetadata", () => {
  els.duration.textContent = fmt(audio.duration);
  const t = current();
  if (t && Number.isFinite(audio.duration) && !t.local) {
    state.durations[t.id] = audio.duration;
    store.set("durations", state.durations);
    const li = els.list.querySelector(`.track[data-index="${state.index}"] .dur`);
    if (li) li.textContent = fmt(audio.duration);
  }
});

let lastSaved = 0;
audio.addEventListener("timeupdate", () => {
  if (state.seeking) return;
  const d = audio.duration;
  els.current.textContent = fmt(audio.currentTime);
  els.seek.value = d ? (audio.currentTime / d) * 1000 : 0;
  setRangeFill(els.seek);

  const t = current();
  if (t && !t.local && Date.now() - lastSaved > 3000) {
    lastSaved = Date.now();
    store.set("last", { id: t.id, time: audio.currentTime });
  }
  if ("mediaSession" in navigator && d && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: d, position: audio.currentTime, playbackRate: audio.playbackRate }); } catch {}
  }
});

audio.addEventListener("ended", () => next(true));

audio.addEventListener("volumechange", () => {
  app.classList.toggle("muted", audio.muted || audio.volume === 0);
});

let errorSkips = 0;
audio.addEventListener("error", () => {
  if (!audio.getAttribute("src")) return;
  app.classList.remove("loading");
  const t = current();
  showStatus(`Не удалось воспроизвести «${t ? t.title : "трек"}»`);
  // Пропускаем битый трек, но не уходим в бесконечный цикл
  if (++errorSkips < state.tracks.length) setTimeout(() => next(true), 1200);
});
audio.addEventListener("playing", () => (errorSkips = 0));

// ---------- События интерфейса ----------
els.play.addEventListener("click", toggle);
els.next.addEventListener("click", () => next());
els.prev.addEventListener("click", prev);
els.shuffle.addEventListener("click", toggleShuffle);
els.repeat.addEventListener("click", cycleRepeat);
els.mute.addEventListener("click", toggleMute);
els.volume.addEventListener("input", (e) => setVolume(+e.target.value));

els.seek.addEventListener("input", () => {
  state.seeking = true;
  setRangeFill(els.seek);
  if (audio.duration) els.current.textContent = fmt((els.seek.value / 1000) * audio.duration);
});
els.seek.addEventListener("change", () => {
  if (audio.duration) audio.currentTime = (els.seek.value / 1000) * audio.duration;
  state.seeking = false;
});

els.list.addEventListener("click", (e) => {
  const li = e.target.closest(".track");
  if (!li) return;
  const i = +li.dataset.index;
  if (e.target.closest(".remove")) return removeTrack(i);
  if (i === state.index) toggle();
  else {
    if (state.index >= 0) state.history.push(state.index);
    load(i);
  }
});
els.list.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const li = e.target.closest(".track");
  if (li) li.click();
});

els.search.addEventListener("input", (e) => {
  state.filter = e.target.value;
  renderList();
});

els.fileInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
  e.target.value = "";
});

// Drag & drop
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  els.dropOverlay.hidden = false;
});
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) { dragDepth = 0; els.dropOverlay.hidden = true; }
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.hidden = true;
  addFiles(e.dataTransfer.files);
});

// Горячие клавиши
window.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") && e.target.type !== "range") return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Space" && e.target.closest("button, label")) return; // кнопка сама обработает
  switch (e.code) {
    case "Space": e.preventDefault(); toggle(); break;
    case "ArrowRight": if (e.target.type === "range") return; audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); break;
    case "ArrowLeft": if (e.target.type === "range") return; audio.currentTime = Math.max(0, audio.currentTime - 5); break;
    case "ArrowUp": if (e.target.type === "range") return; e.preventDefault(); setVolume(audio.volume + 0.05); break;
    case "ArrowDown": if (e.target.type === "range") return; e.preventDefault(); setVolume(audio.volume - 0.05); break;
    case "KeyN": next(); break;
    case "KeyP": prev(); break;
    case "KeyS": toggleShuffle(); break;
    case "KeyR": cycleRepeat(); break;
    case "KeyM": toggleMute(); break;
    case "Slash": e.preventDefault(); els.search.focus(); break;
  }
});

// ---------- Старт ----------
(async function init() {
  setVolume(store.get("volume", 0.8));
  audio.muted = store.get("muted", false);
  renderModes();
  setRangeFill(els.seek);

  state.tracks = await loadPlaylist();
  renderList();

  // Восстанавливаем последний трек и позицию
  const last = store.get("last", null);
  const i = last ? state.tracks.findIndex((t) => t.id === last.id) : -1;
  if (i >= 0) load(i, { autoplay: false, startAt: last.time || 0 });
})();
