// Треки хранятся в Vercel Blob по пути:
//   tracks/<время-base36>-<base64url(JSON {t: название, a: исполнитель})>.<расширение>
// Так название и исполнитель (в т.ч. кириллица) хранятся прямо в имени файла
// и не нужна отдельная база данных.

export const TRACK_PREFIX = "tracks/";
export const TRACK_PATH_RE = /^tracks\/([0-9a-z]{6,12})-([A-Za-z0-9_-]{2,800})\.([0-9a-z]{2,5})$/;

export const storageConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export function decodeTrackMeta(encoded) {
  try {
    const meta = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return {
      title: typeof meta.t === "string" && meta.t.trim() ? meta.t.trim().slice(0, 200) : null,
      artist: typeof meta.a === "string" ? meta.a.trim().slice(0, 200) : "",
    };
  } catch {
    return null;
  }
}

export function blobToTrack(blob) {
  const m = TRACK_PATH_RE.exec(blob.pathname);
  if (!m) return null;
  const meta = decodeTrackMeta(m[2]);
  if (!meta || !meta.title) return null;
  return {
    id: m[1],
    title: meta.title,
    artist: meta.artist,
    src: blob.url,
    size: blob.size,
    uploadedAt: new Date(blob.uploadedAt).toISOString(),
  };
}

export function isTrackBlobUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".blob.vercel-storage.com") &&
      TRACK_PATH_RE.test(decodeURIComponent(u.pathname.slice(1)))
    );
  } catch {
    return false;
  }
}
