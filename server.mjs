import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    getServerHealth,
    handleAiProxyRequest,
    handleHarvestProxyRequest
} from "./lib/proxy-core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2"
};

/** Lightweight .env loader (no external packages needed) */
export function loadDotEnv(envPath = path.join(__dirname, ".env")) {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!(key in process.env) || !process.env[key]) {
            process.env[key] = val;
        }
    }
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on("data", (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error("Payload vượt quá 2MB."));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8").trim();
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error("JSON body không hợp lệ."));
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res, status, data) {
    const payload = JSON.stringify(data);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(payload);
}

export function createAppServer(env = process.env) {
    return http.createServer(async (req, res) => {
        try {
            const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
            const pathname = decodeURIComponent(reqUrl.pathname);

            // --- API ROUTES ---
            if (pathname === "/api/health") {
                if (req.method !== "GET" && req.method !== "HEAD") {
                    return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
                }
                return sendJson(res, 200, getServerHealth(env));
            }

            if (pathname === "/api/ai") {
                if (req.method === "OPTIONS") {
                    res.writeHead(204);
                    return res.end();
                }
                if (req.method !== "POST") {
                    return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
                }
                let body;
                try {
                    body = await readJsonBody(req);
                } catch (err) {
                    return sendJson(res, 400, { ok: false, error: err.message });
                }
                const origin = req.headers.origin || req.headers.referer || "";
                const result = await handleAiProxyRequest(body, env, origin);
                return sendJson(res, result.status, result.json);
            }

            if (pathname === "/api/harvest") {
                if (req.method !== "GET") {
                    return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });
                }
                const targetUrl = reqUrl.searchParams.get("url") || "";
                const result = await handleHarvestProxyRequest(targetUrl);
                res.writeHead(result.status, {
                    "Content-Type": result.contentType,
                    "Cache-Control": "public, max-age=120"
                });
                return res.end(result.body);
            }

            // --- STATIC FILE SERVER (public/) ---
            if (req.method !== "GET" && req.method !== "HEAD") {
                res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
                return res.end("Method Not Allowed");
            }

            const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
            const fullPath = path.resolve(PUBLIC_DIR, relPath);
            if (!fullPath.startsWith(PUBLIC_DIR + path.sep) && fullPath !== PUBLIC_DIR) {
                res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
                return res.end("Forbidden");
            }

            let targetFile = fullPath;
            try {
                const stat = await fsp.stat(targetFile);
                if (stat.isDirectory()) {
                    targetFile = path.join(targetFile, "index.html");
                }
            } catch {
                // Fallback to index.html for clean routes, 404 for missing asset extensions
                if (path.extname(relPath)) {
                    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                    return res.end("Not Found");
                }
                targetFile = path.join(PUBLIC_DIR, "index.html");
            }

            const ext = path.extname(targetFile).toLowerCase();
            const contentType = MIME_TYPES[ext] || "application/octet-stream";
            const fileBuf = await fsp.readFile(targetFile);

            res.writeHead(200, {
                "Content-Type": contentType,
                "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
                "X-Content-Type-Options": "nosniff"
            });
            if (req.method === "HEAD") return res.end();
            return res.end(fileBuf);
        } catch (err) {
            return sendJson(res, 500, { ok: false, error: `Internal Server Error: ${err.message}` });
        }
    });
}

// Direct CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    loadDotEnv();
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || "0.0.0.0";
    const server = createAppServer(process.env);
    server.listen(port, host, () => {
        const health = getServerHealth(process.env);
        const activeProviders = Object.entries(health.configuredProviders)
            .filter(([, ok]) => ok)
            .map(([k]) => k)
            .join(", ");
        console.log(`\n⚡ THPTQG 2026 Vật Lý Studio đang chạy tại http://localhost:${port}`);
        console.log(`   Server Proxy AI Keys: ${activeProviders || "Chưa đặt trong .env (người dùng tự nhập Key miễn phí trên trình duyệt)"}`);
    });
}
