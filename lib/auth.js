import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s) => createHash("sha256").update(String(s)).digest();

/** Пароль администратора задаётся переменной окружения ADMIN_PASSWORD в настройках Vercel. */
export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  const given = req.headers["x-admin-password"];
  if (!expected || typeof given !== "string" || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

/** Возвращает true, если запрос от администратора; иначе сам отвечает ошибкой. */
export function requireAdmin(req, res) {
  if (!adminConfigured()) {
    res.status(503).json({ error: "ADMIN_PASSWORD не задан в настройках проекта на Vercel" });
    return false;
  }
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Неверный пароль" });
    return false;
  }
  return true;
}
