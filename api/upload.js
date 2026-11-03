import { handleUpload } from "@vercel/blob/client";
import { requireAdmin } from "../lib/auth.js";
import { TRACK_PATH_RE, storageConfigured } from "../lib/tracks.js";

const MAX_SIZE = 200 * 1024 * 1024; // 200 МБ на файл

// POST /api/upload — выдаёт браузеру одноразовый токен для прямой загрузки файла в Vercel Blob.
// Сам файл идёт из браузера прямо в хранилище, минуя лимит 4.5 МБ на тело запроса функции.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!storageConfigured()) {
    return res.status(503).json({ error: "Хранилище Vercel Blob не подключено к проекту" });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => {
        if (!TRACK_PATH_RE.test(pathname)) throw new Error("Недопустимое имя файла");
        return {
          allowedContentTypes: ["audio/*"],
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        };
      },
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Ошибка загрузки" });
  }
}
