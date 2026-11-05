import { del } from "@vercel/blob";
import { playlist } from "../data/playlist.js";
import { requireAdmin } from "../lib/auth.js";
import { readManifest, rebuildManifest } from "../lib/manifest.js";
import { isTrackBlobUrl, storageConfigured } from "../lib/tracks.js";

// GET    /api/tracks            — все треки (публично, кэшируется на CDN; читает только playlist.json)
// POST   /api/tracks            — пересобрать плейлист после загрузки (только администратор)
// DELETE /api/tracks?url=<url>  — удалить трек и пересобрать плейлист (только администратор)
export default async function handler(req, res) {
  if (req.method === "GET") return getTracks(req, res);
  if (req.method === "POST") return syncTracks(req, res);
  if (req.method === "DELETE") return deleteTrack(req, res);
  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method Not Allowed" });
}

const respond = (res, uploaded) => {
  const tracks = [...playlist, ...uploaded];
  return res.status(200).json({ storage: storageConfigured(), count: tracks.length, tracks });
};

const fail = (res, err, message) => {
  console.error(message, err);
  res.setHeader("Cache-Control", "no-store");
  return res.status(502).json({ error: message });
};

async function getTracks(req, res) {
  if (!storageConfigured()) {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    return respond(res, []);
  }
  let uploaded;
  try {
    uploaded = await readManifest();
    // Первый запуск (или файл повреждён) — один раз собираем плейлист из хранилища
    if (!uploaded) uploaded = await rebuildManifest();
  } catch (err) {
    return fail(res, err, "Не удалось получить список треков из хранилища");
  }
  // CDN Vercel держит ответ 60 секунд, потом обновляет его в фоне
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=86400");
  return respond(res, uploaded);
}

async function syncTracks(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireAdmin(req, res)) return;
  try {
    return respond(res, await rebuildManifest());
  } catch (err) {
    return fail(res, err, "Не удалось обновить плейлист");
  }
}

async function deleteTrack(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!requireAdmin(req, res)) return;

  const url = new URL(req.url, "http://localhost").searchParams.get("url");
  if (!url || !isTrackBlobUrl(url)) {
    return res.status(400).json({ error: "Некорректная ссылка на трек" });
  }
  try {
    await del(url);
    return respond(res, await rebuildManifest());
  } catch (err) {
    return fail(res, err, "Не удалось удалить трек");
  }
}
