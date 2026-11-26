import { handleAiProxyRequest } from "../../lib/proxy-core.mjs";

export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
    }
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }

    let body = {};
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ ok: false, error: "JSON body không hợp lệ." }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }

    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    const result = await handleAiProxyRequest(body, process.env, origin);
    return new Response(JSON.stringify(result.json), {
        status: result.status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
};
