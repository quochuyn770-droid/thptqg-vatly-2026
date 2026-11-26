/**
 * 128-bit CSPRNG, SHA-256 hashing, 3-Gram Jaccard similarity,
 * GDPT 2018 Banned 2006 Physics Curriculum Filter (0% RLC/Fresnel/LC/Bohr),
 * Anti-Missing-Figure Detector, XSS-Safe Inline SVG Sanitizer,
 * and Part III Short-Answer Sanitizer (<= 4 chars with Vietnamese comma).
 */

export function csprngHex(bytesLen = 16) {
    const buf = new Uint8Array(bytesLen);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(buf);
    } else {
        for (let i = 0; i < bytesLen; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function csprngInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    const range = hi - lo + 1;
    const arr = new Uint32Array(4);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(arr);
    } else {
        arr[0] = Math.floor(Math.random() * 0xffffffff);
        arr[1] = Math.floor(Math.random() * 0xffffffff);
    }
    const mixed = ((arr[0] ^ arr[2]) >>> 0) + ((arr[1] ^ arr[3]) >>> 0) * 0x100000000;
    return lo + (mixed % range);
}

export function csprngSample(list, count) {
    const copy = Array.from(list);
    for (let i = copy.length - 1; i > 0; i--) {
        const j = csprngInt(0, i);
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy.slice(0, Math.min(count, copy.length));
}

export function normalizeTextForHash(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFC")
        .replace(/\\(dfrac|tfrac|frac)/g, "frac")
        .replace(/[\$\{\}\[\]\(\)\\,;:.!?"'`~^*_+=<>|-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export async function sha256Hex(rawText) {
    const norm = normalizeTextForHash(rawText);
    try {
        if (globalThis.crypto && globalThis.crypto.subtle) {
            const data = new TextEncoder().encode(norm);
            const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
            return Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
        }
    } catch {
        // Fallback deterministic 256-bit hash for non-HTTPS local contexts
    }
    let out = "";
    const seeds = [
        0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35,
        0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5
    ];
    for (const s of seeds) {
        let h = s >>> 0;
        for (let i = 0; i < norm.length; i++) {
            h ^= norm.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        out += h.toString(16).padStart(8, "0");
    }
    return out;
}

export function extractShinglesFromNormalized(normText, k = 3) {
    const tokens = String(normText || "").split(" ").filter(Boolean);
    const set = new Set();
    if (tokens.length < k) {
        if (normText) set.add(normText);
        return set;
    }
    for (let i = 0; i <= tokens.length - k; i++) {
        set.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
    return set;
}

export function extractShingles(rawText, k = 3) {
    return extractShinglesFromNormalized(normalizeTextForHash(rawText), k);
}

export function jaccardSimilarity(setA, setB) {
    if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    for (const item of smaller) {
        if (larger.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/**
 * GDPT 2018 Physics Curriculum Blocker (0% Banned 2006 Curriculum Topics).
 * Blocks:
 *  - Complex series RLC AC circuits (Z_L, Z_C, impedance Z, RLC extrema, electrical resonance, black-box RLC)
 *  - Fresnel vector diagrams (giản đồ Fresnel / Fre-nen)
 *  - Ideal LC oscillating circuits (mạch dao động LC, T = 2\pi\sqrt{LC})
 *  - Bohr atomic model (mẫu nguyên tử Bo/Bohr, bán kính Bo, quỹ đạo dừng, tiên đề Bo, Lyman/Balmer/Paschen)
 *  - 3-phase AC motors / star-delta 2006 topics & relativistic mass
 * Carefully preserves GDPT 2018 topics: sóng điện từ, tụ điện, cảm ứng điện từ, dao động điều hòa, cộng hưởng cơ.
 */
const BANNED_2006_PHYSICS_PATTERNS = [
    // 1. Complex RLC AC circuits
    { label: "Mạch xoay chiều RLC (chương trình 2006)", re: /\b(?:mạch|đoạn\s+mạch)\s+(?:điện\s+)?(?:xoay\s+chiều\s+)?r\s*[-–,]?\s*l\s*[-–,]?\s*c\b/i },
    { label: "Mạch RLC nối tiếp (chương trình 2006)", re: /\brlc\b/i },
    { label: "Cảm kháng / Dung kháng / Tổng trở (chương trình 2006)", re: /(?:cảm\s+kháng|dung\s+kháng|tổng\s+trở|cực\s+trị\s+rlc|hộp\s+đen\s+x)/i },
    { label: "Ký hiệu Z_L / Z_C (chương trình 2006)", re: /\bz_\{?[lc]\}?\b/i },
    { label: "Cộng hưởng điện mạch RLC (chương trình 2006)", re: /(?:cộng\s+hưởng\s+điện|electrical\s+resonance|inductive\s+reactance|capacitive\s+reactance|rlc\s+circuit|rlc\s+series)/i },
    // 2. Fresnel diagram
    { label: "Giản đồ Fresnel (chương trình 2006)", re: /(?:fresnel|fre[\s-]?nen|giản\s+đồ\s+vec[\s-]?tơ\s+quay)/i },
    // 3. LC oscillating circuit
    { label: "Mạch dao động LC (chương trình 2006)", re: /(?:mạch\s+dao\s+động\s+(?:điện\s+từ\s+)?lc|dao\s+động\s+điện\s+từ\s+tự\s+do|lc\s+(?:oscillator|circuit)|2\\?pi\s*\\?sqrt\s*\{?\s*lc\s*\}?)/i },
    // 4. Bohr atomic model
    { label: "Mẫu nguyên tử Bo / Bohr (chương trình 2006)", re: /(?:mẫu\s+nguyên\s+tử\s+bo\b|mẫu\s+bohr|bohr\s+model|bán\s+kính\s+bo\b|bohr\s+radius|quỹ\s+đạo\s+dừng|tiên\s+đề\s+bo\b|dãy\s+(?:lai[\s-]?man|ban[\s-]?me|pa[\s-]?sen|lyman|balmer|paschen)|lyman\s+series|balmer\s+series|paschen\s+series)/i },
    // 5. Legacy 2006 3-phase / relativistic mass
    { label: "Dòng 3 pha / Động cơ không đồng bộ 3 pha (2006)", re: /(?:động\s+cơ\s+không\s+đồng\s+bộ\s+ba\s+pha|dòng\s+điện\s+xoay\s+chiều\s+ba\s+pha|mắc\s+hình\s+sao.*tam\s+giác|khối\s+lượng\s+tương\s+đối\s+tính)/i }
];

export function detectBanned2006Physics(text) {
    if (!text) return { banned: false, reason: "" };
    const normalized = String(text).normalize("NFC");
    for (const rule of BANNED_2006_PHYSICS_PATTERNS) {
        if (rule.re.test(normalized)) {
            return { banned: true, reason: rule.label };
        }
    }
    return { banned: false, reason: "" };
}

export function containsBanned2006Physics(text) {
    return detectBanned2006Physics(text).banned;
}

/**
 * XSS-safe inline SVG sanitizer for physics diagrams and graphs generated by AI.
 * Strips scripts, foreignObject, external references, and event handlers.
 */
export function sanitizeInlineSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== "string") return "";
    const trimmed = rawSvg.trim();
    if (!trimmed) return "";

    const startIdx = trimmed.toLowerCase().indexOf("<svg");
    const endIdx = trimmed.toLowerCase().lastIndexOf("</svg>");
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return "";

    let svg = trimmed.slice(startIdx, endIdx + 6);

    // Reject / strip dangerous elements completely
    svg = svg
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
        .replace(/<object[\s\S]*?<\/object>/gi, "")
        .replace(/<embed[\s\S]*?\/?>/gi, "")
        .replace(/<image[\s\S]*?\/?>/gi, "")
        .replace(/<use[\s\S]*?\/?>/gi, "")
        .replace(/<a[\s\S]*?<\/a>/gi, "");

    // Strip inline event handlers (onload, onclick, onerror, ...) and javascript:/data: URLs
    svg = svg
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
        .replace(/javascript\s*:/gi, "")
        .replace(/data\s*:/gi, "");

    // Must contain at least one visible drawing primitive
    if (!/<(path|line|polyline|polygon|rect|circle|ellipse|text)\b/i.test(svg)) {
        return "";
    }

    // Ensure responsive attributes & clean viewBox
    if (!/\bviewBox\s*=/i.test(svg)) {
        svg = svg.replace(/<svg\b/i, '<svg viewBox="0 0 420 230"');
    }
    if (!/\brole\s*=/i.test(svg)) {
        svg = svg.replace(/<svg\b/i, '<svg role="img"');
    }
    return svg;
}

/**
 * Detects whether a question text explicitly includes structured numerical table data.
 */
export function hasExplicitDataTable(text) {
    const s = String(text || "");
    if (/\\begin\{tabular\}|\\begin\{array\}/i.test(s)) return true;
    // Markdown pipe table (at least 2 rows with pipes)
    const pipeLines = s.split("\n").filter((l) => (l.match(/\|/g) || []).length >= 2);
    if (pipeLines.length >= 2) return true;
    return false;
}

/**
 * Raw image/diagram markup patterns — ALWAYS rejected even if an SVG or table exists.
 */
const RAW_IMAGE_MARKUP_PATTERNS = [
    { label: "\\includegraphics", re: /\\includegraphics/i },
    { label: "[asy]", re: /\[asy\]/i },
    { label: "![", re: /!\[/ },
    { label: "<img", re: /<img\b/i }
];

/**
 * Missing figure / diagram / graph / circuit reference patterns (Vietnamese & English).
 * Rejected unless a genuine sanitized inline SVG figure is actually present (NEVER bypassed by a text table!).
 */
const MISSING_FIGURE_PATTERNS = [
    // Vietnamese figure, graph, circuit, diagram references
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
    { label: "hình số", re: /(?:như|theo|ở|từ|trên|trong|xem|cho|tại|nhìn)\s+hình\s+(?:[1-9]\d*|[a-d]\b)/i },
    // English figure / diagram / graph references
    { label: "as shown in the figure", re: /(?:as\s+)?shown\s+in\s+(?:the\s+)?fig(?:ure|\.)/i },
    { label: "in the diagram", re: /(?:in|from|on|see|shown\s+in)\s+the\s+diagram/i },
    { label: "the graph below", re: /(?:the\s+)?graph\s+(?:below|above|shown|shows)|following\s+graph/i },
    { label: "the figure shows", re: /(?:the\s+)?fig(?:ure|\.)\s+(?:shows|below|above|illustrates|depicts)|(?:see|refer\s+to|in|from)\s+(?:the\s+)?fig(?:ure|\.)|following\s+(?:figure|diagram)/i },
    { label: "diagram below", re: /diagram\s+(?:below|above|shows|shown)|(?:picture|circuit)\s+(?:below|shown)/i }
];

/**
 * Missing variation-table references ("bảng biến thiên sau/dưới đây/bên") — rejected if no explicit table or SVG exists.
 */
const MISSING_VARIATION_TABLE_PATTERNS = [
    { label: "bảng biến thiên", re: /bảng\s+biến\s+thiên\s+(?:sau|dưới(?:\s+đây)?|bên|như\s+hình|trên)|cho\s+bảng\s+biến\s+thiên/i }
];

/**
 * Anti-"Missing Figure" Guard (used in Layer 1 Harvester & Layer 3 Post-Generation Validator):
 * - Always rejects raw image markup (\includegraphics, [asy], ![, <img).
 * - Rejects Vietnamese & English figure/graph/circuit references whenever no valid sanitized inline SVG exists.
 * - Rejects missing variation-table references whenever neither a valid SVG nor an explicit data table exists.
 */
export function detectMissingFigureReference(text, svgFigure = "", { strictSeed = false, hasParentTable = false } = {}) {
    if (!text) return { ok: true, reason: "", matchedPhrase: "" };
    const normalized = String(text).normalize("NFC");

    for (const rule of RAW_IMAGE_MARKUP_PATTERNS) {
        const m = normalized.match(rule.re);
        if (m) {
            const phrase = m[0] || rule.label;
            return {
                ok: false,
                matchedPhrase: phrase,
                reason: `Phát hiện mã nhúng hình ảnh bị khuyết ("${phrase}")`
            };
        }
    }

    const cleanSvg = strictSeed ? "" : sanitizeInlineSvg(svgFigure);
    if (!cleanSvg) {
        for (const rule of MISSING_FIGURE_PATTERNS) {
            const m = normalized.match(rule.re);
            if (m) {
                const phrase = m[0] || rule.label;
                return {
                    ok: false,
                    matchedPhrase: phrase,
                    reason: `Nhắc tới hình/đồ thị bị khuyết ("${phrase}") nhưng không có hình hiển thị`
                };
            }
        }
    }

    if (strictSeed || (!cleanSvg && !hasParentTable && !hasExplicitDataTable(normalized))) {
        for (const rule of MISSING_VARIATION_TABLE_PATTERNS) {
            const m = normalized.match(rule.re);
            if (m) {
                const phrase = m[0] || rule.label;
                return {
                    ok: false,
                    matchedPhrase: phrase,
                    reason: `Nhắc tới bảng biến thiên bị khuyết ("${phrase}")`
                };
            }
        }
    }

    return { ok: true, reason: "", matchedPhrase: "" };
}

export function containsMissingFigureReference(text, svgFigure = "", options = {}) {
    return !detectMissingFigureReference(text, svgFigure, options).ok;
}

/**
 * Layer 3 Post-Generation Validator:
 * Scans stemLatex, all options (A-D), and all True/False statements of an AI-generated question.
 */
export function validateQuestionMissingFigures(question, partKey = "part1") {
    if (!question || typeof question !== "object") {
        return { ok: true, reason: "", matchedPhrase: "", field: "" };
    }
    const svg = question.svgFigure || "";
    const stemHasTable = hasExplicitDataTable(question.stemLatex || "");
    const fieldsToCheck = [{ name: "đề dẫn", text: question.stemLatex || "" }];

    if (partKey === "part1") {
        for (const optKey of ["optionA", "optionB", "optionC", "optionD"]) {
            if (question[optKey]) {
                fieldsToCheck.push({ name: `phương án ${optKey.slice(-1)}`, text: question[optKey] });
            }
        }
    } else if (partKey === "part2" && Array.isArray(question.statements)) {
        for (const st of question.statements) {
            if (st && st.statementLatex) {
                fieldsToCheck.push({ name: `mệnh đề ${st.label || ""})`, text: st.statementLatex });
            }
        }
    }

    for (const item of fieldsToCheck) {
        const res = detectMissingFigureReference(item.text, svg, { hasParentTable: stemHasTable });
        if (!res.ok) {
            return {
                ok: false,
                matchedPhrase: res.matchedPhrase,
                field: item.name,
                reason: `Lỗi thiếu hình tại ${item.name}: ${res.reason}`
            };
        }
    }

    return { ok: true, reason: "", matchedPhrase: "", field: "" };
}

export function isVietnameseSourceId(sourceId = "") {
    const s = String(sourceId).toLowerCase();
    return (
        s.startsWith("tridm/vmlu") ||
        s.startsWith("chiayewken/m3exam") ||
        s.startsWith("alexandrainst/m_mmlu") ||
        s.startsWith("intelligent-internet/vietnamese-entrance-exam") ||
        s.startsWith("vn:") ||
        s.includes("vmlu") ||
        s.includes("m3exam") ||
        s.includes("m_mmlu") ||
        s.includes("vietnamese-entrance-exam")
    );
}

export function sanitizeVaultKey(raw, fallback = "THPTQG-VATLY-2026-MAIN") {
    const cleaned = String(raw || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return cleaned || fallback;
}

/**
 * Enforces GDPT 2018 Part III answer sheet format: <= 4 characters including '-' and ','
 */
export function sanitizeShortAnswer(raw) {
    const s = String(raw || "").trim().replace(/\s+/g, "").replace(/\./g, ",");
    if (s.length <= 4 && /^-?\d+(,\d+)?$/.test(s)) return s;
    const numMatch = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
    if (!numMatch) return "0";
    const num = parseFloat(numMatch[0]);
    if (!Number.isFinite(num)) return "0";
    const candidate = String(num).replace(".", ",");
    if (candidate.length <= 4) return candidate;
    for (const dec of [2, 1, 0]) {
        const rounded = num.toFixed(dec).replace(/\.?0+$/, "").replace(".", ",");
        if (rounded.length <= 4) return rounded;
    }
    return String(Math.round(num)).slice(0, 4);
}

/**
 * Evaluates a candidate Physics question against:
 * 1) GDPT 2018 Banned 2006 Curriculum Filter
 * 2) Anti-Missing-Figure Guard (stem, options, statements)
 * 3) SHA-256 exact fingerprint check (vault + current exam batch)
 * 4) 3-Gram Jaccard (> 65%) near-duplicate check (vault + current exam batch)
 */
export async function evaluateQuestionIntegrity(questionText, vault, batchHashes, batchShingles, options = {}) {
    const bannedCheck = detectBanned2006Physics(questionText);
    if (bannedCheck.banned) {
        vault.sessionCurriculumRejected = (vault.sessionCurriculumRejected || 0) + 1;
        return { ok: false, violationType: "curriculum_2006", reason: `Vi phạm GDPT 2018 (${bannedCheck.reason})` };
    }

    const figCheck = options.question
        ? validateQuestionMissingFigures(options.question, options.partKey || "part1")
        : detectMissingFigureReference(questionText, options.svgFigure || "");
    if (!figCheck.ok) {
        vault.sessionMissingFigureRejected = (vault.sessionMissingFigureRejected || 0) + 1;
        return {
            ok: false,
            violationType: "missing_figure",
            matchedPhrase: figCheck.matchedPhrase || "",
            reason: figCheck.reason
        };
    }

    const normText = normalizeTextForHash(questionText);
    const hash = await sha256Hex(questionText);
    if (vault.hashes.has(hash) || batchHashes.has(hash)) {
        vault.sessionDuplicatesBlocked++;
        return { ok: false, violationType: "duplicate", reason: `Trùng khớp SHA-256 tuyệt đối (${hash.slice(0, 10)})` };
    }

    const shingles = extractShinglesFromNormalized(normText, 3);
    for (const entry of vault.shingleEntries) {
        const sim = jaccardSimilarity(shingles, entry.shingles);
        if (sim > 0.65) {
            vault.sessionDuplicatesBlocked++;
            return { ok: false, violationType: "duplicate", reason: `Tương đồng 3-Gram Jaccard ${(sim * 100).toFixed(1)}% > 65%` };
        }
    }
    for (const other of batchShingles) {
        const sim = jaccardSimilarity(shingles, other);
        if (sim > 0.65) {
            vault.sessionDuplicatesBlocked++;
            return { ok: false, violationType: "duplicate", reason: `Trùng nội bộ trong cùng đề (${(sim * 100).toFixed(1)}%)` };
        }
    }

    return { ok: true, hash, normText: normText.slice(0, 420), shingles };
}
