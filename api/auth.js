import { adminConfigured, isAdmin } from "../lib/auth.js";
import { storageConfigured } from "../lib/tracks.js";

// GET  /api/auth — настроен ли сервер (пароль, хранилище)
// POST /api/auth — проверить пароль (заголовок x-admin-password)
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const info = { adminConfigured: adminConfigured(), storage: storageConfigured() };

  if (req.method === "GET") return res.status(200).json(info);
  if (req.method === "POST") {
    if (!info.adminConfigured) return res.status(503).json({ ...info, error: "ADMIN_PASSWORD не задан в настройках проекта на Vercel" });
    if (!isAdmin(req)) return res.status(401).json({ ...info, error: "Неверный пароль" });
    return res.status(200).json({ ...info, ok: true });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method Not Allowed" });
}
