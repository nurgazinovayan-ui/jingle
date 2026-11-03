import { list, del } from "@vercel/blob";
import { playlist } from "../data/playlist.js";
import { requireAdmin } from "../lib/auth.js";
import { TRACK_PREFIX, blobToTrack, isTrackBlobUrl, storageConfigured } from "../lib/tracks.js";

// GET    /api/tracks            — все треки (публично, кэшируется на CDN)
// DELETE /api/tracks?url=<url>  — удалить загруженный трек (только администратор)
export default async function handler(req, res) {
  if (req.method === "GET") return getTracks(req, res);
  if (req.method === "DELETE") return deleteTrack(req, res);
  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ error: "Method Not Allowed" });
}

async function getTracks(req, res) {
  const tracks = [...playlist];
  const storage = storageConfigured();

  if (storage) {
    try {
      const uploaded = [];
      let cursor;
      do {
        const page = await list({ prefix: TRACK_PREFIX, cursor, limit: 1000 });
        for (const blob of page.blobs) {
          const t = blobToTrack(blob);
          if (t) uploaded.push(t);
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      uploaded.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
      tracks.push(...uploaded);
    } catch (err) {
      console.error("Blob list failed:", err);
      res.setHeader("Cache-Control", "no-store");
      return res.status(502).json({ error: "Не удалось получить список треков из хранилища" });
    }
  }

  // Кэш на CDN Vercel: 30 секунд свежий, потом обновляется в фоне.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=86400");
  return res.status(200).json({ storage, count: tracks.length, tracks });
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
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Blob delete failed:", err);
    return res.status(502).json({ error: "Не удалось удалить трек" });
  }
}
