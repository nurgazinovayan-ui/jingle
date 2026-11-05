// Плейлист хранится одним файлом playlist.json в Vercel Blob.
//
// Зачем: list() — «сложная» операция Blob (на Hobby всего 2 000 в месяц), и раньше
// она вызывалась при каждом открытии сайта. Теперь слушатели читают только playlist.json
// через CDN хранилища (попадание в кэш бесплатно, промах — дешёвая «простая» операция),
// а list() + put() выполняются лишь когда администратор загружает или удаляет треки.
import { get, list, put } from "@vercel/blob";
import { TRACK_PREFIX, blobToTrack } from "./tracks.js";

export const MANIFEST_PATH = "playlist.json";

async function streamToText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Читает playlist.json. Возвращает массив треков или null, если файла ещё нет / он повреждён. */
export async function readManifest() {
  const res = await get(MANIFEST_PATH, { access: "public" });
  if (!res || res.statusCode !== 200) return null;
  try {
    const data = JSON.parse(await streamToText(res.stream));
    return Array.isArray(data.tracks) ? data.tracks : null;
  } catch {
    return null;
  }
}

/**
 * Пересобирает playlist.json по реальным файлам в хранилище (источник истины — сами файлы),
 * поэтому плейлист не может «разъехаться» с хранилищем. Стоит 1 list() + 1 put().
 */
export async function rebuildManifest() {
  const tracks = [];
  let cursor;
  do {
    const page = await list({ prefix: TRACK_PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const t = blobToTrack(blob);
      if (t) tracks.push(t);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  tracks.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

  await put(MANIFEST_PATH, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), tracks }), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60, // минимум у Blob; новые треки видны слушателям в течение ~1–2 минут
  });
  return tracks;
}
