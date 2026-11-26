import { handleHarvestProxyRequest } from "../../lib/proxy-core.mjs";

export default async (req) => {
    if (req.method !== "GET") {
        return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }

    const urlObj = new URL(req.url);
    const targetUrl = urlObj.searchParams.get("url") || "";
    const result = await handleHarvestProxyRequest(targetUrl);
    return new Response(result.body, {
        status: result.status,
        headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, max-age=120"
        }
    });
};
