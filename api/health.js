import { getServerHealth } from "../lib/proxy-core.mjs";

export default function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "HEAD") {
        return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }
    return res.status(200).json(getServerHealth(process.env));
}
