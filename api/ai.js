import { handleAiProxyRequest } from "../lib/proxy-core.mjs";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ ok: false, error: "JSON body không hợp lệ." });
        }
    }

    const origin = req.headers?.origin || req.headers?.referer || "";
    const result = await handleAiProxyRequest(body || {}, process.env, origin);
    return res.status(result.status).json(result.json);
}
