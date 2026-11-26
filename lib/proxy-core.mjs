/**
 * Shared server-side proxy core for Vercel Serverless Functions,
 * Netlify Functions, and local Node.js server.
 * Zero external npm dependencies (uses Node 20+ built-in fetch).
 */

export const DEFAULT_MODELS = {
    gemini: "gemini-3.5-flash-lite",
    groq: "openai/gpt-oss-120b",
    openrouter: "openrouter/free",
    custom: ""
};

const HARVEST_ALLOWED_HOSTS = new Map([
    ["datasets-server.huggingface.co", ["/splits", "/size", "/rows", "/filter"]],
    ["huggingface.co", ["/datasets/"]],
    ["api.stackexchange.com", ["/2.3/"]]
]);

const MAX_HARVEST_BYTES = 15 * 1024 * 1024; // 15 MB cap

export function getServerHealth(env = process.env) {
    const configuredProviders = {
        gemini: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()),
        groq: Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim()),
        openrouter: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim()),
        custom: Boolean(env.CUSTOM_AI_BASE_URL && env.CUSTOM_AI_BASE_URL.trim() && env.CUSTOM_AI_MODEL && env.CUSTOM_AI_MODEL.trim())
    };

    const serverHasAnyKey = Object.values(configuredProviders).some(Boolean);

    let defaultProvider = (env.DEFAULT_AI_PROVIDER || "").trim().toLowerCase();
    if (!["gemini", "groq", "openrouter", "custom"].includes(defaultProvider) || !configuredProviders[defaultProvider]) {
        if (configuredProviders.gemini) defaultProvider = "gemini";
        else if (configuredProviders.groq) defaultProvider = "groq";
        else if (configuredProviders.openrouter) defaultProvider = "openrouter";
        else if (configuredProviders.custom) defaultProvider = "custom";
        else defaultProvider = "gemini";
    }

    const defaultModel =
        (env.DEFAULT_AI_MODEL && env.DEFAULT_AI_MODEL.trim()) ||
        (defaultProvider === "custom" ? (env.CUSTOM_AI_MODEL || "").trim() : DEFAULT_MODELS[defaultProvider]);

    return {
        ok: true,
        mode: "proxy",
        subject: "physics-2026",
        serverHasAnyKey,
        configuredProviders,
        defaultProvider,
        defaultModel
    };
}

/**
 * Clamps thinkingLevel according to official Gemini 4 & 3.x API conventions.
 * Returns null for legacy models where thinkingLevel is unsupported.
 */
export function resolveGeminiThinkingLevel(modelId, requestedLevel) {
    if (!requestedLevel) return null;
    const m = String(modelId || "").toLowerCase();
    const lvl = String(requestedLevel).trim().toUpperCase();

    if (m.startsWith("gemini-4-hydrogen") || m.startsWith("gemini-4-neon")) {
        if (lvl === "MINIMAL") return "LOW";
        if (["LOW", "MEDIUM", "HIGH", "XHIGH"].includes(lvl)) return lvl;
        return "MEDIUM";
    }
    if (m.startsWith("gemini-4-") || m.startsWith("gemini-3.8-")) {
        if (lvl === "MINIMAL") return "LOW";
        if (lvl === "XHIGH") return "HIGH";
        if (["LOW", "MEDIUM", "HIGH"].includes(lvl)) return lvl;
        return "MEDIUM";
    }
    if (m.startsWith("gemini-3")) {
        if (lvl === "XHIGH") return "HIGH";
        if (["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(lvl)) return lvl;
        return "LOW";
    }
    return null;
}

/**
 * Builds a Gemini generateContent REST payload compliant with Gemini 4 & 3.x rules
 * (omits removed sampling params temperature/topP/topK and deprecated thinkingBudget).
 */
export function buildGeminiPayload({ model, systemInstruction, prompt, responseSchema, useGoogleSearch, thinkingLevel }) {
    const payload = {
        contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }]
    };

    if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
    }

    if (useGoogleSearch) {
        payload.tools = [{ google_search: {} }];
    }

    const generationConfig = {};
    if (responseSchema && !useGoogleSearch) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = responseSchema;
    }

    const safeLevel = resolveGeminiThinkingLevel(model, thinkingLevel);
    if (safeLevel) {
        generationConfig.thinkingConfig = { thinkingLevel: safeLevel };
    }

    if (Object.keys(generationConfig).length > 0) {
        payload.generationConfig = generationConfig;
    }

    return payload;
}

export function extractGeminiResponse(data) {
    const candidate = data?.candidates?.[0];
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
        .filter((p) => p && typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("\n")
        .trim();

    const groundingLinks = [];
    const seen = new Set();
    const gm = candidate?.groundingMetadata;

    if (Array.isArray(gm?.groundingChunks)) {
        for (const ch of gm.groundingChunks) {
            const uri = ch?.web?.uri;
            if (uri && !seen.has(uri)) {
                seen.add(uri);
                groundingLinks.push({ uri, title: ch.web.title || "" });
            }
        }
    }
    if (Array.isArray(gm?.groundingAttributions)) {
        for (const attr of gm.groundingAttributions) {
            const uri = attr?.web?.uri;
            if (uri && !seen.has(uri)) {
                seen.add(uri);
                groundingLinks.push({ uri, title: attr.web.title || "" });
            }
        }
    }

    return {
        text,
        groundingLinks,
        finishReason: candidate?.finishReason || "",
        usage: data?.usageMetadata || null
    };
}

export function buildSchemaHintForOpenAI(responseSchema) {
    if (!responseSchema) return "";
    return `\n\nQUAN TRỌNG VỀ ĐỊNH DẠNG ĐẦU RA: Chỉ trả về ĐÚNG 1 đối tượng JSON hợp lệ (KHÔNG kèm markdown \`\`\`json hay lời giải thích ngoài JSON), tuân thủ chặt chẽ cấu trúc JSON Schema sau:\n${JSON.stringify(responseSchema)}`;
}

export function stripInlineThinkTags(rawText) {
    return String(rawText || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
}

export function validateCustomBaseUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || "").trim());
    } catch {
        return { ok: false, error: "Base URL không hợp lệ." };
    }

    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === "localhost" || host === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
        return { ok: false, error: "Custom Base URL bắt buộc dùng HTTPS (hoặc http://localhost khi chạy máy cá nhân)." };
    }

    // Block AWS/GCP/Azure link-local metadata & private RFC1918 ranges on hosted servers
    const blockedHosts = [
        "169.254.169.254",
        "metadata.google.internal",
        "metadata",
        "0.0.0.0",
        "::1"
    ];
    if (blockedHosts.includes(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return { ok: false, error: "Custom Base URL không được trỏ tới địa chỉ mạng nội bộ." };
    }

    const cleanBase = parsed.toString().replace(/\/+$/, "");
    const endpoint = cleanBase.endsWith("/chat/completions") ? cleanBase : `${cleanBase}/chat/completions`;
    return { ok: true, endpoint };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 52000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

export async function handleAiProxyRequest(body = {}, env = process.env, originHeader = "") {
    const provider = String(body.provider || getServerHealth(env).defaultProvider || "gemini").toLowerCase();
    if (!["gemini", "groq", "openrouter", "custom"].includes(provider)) {
        return { status: 400, json: { ok: false, error: `Nhà cung cấp AI không hợp lệ: ${provider}` } };
    }

    const model = String(body.model || DEFAULT_MODELS[provider] || (provider === "custom" ? env.CUSTOM_AI_MODEL : "") || "").trim();
    if (!model) {
        return { status: 400, json: { ok: false, error: "Thiếu tên model AI." } };
    }

    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
        return { status: 400, json: { ok: false, error: "Thiếu nội dung prompt." } };
    }

    const clientKey = typeof body.clientApiKey === "string" ? body.clientApiKey.trim() : "";
    const serverKeys = {
        gemini: (env.GEMINI_API_KEY || "").trim(),
        groq: (env.GROQ_API_KEY || "").trim(),
        openrouter: (env.OPENROUTER_API_KEY || "").trim(),
        custom: (env.CUSTOM_AI_API_KEY || "").trim()
    };
    const apiKey = clientKey || serverKeys[provider];

    if (!apiKey && provider !== "custom") {
        return {
            status: 401,
            json: {
                ok: false,
                code: "MISSING_API_KEY",
                error: `Chưa có API Key cho nhà cung cấp "${provider}". Hãy cấu hình trong mục Cài đặt AI hoặc thêm biến môi trường trên server.`
            }
        };
    }

    const requestedTimeout = Number(body.timeoutMs);
    const requestTimeoutMs = Number.isFinite(requestedTimeout)
        ? Math.min(55000, Math.max(8000, Math.round(requestedTimeout)))
        : 38000;

    // --- 1. GOOGLE GEMINI REST API ---
    if (provider === "gemini") {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        const payload = buildGeminiPayload({
            model,
            systemInstruction: body.systemInstruction,
            prompt,
            responseSchema: body.responseSchema,
            useGoogleSearch: Boolean(body.useGoogleSearch),
            thinkingLevel: body.thinkingLevel
        });

        try {
            const res = await fetchWithTimeout(
                endpoint,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: JSON.stringify(payload)
                },
                requestTimeoutMs
            );

            const rawBody = await res.text();
            if (!res.ok) {
                let errMsg = rawBody.slice(0, 260);
                try {
                    const parsedErr = JSON.parse(rawBody);
                    errMsg = parsedErr?.error?.message || errMsg;
                } catch {
                    // keep slice
                }
                return {
                    status: res.status,
                    json: {
                        ok: false,
                        provider,
                        model,
                        retryable: res.status === 429 || res.status >= 500,
                        error: `Gemini HTTP ${res.status}: ${errMsg}`
                    }
                };
            }

            const data = JSON.parse(rawBody);
            const extracted = extractGeminiResponse(data);
            return {
                status: 200,
                json: {
                    ok: true,
                    provider,
                    model,
                    text: extracted.text,
                    groundingLinks: extracted.groundingLinks,
                    usage: extracted.usage
                }
            };
        } catch (err) {
            return {
                status: 504,
                json: {
                    ok: false,
                    provider,
                    model,
                    retryable: true,
                    error: `Lỗi kết nối Gemini API: ${err.name === "AbortError" ? `Quá thời gian chờ (${Math.round(requestTimeoutMs / 1000)}s)` : err.message}`
                }
            };
        }
    }

    // --- 2. OPENAI-COMPATIBLE PROVIDERS (GROQ, OPENROUTER, CUSTOM) ---
    let endpoint = "";
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    if (provider === "groq") {
        endpoint = "https://api.groq.com/openai/v1/chat/completions";
    } else if (provider === "openrouter") {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
        headers["HTTP-Referer"] = originHeader || "https://thptqg-vatly-2026.vercel.app";
        headers["X-Title"] = "THPTQG 2026 Vat Ly Studio";
    } else {
        const rawBase = String(body.customBaseUrl || env.CUSTOM_AI_BASE_URL || "").trim();
        const check = validateCustomBaseUrl(rawBase);
        if (!check.ok) {
            return { status: 400, json: { ok: false, error: check.error } };
        }
        endpoint = check.endpoint;
    }

    const schemaHint = buildSchemaHintForOpenAI(body.responseSchema);
    const messages = [];
    if (body.systemInstruction) {
        messages.push({ role: "system", content: `${body.systemInstruction}${schemaHint}` });
        messages.push({ role: "user", content: prompt });
    } else {
        messages.push({ role: "user", content: `${prompt}${schemaHint}` });
    }

    const callOpenAICompat = async (includeResponseFormat) => {
        const reqBody = {
            model,
            messages
        };
        if (includeResponseFormat && body.responseSchema) {
            reqBody.response_format = { type: "json_object" };
        }
        return fetchWithTimeout(
            endpoint,
            {
                method: "POST",
                headers,
                body: JSON.stringify(reqBody)
            },
            requestTimeoutMs
        );
    };

    try {
        let res = await callOpenAICompat(Boolean(body.responseSchema));
        // Some rotating OpenRouter :free models return 400 if response_format is set
        if (res.status === 400 && body.responseSchema) {
            const firstErr = await res.text().catch(() => "");
            if (/response_format|json_object|unsupported/i.test(firstErr)) {
                res = await callOpenAICompat(false);
            } else {
                return {
                    status: 400,
                    json: { ok: false, provider, model, retryable: false, error: `${provider} HTTP 400: ${firstErr.slice(0, 260)}` }
                };
            }
        }

        const rawBody = await res.text();
        if (!res.ok) {
            let errMsg = rawBody.slice(0, 260);
            try {
                const parsedErr = JSON.parse(rawBody);
                errMsg = parsedErr?.error?.message || parsedErr?.message || errMsg;
            } catch {
                // keep slice
            }
            return {
                status: res.status,
                json: {
                    ok: false,
                    provider,
                    model,
                    retryable: res.status === 429 || res.status >= 500,
                    error: `${provider} HTTP ${res.status}: ${errMsg}`
                }
            };
        }

        const data = JSON.parse(rawBody);
        const content = data?.choices?.[0]?.message?.content || "";
        return {
            status: 200,
            json: {
                ok: true,
                provider,
                model: data?.model || model,
                text: stripInlineThinkTags(content),
                groundingLinks: [],
                usage: data?.usage || null
            }
        };
    } catch (err) {
        return {
            status: 504,
            json: {
                ok: false,
                provider,
                model,
                retryable: true,
                error: `Lỗi kết nối ${provider}: ${err.name === "AbortError" ? `Quá thời gian chờ (${Math.round(requestTimeoutMs / 1000)}s)` : err.message}`
            }
        };
    }
}

export function validateHarvestUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || "").trim());
    } catch {
        return { ok: false, error: "URL nguồn không hợp lệ." };
    }
    if (parsed.protocol !== "https:") {
        return { ok: false, error: "Chỉ cho phép giao thức HTTPS." };
    }
    const allowedPrefixes = HARVEST_ALLOWED_HOSTS.get(parsed.hostname.toLowerCase());
    if (!allowedPrefixes) {
        return { ok: false, error: `Host "${parsed.hostname}" không nằm trong danh sách nguồn Vật Lý mở được phép.` };
    }
    const pathOk = allowedPrefixes.some((prefix) => parsed.pathname.startsWith(prefix));
    if (!pathOk) {
        return { ok: false, error: `Đường dẫn "${parsed.pathname}" không được phép proxy.` };
    }
    return { ok: true, url: parsed.toString() };
}

const SERVER_MISSING_FIGURE_PATTERNS = [
    // Raw image / diagram markup (LaTeX, Asymptote, Markdown, HTML)
    { label: "\\includegraphics", re: /\\includegraphics/i },
    { label: "[asy]", re: /\[asy\]/i },
    { label: "![", re: /!\[/ },
    { label: "<img", re: /<img\b/i },
    // Vietnamese figure / graph / circuit / variation-table references
    { label: "hình vẽ", re: /hình\s+vẽ/i },
    { label: "hình bên", re: /hình\s+bên/i },
    { label: "hình dưới", re: /hình\s+dưới/i },
    { label: "hình sau", re: /(?:như|cho|ở|theo|từ|xem|quan\s+sát|trên)\s+hình\s+sau|\bhình\s+sau\s+đây/i },
    { label: "hình trên", re: /(?:như|ở|theo|từ|xem|quan\s+sát|trên)\s+hình\s+trên/i },
    { label: "như hình", re: /như\s+hình/i },
    { label: "quan sát hình", re: /quan\s+sát\s+hình/i },
    { label: "đồ thị bên", re: /đồ\s+thị\s+(?:hình\s+)?bên/i },
    { label: "đồ thị sau", re: /đồ\s+thị\s+(?:như\s+hình\s+)?(?:sau|dưới(?:\s+đây)?|trên)/i },
    { label: "quan sát đồ thị", re: /quan\s+sát\s+đồ\s+thị/i },
    { label: "mạch điện bên", re: /(?:sơ\s+đồ\s+)?mạch\s+điện\s+(?:hình\s+)?(?:bên|dưới(?:\s+đây)?|sau|như\s+hình)/i },
    { label: "sơ đồ bên", re: /sơ\s+đồ\s+(?:hình\s+)?(?:bên|dưới(?:\s+đây)?|sau)/i },
    { label: "bảng biến thiên", re: /bảng\s+biến\s+thiên\s+(?:sau|dưới(?:\s+đây)?|bên|như\s+hình|trên)|cho\s+bảng\s+biến\s+thiên/i },
    { label: "hình số", re: /(?:như|theo|ở|từ|trên|trong|xem|cho|tại|nhìn)\s+hình\s+(?:[1-9]\d*|[a-d]\b)/i },
    // English figure / diagram / graph references
    { label: "as shown in the figure", re: /(?:as\s+)?shown\s+in\s+(?:the\s+)?fig(?:ure|\.)/i },
    { label: "in the diagram", re: /(?:in|from|on|see|shown\s+in)\s+the\s+diagram/i },
    { label: "the graph below", re: /(?:the\s+)?graph\s+(?:below|above|shown|shows)|following\s+graph/i },
    { label: "the figure shows", re: /(?:the\s+)?fig(?:ure|\.)\s+(?:shows|below|above|illustrates|depicts)|(?:see|refer\s+to|in|from)\s+(?:the\s+)?fig(?:ure|\.)|following\s+(?:figure|diagram)/i },
    { label: "diagram below", re: /diagram\s+(?:below|above|shows|shown)|(?:picture|circuit)\s+(?:below|shown)/i }
];

export function detectServerMissingFigureText(rawText) {
    if (!rawText) return { hasMissingFigure: false, matched: "" };
    const normalized = String(rawText).normalize("NFC");
    for (const rule of SERVER_MISSING_FIGURE_PATTERNS) {
        const m = normalized.match(rule.re);
        if (m) {
            return { hasMissingFigure: true, matched: m[0] || rule.label };
        }
    }
    return { hasMissingFigure: false, matched: "" };
}

function collectRowStringsForHarvestFilter(rowObj) {
    if (!rowObj || typeof rowObj !== "object") return "";
    const parts = [];
    const fields = [
        "vi_problem",
        "question_text",
        "question",
        "instruction",
        "problem",
        "prompt",
        "background",
        "input",
        "vi_choices",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "distractor1",
        "distractor2",
        "distractor3",
        "correct_answer",
        "support",
        "explanation",
        "solution"
    ];
    for (const key of fields) {
        if (typeof rowObj[key] === "string" && rowObj[key].trim()) {
            parts.push(rowObj[key]);
        }
    }
    for (const arrKey of ["choices", "options"]) {
        if (Array.isArray(rowObj[arrKey])) {
            for (const item of rowObj[arrKey]) {
                if (typeof item === "string" && item.trim()) parts.push(item);
            }
        }
    }
    if (Array.isArray(rowObj.messages)) {
        for (const msg of rowObj.messages) {
            if (msg && typeof msg.content === "string") parts.push(msg.content);
        }
    }
    return parts.join("\n");
}

/**
 * Layer 1 Backend Filter for /api/harvest:
 * Automatically drops HuggingFace rows and StackExchange items that depend on missing images/figures
 * BEFORE returning seeds to the frontend.
 */
export function filterHarvestPayloadMissingFigures(rawText, contentType = "") {
    if (!rawText || !/json/i.test(String(contentType))) {
        return { body: rawText, filteredMissingFigures: 0 };
    }
    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        return { body: rawText, filteredMissingFigures: 0 };
    }
    if (!data || typeof data !== "object") {
        return { body: rawText, filteredMissingFigures: 0 };
    }

    // HuggingFace Datasets Server (/rows or /filter)
    if (Array.isArray(data.rows)) {
        let removed = 0;
        const cleanRows = data.rows.filter((entry) => {
            const text = collectRowStringsForHarvestFilter(entry?.row);
            if (detectServerMissingFigureText(text).hasMissingFigure) {
                removed++;
                return false;
            }
            return true;
        });
        return {
            body: JSON.stringify({ ...data, rows: cleanRows, filteredMissingFigures: removed }),
            filteredMissingFigures: removed
        };
    }

    // Stack Exchange API (/2.3/questions)
    if (Array.isArray(data.items)) {
        let removed = 0;
        const cleanItems = data.items.filter((item) => {
            const text = `${item?.title || ""}\n${item?.body || ""}`;
            if (detectServerMissingFigureText(text).hasMissingFigure) {
                removed++;
                return false;
            }
            return true;
        });
        return {
            body: JSON.stringify({ ...data, items: cleanItems, filteredMissingFigures: removed }),
            filteredMissingFigures: removed
        };
    }

    return { body: rawText, filteredMissingFigures: 0 };
}

export async function handleHarvestProxyRequest(rawUrl) {
    const check = validateHarvestUrl(rawUrl);
    if (!check.ok) {
        return { status: 403, contentType: "application/json; charset=utf-8", body: JSON.stringify({ ok: false, error: check.error }) };
    }

    try {
        const res = await fetchWithTimeout(
            check.url,
            {
                method: "GET",
                headers: {
                    Accept: "application/json, text/plain, */*",
                    "User-Agent": "THPTQG-2026-VatLy-Studio/2.0"
                },
                redirect: "follow"
            },
            14000
        );

        const contentLength = Number(res.headers.get("content-length") || 0);
        if (contentLength > MAX_HARVEST_BYTES) {
            return {
                status: 413,
                contentType: "application/json; charset=utf-8",
                body: JSON.stringify({ ok: false, error: "Tệp nguồn vượt quá giới hạn 15MB." })
            };
        }

        const text = await res.text();
        if (Buffer.byteLength(text, "utf8") > MAX_HARVEST_BYTES) {
            return {
                status: 413,
                contentType: "application/json; charset=utf-8",
                body: JSON.stringify({ ok: false, error: "Nội dung vượt quá giới hạn 15MB." })
            };
        }

        const contentType = res.headers.get("content-type") || "application/json; charset=utf-8";
        if (res.ok) {
            const filtered = filterHarvestPayloadMissingFigures(text, contentType);
            return {
                status: res.status,
                contentType,
                body: filtered.body,
                filteredMissingFigures: filtered.filteredMissingFigures
            };
        }

        return {
            status: res.status,
            contentType,
            body: text,
            filteredMissingFigures: 0
        };
    } catch (err) {
        return {
            status: 502,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ ok: false, error: `Không thể kéo nguồn: ${err.message}` })
        };
    }
}
