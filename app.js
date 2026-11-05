// Jingle — онлайн музыкальный плеер (без фреймворков)

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
  loopAll: $("#loopAllBtn"),
  loopOne: $("#loopOneBtn"),
  shuffle: $("#shuffleBtn"),
  mute: $("#muteBtn"),
  volume: $("#volume"),
  list: $("#trackList"),
  count: $("#count"),
  search: $("#search"),
  toast: $("#toast"),
  shareSite: $("#shareSiteBtn"),
  shareTrack: $("#shareTrackBtn"),
  loginBtn: $("#loginBtn"),
  logoutBtn: $("#logoutBtn"),
  loginDialog: $("#loginDialog"),
  loginForm: $("#loginForm"),
  loginCancel: $("#loginCancel"),
  loginError: $("#loginError"),
  password: $("#passwordInput"),
  uploadPanel: $("#uploadPanel"),
  dropzone: $("#dropzone"),
  fileInput: $("#fileInput"),
  queue: $("#queue"),
  queueActions: $("#queueActions"),
  uploadBtn: $("#uploadBtn"),
  clearQueueBtn: $("#clearQueueBtn"),
  setupHint: $("#setupHint"),
  dropOverlay: $("#dropOverlay"),
};

// ---------- Хранилище настроек браузера ----------
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
    try {
      if (value === undefined) localStorage.removeItem("jingle:" + key);
      else localStorage.setItem("jingle:" + key, JSON.stringify(value));
    } catch {}
  },
};

// ---------- Состояние ----------
const state = {
  tracks: [],
  index: -1,
  shuffle: store.get("shuffle", false),
  repeat: store.get("repeat", "all"), // off | all | one
  history: [],
  filter: "",
  durations: store.get("durations", {}),
  seeking: false,
  password: store.get("pw", null), // пароль администратора (только в этом браузере)
  admin: false,
  queue: [],
  uploading: false,
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

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.ceil(b / 1024)} КБ`);

const setRangeFill = (input) => {
  const min = +input.min || 0;
  const max = +input.max || 100;
  input.style.setProperty("--p", `${((+input.value - min) / (max - min)) * 100}%`);
};

let toastTimer;
function toast(msg, { error = false, ms = 3000 } = {}) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", error);
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), ms);
}

const current = () => state.tracks[state.index];

const trackUrl = (t) => {
  const u = new URL(location.origin + location.pathname);
  if (t) u.searchParams.set("t", t.id);
  return u.toString();
};

async function share(url, title) {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ url, title });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка скопирована");
  } catch {
    prompt("Скопируйте ссылку:", url);
  }
}

async function api(path, { method = "GET", admin = false } = {}) {
  const headers = { Accept: "application/json" };
  if (admin && state.password) headers["x-admin-password"] = state.password;
  const res = await fetch(path, { method, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Ошибка ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---------- Плейлист ----------
async function fetchTracks() {
  try {
    const data = await api("/api/tracks");
    return data.tracks || [];
  } catch (err) {
    if (err.status === 502) {
      toast(err.message, { error: true });
      return [];
    }
    // Нет serverless-функций (например, запуск через `npx serve`) — берём статический список.
    try {
      return (await import("/data/playlist.js")).playlist;
    } catch {
      toast("Не удалось загрузить плейлист", { error: true });
      return [];
    }
  }
}

// Подменяет плейлист свежим списком с сервера, не прерывая текущий трек
function applyTracks(tracks) {
  const playingId = current()?.id;
  state.tracks = tracks;
  state.index = playingId ? state.tracks.findIndex((t) => t.id === playingId) : -1;
  if (playingId && state.index < 0) resetNowPlaying();
  state.history = [];
  renderList();
}

const ICON_DELETE =
  '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

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
    if (state.admin && t.uploadedAt) {
      extra.innerHTML = `<button class="remove" title="Удалить трек" aria-label="Удалить">${ICON_DELETE}</button>`;
    }

    li.append(num, info, dur, extra);
    frag.append(li);
  });

  els.list.append(frag);
  if (!shown) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = state.tracks.length
      ? "Ничего не найдено"
      : state.admin
        ? "Пока нет треков — загрузите первые выше"
        : "Пока нет треков";
    els.list.append(empty);
  }
  els.count.textContent = state.tracks.length ? `· ${state.tracks.length}` : "";
}

function markActive() {
  els.list.querySelectorAll(".track").forEach((li) => {
    li.classList.toggle("active", +li.dataset.index === state.index);
  });
}

function resetNowPlaying() {
  state.index = -1;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  els.title.textContent = "Выберите трек";
  els.artist.textContent = "—";
  els.shareTrack.hidden = true;
  els.current.textContent = els.duration.textContent = "0:00";
  els.seek.value = 0;
  setRangeFill(els.seek);
  document.title = "Jingle — онлайн плеер";
  history.replaceState(null, "", trackUrl(null));
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
  els.shareTrack.hidden = false;
  document.title = `${t.title}${t.artist ? " — " + t.artist : ""} · Jingle`;
  history.replaceState(null, "", trackUrl(t));

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
    if (err.name === "NotAllowedError") toast("Нажмите ▶, чтобы начать воспроизведение");
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

// auto = true, когда трек закончился сам
function next(auto = false) {
  const n = state.tracks.length;
  if (!n) return;
  if (state.index >= 0) state.history.push(state.index);

  if (state.shuffle) {
    // В режиме перемешивания без зацикливания останавливаемся, когда сыграли все треки
    if (auto && state.repeat === "off" && state.history.length >= n) {
      state.history = [];
      return;
    }
    return load(randomIndex());
  }
  if (state.index + 1 < n) return load(state.index + 1);
  // Конец плейлиста: по кнопке — всегда к первому, автоматически — только если зациклено
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

// ---------- Режимы: зациклить плейлист / повтор трека / перемешать ----------
function renderModes() {
  els.loopAll.setAttribute("aria-pressed", state.repeat === "all");
  els.loopOne.setAttribute("aria-pressed", state.repeat === "one");
  els.shuffle.setAttribute("aria-pressed", state.shuffle);
  audio.loop = state.repeat === "one";
}

function setRepeat(mode) {
  state.repeat = state.repeat === mode ? "off" : mode;
  store.set("repeat", state.repeat);
  renderModes();
  toast(
    { all: "Плейлист зациклен", one: "Повтор текущего трека", off: "Повтор выключен" }[state.repeat],
    { ms: 1500 },
  );
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  state.history = [];
  store.set("shuffle", state.shuffle);
  renderModes();
  toast(state.shuffle ? "Перемешивание включено" : "Перемешивание выключено", { ms: 1500 });
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

// ---------- Media Session (кнопки клавиатуры, наушников, экрана блокировки) ----------
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
    try { navigator.mediaSession.setActionHandler(action, fn); } catch {}
  }
}

// ---------- Администратор ----------
function setAdmin(on) {
  state.admin = on;
  els.loginBtn.hidden = on;
  els.logoutBtn.hidden = !on;
  els.uploadPanel.hidden = !on;
  renderList();
}

async function checkSetup() {
  try {
    const info = await api("/api/auth");
    const problems = [];
    if (!info.storage) problems.push("подключите хранилище Vercel Blob (Storage → Blob, доступ Public)");
    els.setupHint.hidden = !problems.length;
    els.setupHint.textContent = problems.length ? `Загрузка не заработает: ${problems.join("; ")}, затем сделайте Redeploy.` : "";
  } catch {}
}

async function login(password) {
  state.password = password;
  try {
    await api("/api/auth", { method: "POST", admin: true });
    store.set("pw", password);
    setAdmin(true);
    checkSetup();
    return null;
  } catch (err) {
    state.password = null;
    store.set("pw", undefined);
    if (err.status === 404 || err.status === 405) return "Сервер не поддерживает вход (запустите через Vercel)";
    return err.message;
  }
}

function logout() {
  state.password = null;
  store.set("pw", undefined);
  state.queue = [];
  renderQueue();
  setAdmin(false);
  toast("Вы вышли");
}

els.loginBtn.addEventListener("click", () => {
  els.loginError.textContent = "";
  els.password.value = "";
  els.loginDialog.showModal();
  els.password.focus();
});
els.loginCancel.addEventListener("click", () => els.loginDialog.close());
els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = els.loginForm.querySelector('[type="submit"]');
  btn.disabled = true;
  const error = await login(els.password.value);
  btn.disabled = false;
  if (error) {
    els.loginError.textContent = error;
    return;
  }
  els.loginDialog.close();
  toast("Готово! Теперь можно загружать треки");
});
els.logoutBtn.addEventListener("click", logout);

// ---------- Загрузка треков в Vercel Blob ----------
const AUDIO_TYPES = {
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg",
  oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac", webm: "audio/webm",
};

const extOf = (name) => (name.match(/\.([0-9a-z]{2,5})$/i)?.[1] || "").toLowerCase();

function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base };
}

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let lastStamp = 0;
function makePathname(title, artist, ext) {
  // Уникальная метка времени (base36), даже если файлы загружаются в одну миллисекунду
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  const meta = b64url(JSON.stringify({ t: title.slice(0, 120), a: artist.slice(0, 120) }));
  return `tracks/${lastStamp.toString(36)}-${meta}.${ext}`;
}

function addToQueue(files) {
  const accepted = [...files].filter((f) => f.type.startsWith("audio/") || AUDIO_TYPES[extOf(f.name)]);
  if (!accepted.length) {
    toast("Это не похоже на аудиофайлы", { error: true });
    return;
  }
  for (const file of accepted) {
    if (file.size > 200 * 1024 * 1024) {
      toast(`«${file.name}» больше 200 МБ`, { error: true });
      continue;
    }
    state.queue.push({ file, ...parseName(file.name), status: "ready", progress: 0 });
  }
  renderQueue();
}

function renderQueue() {
  els.queue.innerHTML = "";
  state.queue.forEach((item, i) => {
    const li = document.createElement("li");
    const locked = item.status !== "ready" && item.status !== "error";

    const title = document.createElement("input");
    title.placeholder = "Название";
    title.value = item.title;
    title.disabled = locked;
    title.addEventListener("input", () => (item.title = title.value));

    const artist = document.createElement("input");
    artist.className = "q-artist";
    artist.placeholder = "Исполнитель";
    artist.value = item.artist;
    artist.disabled = locked;
    artist.addEventListener("input", () => (item.artist = artist.value));

    const st = document.createElement("span");
    st.className = "q-state" + (item.status === "done" ? " ok" : item.status === "error" ? " err" : "");
    st.textContent = {
      ready: "",
      uploading: `${Math.round(item.progress)}%`,
      done: "Загружено",
      error: "Ошибка",
    }[item.status];
    if (item.status === "error" && item.error) st.title = item.error;

    if (item.status === "ready" || item.status === "error") {
      const rm = document.createElement("button");
      rm.className = "remove";
      rm.title = "Убрать из очереди";
      rm.innerHTML = ICON_DELETE;
      rm.disabled = state.uploading;
      rm.addEventListener("click", () => {
        state.queue.splice(i, 1);
        renderQueue();
      });
      st.append(rm);
    }

    const file = document.createElement("div");
    file.className = "q-file";
    file.textContent = `${item.file.name} · ${fmtSize(item.file.size)}`;

    const bar = document.createElement("div");
    bar.className = "q-bar";
    bar.style.width = `${item.status === "done" ? 100 : item.progress}%`;

    li.append(title, artist, st, file, bar);
    item.el = { st, bar };
    els.queue.append(li);
  });

  const pending = state.queue.some((q) => q.status === "ready" || q.status === "error");
  els.queueActions.hidden = !state.queue.length;
  els.uploadBtn.disabled = state.uploading || !pending;
  els.clearQueueBtn.disabled = state.uploading;
  els.uploadBtn.textContent = state.uploading ? "Загрузка…" : "Загрузить";
}

async function uploadQueue() {
  const items = state.queue.filter((q) => q.status === "ready" || q.status === "error");
  if (!items.length) return;
  for (const item of items) {
    if (!item.title.trim()) {
      toast("У каждого трека должно быть название", { error: true });
      return;
    }
  }

  state.uploading = true;
  renderQueue();

  let upload;
  try {
    ({ upload } = await import("/vendor/blob-client.js"));
  } catch {
    state.uploading = false;
    renderQueue();
    toast("Не удалось загрузить модуль загрузки", { error: true });
    return;
  }

  let ok = 0;
  for (const item of items) {
    item.status = "uploading";
    item.progress = 0;
    renderQueue();

    const ext = AUDIO_TYPES[extOf(item.file.name)] ? extOf(item.file.name) : "mp3";
    const contentType = item.file.type.startsWith("audio/") ? item.file.type : AUDIO_TYPES[ext] || "audio/mpeg";

    try {
      await upload(makePathname(item.title.trim(), item.artist.trim(), ext), item.file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        headers: { "x-admin-password": state.password },
        contentType,
        multipart: item.file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => {
          item.progress = percentage;
          item.el.bar.style.width = `${percentage}%`;
          item.el.st.textContent = `${Math.round(percentage)}%`;
        },
      });
      item.status = "done";
      ok++;
    } catch (err) {
      item.status = "error";
      // Библиотека не передаёт текст ответа сервера — подставляем понятное сообщение
      const tokenFailed = /client token/i.test(err.message);
      item.error = tokenFailed
        ? "Сервер отклонил загрузку: проверьте пароль и подключение Vercel Blob"
        : err.message;
      toast(`«${item.title}»: ${item.error}`, { error: true, ms: 6000 });
      if (tokenFailed) {
        renderQueue();
        checkSetup();
        break;
      }
    }
    renderQueue();
  }

  state.uploading = false;
  state.queue = state.queue.filter((q) => q.status !== "done");
  renderQueue();
  if (ok) {
    // Обновляем playlist.json на сервере и сразу получаем свежий список
    try {
      const data = await api("/api/tracks", { method: "POST", admin: true });
      applyTracks(data.tracks || []);
      toast(`Загружено треков: ${ok}`);
    } catch (err) {
      toast(`Файлы загружены, но плейлист не обновился: ${err.message}. Он обновится при следующей загрузке или удалении.`, { error: true, ms: 8000 });
    }
  }
}

async function deleteTrack(i) {
  const t = state.tracks[i];
  if (!t || !confirm(`Удалить «${t.title}» насовсем?`)) return;
  let data;
  try {
    data = await api(`/api/tracks?url=${encodeURIComponent(t.src)}`, { method: "DELETE", admin: true });
  } catch (err) {
    toast(err.message, { error: true });
    return;
  }
  applyTracks(data.tracks || []);
  toast("Трек удалён");
}

els.fileInput.addEventListener("change", (e) => {
  addToQueue(e.target.files);
  e.target.value = "";
});
els.uploadBtn.addEventListener("click", uploadQueue);
els.clearQueueBtn.addEventListener("click", () => {
  state.queue = [];
  renderQueue();
});

// Drag & drop файлов (только для администратора)
let dragDepth = 0;
const hasFiles = (e) => state.admin && [...(e.dataTransfer?.types || [])].includes("Files");
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
  addToQueue(e.dataTransfer.files);
});
window.addEventListener("beforeunload", (e) => {
  if (state.uploading) e.preventDefault();
});

// ---------- События аудио ----------
const syncPlaying = () => app.classList.toggle("playing", !audio.paused);
for (const ev of ["play", "pause", "emptied", "ended", "loadstart"]) audio.addEventListener(ev, syncPlaying);
audio.addEventListener("waiting", () => app.classList.add("loading"));
for (const ev of ["playing", "canplay", "pause", "emptied"]) audio.addEventListener(ev, () => app.classList.remove("loading"));

audio.addEventListener("loadedmetadata", () => {
  els.duration.textContent = fmt(audio.duration);
  const t = current();
  if (t && Number.isFinite(audio.duration)) {
    state.durations[t.id] = audio.duration;
    store.set("durations", state.durations);
    const cell = els.list.querySelector(`.track[data-index="${state.index}"] .dur`);
    if (cell) cell.textContent = fmt(audio.duration);
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
  if (t && Date.now() - lastSaved > 3000) {
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
  const t = current();
  toast(`Не удалось воспроизвести «${t ? t.title : "трек"}»`, { error: true });
  // Пропускаем битый трек, но не уходим в бесконечный цикл
  if (++errorSkips < state.tracks.length) setTimeout(() => next(true), 1200);
});
audio.addEventListener("playing", () => (errorSkips = 0));

// ---------- События интерфейса ----------
els.play.addEventListener("click", toggle);
els.next.addEventListener("click", () => next());
els.prev.addEventListener("click", prev);
els.loopAll.addEventListener("click", () => setRepeat("all"));
els.loopOne.addEventListener("click", () => setRepeat("one"));
els.shuffle.addEventListener("click", toggleShuffle);
els.mute.addEventListener("click", toggleMute);
els.volume.addEventListener("input", (e) => setVolume(+e.target.value));
els.shareSite.addEventListener("click", () => share(trackUrl(null), "Jingle — онлайн плеер"));
els.shareTrack.addEventListener("click", () => {
  const t = current();
  if (t) share(trackUrl(t), `${t.title}${t.artist ? " — " + t.artist : ""}`);
});

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
  if (e.target.closest(".remove")) return deleteTrack(i);
  if (i === state.index) toggle();
  else {
    if (state.index >= 0) state.history.push(state.index);
    load(i);
  }
});
els.list.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.closest(".remove")) return;
  const li = e.target.closest(".track");
  if (li) li.click();
});

els.search.addEventListener("input", (e) => {
  state.filter = e.target.value;
  renderList();
});

// Горячие клавиши
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (els.loginDialog.open) return;
  const t = e.target;
  if (t.closest?.("input, textarea") && t.type !== "range") return;
  if (e.code === "Space" && t.closest?.("button, label")) return; // кнопка обработает сама
  const onRange = t.type === "range";
  switch (e.code) {
    case "Space": e.preventDefault(); toggle(); break;
    case "ArrowRight": if (!onRange) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); break;
    case "ArrowLeft": if (!onRange) audio.currentTime = Math.max(0, audio.currentTime - 5); break;
    case "ArrowUp": if (!onRange) { e.preventDefault(); setVolume(audio.volume + 0.05); } break;
    case "ArrowDown": if (!onRange) { e.preventDefault(); setVolume(audio.volume - 0.05); } break;
    case "KeyN": next(); break;
    case "KeyP": prev(); break;
    case "KeyR": setRepeat("all"); break;
    case "KeyT": setRepeat("one"); break;
    case "KeyS": toggleShuffle(); break;
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

  // Если в этом браузере уже входили — проверяем сохранённый пароль
  const savedPw = state.password;
  const [tracks] = await Promise.all([fetchTracks(), savedPw ? login(savedPw) : null]);
  state.tracks = tracks;
  renderList();

  // Ссылка вида /?t=<id> открывает конкретный трек
  const sharedId = new URLSearchParams(location.search).get("t");
  const last = store.get("last", null);
  const sharedIndex = sharedId ? state.tracks.findIndex((t) => t.id === sharedId) : -1;
  const lastIndex = last ? state.tracks.findIndex((t) => t.id === last.id) : -1;

  if (sharedIndex >= 0) {
    load(sharedIndex, { autoplay: false, startAt: sharedIndex === lastIndex ? last.time || 0 : 0 });
    toast("Нажмите ▶, чтобы слушать", { ms: 4000 });
  } else {
    if (sharedId) toast("Трек по ссылке не найден — возможно, его удалили", { error: true });
    if (lastIndex >= 0) load(lastIndex, { autoplay: false, startAt: last.time || 0 });
  }
})();
