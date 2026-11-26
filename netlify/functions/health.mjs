import { getServerHealth } from "../../lib/proxy-core.mjs";

export default async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
        return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
    return new Response(JSON.stringify(getServerHealth(process.env)), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
};
