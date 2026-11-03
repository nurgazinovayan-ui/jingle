import { playlist } from "../data/playlist.js";

// GET /api/tracks            — весь плейлист
// GET /api/tracks?q=текст    — поиск по названию / исполнителю
export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const url = new URL(req.url, "http://localhost");
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const tracks = q
    ? playlist.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q))
    : playlist;

  res.status(200).json({ count: tracks.length, tracks });
}
