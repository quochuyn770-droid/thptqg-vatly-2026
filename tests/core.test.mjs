import test from "node:test";
import assert from "node:assert/strict";

import {
    getServerHealth,
    resolveGeminiThinkingLevel,
    buildGeminiPayload,
    extractGeminiResponse,
    stripInlineThinkTags,
    validateCustomBaseUrl,
    validateHarvestUrl
} from "../lib/proxy-core.mjs";
import { createAppServer } from "../server.mjs";
import {
    normalizeTextForHash,
    sha256Hex,
    extractShingles,
    jaccardSimilarity,
    containsBanned2006Physics,
    detectBanned2006Physics,
    sanitizeInlineSvg,
    detectMissingFigureReference,
    isVietnameseSourceId,
    sanitizeVaultKey,
    sanitizeShortAnswer,
    evaluateQuestionIntegrity
} from "../public/js/crypto-dedup.js";
import {
    repairLatexControlChars,
    parseRobustLatexJson,
    getFallbackCandidateModels,
    loadAiSettings,
    UnifiedAiClient,
    AI_SETTINGS_VERSION
} from "../public/js/ai-client.js";
import { PHYSICS_CONSTANTS, STORAGE_KEYS } from "../public/js/config.js";
import { PhysicsSourceHarvester, extractProblemFromHfRow } from "../public/js/harvester.js";
import { runFullExamPipeline } from "../public/js/exam-pipeline.js";
import { parseFirebaseConfigInput } from "../public/js/storage.js";
import {
    buildConstantsLatex,
    buildPart1LatexSlice,
    buildPart2Latex,
    buildPart3Latex,
    buildAnswersLatex,
    buildFullTexDocument
} from "../public/js/latex-export.js";

test("GDPT 2018 Physics filter blocks banned 2006 topics without false positives on 2018 topics", () => {
    // Must BLOCK (2006 removed curriculum)
    assert.equal(containsBanned2006Physics("Đặt điện áp xoay chiều vào đoạn mạch RLC nối tiếp có cảm kháng Z_L = 50 Ohm."), true);
    assert.equal(containsBanned2006Physics("Sử dụng giản đồ Fre-nen để tổng hợp hai dao động."), true);
    assert.equal(containsBanned2006Physics("Một mạch dao động LC lí tưởng có chu kì T = 2\\pi\\sqrt{LC}."), true);
    assert.equal(containsBanned2006Physics("Theo mẫu nguyên tử Bo, bán kính quỹ đạo dừng N của electron trong nguyên tử hiđrô là?"), true);
    assert.equal(containsBanned2006Physics("Tìm tổng trở Z và cực trị RLC khi dung kháng thay đổi."), true);
    assert.equal(containsBanned2006Physics("An RLC series circuit with inductive reactance X_L operates at electrical resonance."), true);
    assert.equal(containsBanned2006Physics("Động cơ không đồng bộ ba pha mắc hình sao."), true);
    assert.ok(detectBanned2006Physics("Theo tiên đề Bo về sự bức xạ của nguyên tử").reason.length > 0);

    // Must ALLOW (valid GDPT 2018 curriculum)
    assert.equal(containsBanned2006Physics("Tính nội năng thay đổi theo định luật I nhiệt động lực học \\Delta U = A + Q."), false);
    assert.equal(containsBanned2006Physics("Một lượng khí lí tưởng biến đổi đẳng nhiệt ở nhiệt độ 27°C với R = 8,31 J/(mol.K)."), false);
    assert.equal(containsBanned2006Physics("Đoạn dây dẫn dài 20 cm đặt trong từ trường đều B = 0,2 T chịu lực từ F = BIL sin α."), false);
    assert.equal(containsBanned2006Physics("Khung dây quay đều trong từ trường tạo suất điện động xoay chiều có giá trị hiệu dụng 220 V."), false);
    assert.equal(containsBanned2006Physics("Sóng điện từ truyền trong chân không với tốc độ c = 3.10^8 m/s."), false);
    assert.equal(containsBanned2006Physics("Tụ điện có điện dung C = 10 µF được tích điện ở hiệu điện thế 12 V."), false);
    assert.equal(containsBanned2006Physics("Hạt nhân phóng xạ Po-210 có chu kì bán rã 138 ngày, tính độ phóng xạ ban đầu."), false);
    assert.equal(containsBanned2006Physics("Hiện tượng cộng hưởng cơ xảy ra khi tần số ngoại lực cưỡng bức bằng tần số riêng."), false);
});

test("Anti-missing-figure guard & XSS-safe SVG sanitizer work accurately", () => {
    // Missing figure phrase with NO SVG and NO table -> REJECT
    const missing = detectMissingFigureReference("Quan sát đồ thị hình bên, tính công khí thực hiện trong chu trình.", "");
    assert.equal(missing.ok, false);

    const missing2 = detectMissingFigureReference("Một thanh dẫn đặt trong từ trường như hình vẽ bên.", "");
    assert.equal(missing2.ok, false);

    // Same phrase WITH valid inline SVG -> ACCEPT
    const validSvg = `<svg viewBox="0 0 420 230" xmlns="http://www.w3.org/2000/svg"><line x1="40" y1="200" x2="380" y2="200" stroke="currentColor"/><path d="M60 180 L200 60" stroke="#0284c7" fill="none"/><text x="385" y="204">V</text></svg>`;
    assert.equal(detectMissingFigureReference("Quan sát đồ thị hình bên, tính công khí thực hiện.", validSvg).ok, true);

    // With explicit Markdown/LaTeX table -> ACCEPT
    const withTable = "Quan sát bảng số liệu sau:\n| t (phút) | 0 | 2 | 4 |\n| T (°C) | 20 | 50 | 80 |";
    assert.equal(detectMissingFigureReference(withTable, "").ok, true);

    // Self-contained question without figure mention -> ACCEPT
    assert.equal(detectMissingFigureReference("Một bình kín chứa 2 mol khí lí tưởng ở 300 K và thể tích 8,31 lít. Tính áp suất khí.", "").ok, true);

    // XSS Sanitizer strips scripts, foreignObject, and event handlers
    const maliciousSvg = `<svg viewBox="0 0 200 100" onload="alert(1)"><script>alert('xss')</script><foreignObject><div>bad</div></foreignObject><line x1="0" y1="0" x2="100" y2="100" onclick="evil()" stroke="blue"/></svg>`;
    const sanitized = sanitizeInlineSvg(maliciousSvg);
    assert.ok(sanitized.startsWith("<svg"));
    assert.equal(/<script/i.test(sanitized), false);
    assert.equal(/foreignObject/i.test(sanitized), false);
    assert.equal(/onload|onclick/i.test(sanitized), false);
    assert.ok(sanitized.includes("<line"));
});

test("Short answer sanitizer enforces <= 4 characters using Vietnamese decimal comma", () => {
    assert.equal(sanitizeShortAnswer("12.5"), "12,5");
    assert.equal(sanitizeShortAnswer("-3,2"), "-3,2");
    assert.equal(sanitizeShortAnswer("2026"), "2026");
    assert.equal(sanitizeShortAnswer("3.14159"), "3,14");
    assert.equal(sanitizeShortAnswer("123.456"), "123");
    assert.ok(sanitizeShortAnswer("-12.789").length <= 4);
});

test("SHA-256, 3-gram Jaccard, 2006 blocker and missing-figure checks integrate in evaluateQuestionIntegrity", async () => {
    const q1 = "Một bình kín chứa 2 mol khí lí tưởng ở nhiệt độ $27^\\circ\\text{C}$ và áp suất $10^5\\,\\text{Pa}$. Tính thể tích của khối khí theo đơn vị lít.";
    const q2Same = "Một bình kín chứa 2 mol khí lí tưởng ở nhiệt độ $27^\\circ\\text{C}$ và áp suất $10^5\\,\\text{Pa}$. Tính thể tích của khối khí theo đơn vị lít.";
    const q3Fresh = "Hạt nhân ${}^{4}_{2}\\text{He}$ có độ hụt khối $\\Delta m = 0,0304\\,\\text{amu}$. Tính năng lượng liên kết của hạt nhân heli theo đơn vị MeV.";

    const h1 = await sha256Hex(q1);
    assert.equal(h1, await sha256Hex(q2Same));
    assert.equal(h1.length, 64);

    const s1 = extractShingles(q1);
    const s3 = extractShingles(q3Fresh);
    assert.equal(jaccardSimilarity(s1, s1), 1);
    assert.ok(jaccardSimilarity(s1, s3) < 0.2);

    const vault = {
        hashes: new Set([h1]),
        shingleEntries: [{ hash: h1, shingles: s1, preview: normalizeTextForHash(q1) }],
        sessionDuplicatesBlocked: 0,
        sessionCurriculumRejected: 0,
        sessionMissingFigureRejected: 0
    };

    const dupCheck = await evaluateQuestionIntegrity(q2Same, vault, new Set(), []);
    assert.equal(dupCheck.ok, false);
    assert.equal(vault.sessionDuplicatesBlocked, 1);

    const bannedCheck = await evaluateQuestionIntegrity("Tính tổng trở đoạn mạch RLC nối tiếp có cảm kháng 40 Ohm.", vault, new Set(), []);
    assert.equal(bannedCheck.ok, false);
    assert.equal(vault.sessionCurriculumRejected, 1);

    const figCheck = await evaluateQuestionIntegrity("Quan sát đồ thị hình bên và tính nhiệt lượng đã truyền.", vault, new Set(), [], { svgFigure: "" });
    assert.equal(figCheck.ok, false);
    assert.equal(vault.sessionMissingFigureRejected, 1);

    const freshCheck = await evaluateQuestionIntegrity(q3Fresh, vault, new Set(), []);
    assert.equal(freshCheck.ok, true);
});

test("LaTeX JSON parser repairs control chars, unescaped backslashes, markdown fences & <think> tags", () => {
    const raw = `<think>Kiểm tra đổi đơn vị SI...</think>\n\`\`\`json\n{\n  "stemLatex": "Tính \\dfrac{3}{2}kT + \\Delta U",\n  "shortAnswer": "24,5",\n}\n\`\`\``;
    const parsed = parseRobustLatexJson(raw);
    assert.equal(parsed.stemLatex, "Tính \\dfrac{3}{2}kT + \\Delta U");
    assert.equal(parsed.shortAnswer, "24,5");

    assert.equal(repairLatexControlChars("\frac{1}{2} \times \right) \text{K}"), "\\frac{1}{2} \\times \\right) \\text{K}");
});

test("Gemini 4 / 3.x payload complies with API rules and skips thought parts", () => {
    assert.equal(resolveGeminiThinkingLevel("gemini-4-hydrogen", "MINIMAL"), "LOW");
    assert.equal(resolveGeminiThinkingLevel("gemini-4-hydrogen", "XHIGH"), "XHIGH");
    assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash", "XHIGH"), "HIGH");
    assert.equal(resolveGeminiThinkingLevel("gemini-3.5-flash-lite", "MINIMAL"), "MINIMAL");
    assert.equal(resolveGeminiThinkingLevel("gemini-2.5-flash", "HIGH"), null);

    const payload = buildGeminiPayload({
        model: "gemini-3.5-flash-lite",
        systemInstruction: "Expert Physics",
        prompt: "Create 1 question",
        responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } } },
        useGoogleSearch: false,
        thinkingLevel: "LOW"
    });

    assert.equal("temperature" in payload.generationConfig, false);
    assert.equal("topP" in payload.generationConfig, false);
    assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel, "LOW");
    assert.equal(payload.generationConfig.responseMimeType, "application/json");

    const extracted = extractGeminiResponse({
        candidates: [
            {
                content: {
                    parts: [
                        { thought: true, text: "Internal reasoning" },
                        { text: '{"ok": true}' }
                    ]
                },
                groundingMetadata: {
                    groundingChunks: [{ web: { uri: "https://example.edu/physics", title: "Vật Lý 2026" } }]
                }
            }
        ]
    });
    assert.equal(extracted.text, '{"ok": true}');
    assert.equal(extracted.groundingLinks.length, 1);
    assert.equal(stripInlineThinkTags("<think>abc</think>hello"), "hello");
});

test("Harvest URL validator allows HuggingFace /filter & Physics SE while blocking SSRF", () => {
    assert.equal(
        validateHarvestUrl(`https://datasets-server.huggingface.co/filter?dataset=tridm/VMLU&config=default&split=test&where=%22id%22%20LIKE%20%2710-%25%27`).ok,
        true
    );
    assert.equal(
        validateHarvestUrl("https://datasets-server.huggingface.co/rows?dataset=cais/mmlu&config=high_school_physics&split=test").ok,
        true
    );
    assert.equal(
        validateHarvestUrl("https://api.stackexchange.com/2.3/questions?site=physics&tagged=thermodynamics").ok,
        true
    );
    // Blocked SSRF targets
    assert.equal(validateHarvestUrl("http://169.254.169.254/latest/meta-data/").ok, false);
    assert.equal(validateHarvestUrl("https://127.0.0.1:3000/api/health").ok, false);
    assert.equal(validateHarvestUrl("https://evil.example.com/steal").ok, false);
    assert.equal(validateHarvestUrl("https://huggingface.co/models/secret").ok, false);

    assert.equal(validateCustomBaseUrl("https://api.cerebras.ai/v1").ok, true);
    assert.equal(validateCustomBaseUrl("http://169.254.169.254/v1").ok, false);
    assert.equal(validateCustomBaseUrl("https://10.0.0.1/v1").ok, false);
});

test("Firebase config parser accepts both strict JSON and raw Firebase Console JS object", () => {
    const jsSnippet = `const firebaseConfig = {\n  apiKey: "AIzaTest123",\n  authDomain: "demo.firebaseapp.com",\n  projectId: "demo-vatly-2026",\n  appId: "1:999:web:abc"\n};`;
    const parsed = parseFirebaseConfigInput(jsSnippet);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.config.projectId, "demo-vatly-2026");

    assert.equal(parseFirebaseConfigInput(`{"foo": "bar"}`).ok, false);
});

test("LaTeX serializers include all 7 standard constants, 1-9 / 10-18 / 1-18 slices, and complete .tex document", () => {
    const constantsTex = buildConstantsLatex();
    assert.equal(PHYSICS_CONSTANTS.length, 7);
    assert.ok(constantsTex.includes("8,31"));
    assert.ok(constantsTex.includes("6,02"));
    assert.ok(constantsTex.includes("1,38"));
    assert.ok(constantsTex.includes("1,6"));
    assert.ok(constantsTex.includes("3 \\cdot 10^8"));
    assert.ok(constantsTex.includes("931,5"));
    assert.ok(constantsTex.includes("273"));

    const sampleExam = {
        examCode: "308",
        part1: Array.from({ length: 18 }, (_, i) => ({
            number: i + 1,
            stemLatex: `Câu vật lí số ${i + 1}: Tính nhiệt lượng $Q = mc\\Delta T$ với $m = ${i + 1}\\,\\text{kg}$.`,
            optionA: "$100\\,\\text{J}$",
            optionB: "$200\\,\\text{J}$",
            optionC: "$300\\,\\text{J}$",
            optionD: "$400\\,\\text{J}$",
            correctOption: "A",
            solutionLatex: "Đổi đơn vị SI, áp dụng $Q = mc\\Delta T$."
        })),
        part2: Array.from({ length: 4 }, (_, i) => ({
            number: i + 1,
            stemLatex: `Thí nghiệm vật lí phần hai số ${i + 1}.`,
            statements: [
                { label: "a", statementLatex: "Nhiệt độ tăng tỉ lệ thuận", isTrue: true },
                { label: "b", statementLatex: "Nội năng giảm", isTrue: false },
                { label: "c", statementLatex: "Áp suất không đổi", isTrue: true },
                { label: "d", statementLatex: "Động năng phân tử tăng", isTrue: true }
            ],
            solutionLatex: "a) Đ, b) S, c) Đ, d) Đ."
        })),
        part3: Array.from({ length: 6 }, (_, i) => ({
            number: i + 1,
            stemLatex: `Tính áp suất khí lí tưởng câu ${i + 1} (làm tròn đến hàng phần mười).`,
            shortAnswer: `${i + 1},5`,
            solutionLatex: "Áp dụng $pV = nRT$."
        }))
    };

    const p1First = buildPart1LatexSlice(sampleExam, 0, 9, "Câu 1–9");
    assert.ok(p1First.includes("Câu 1."));
    assert.ok(p1First.includes("Câu 9."));
    assert.equal(p1First.includes("Câu 10."), false);

    const p1Second = buildPart1LatexSlice(sampleExam, 9, 18, "Câu 10–18");
    assert.ok(p1Second.includes("Câu 10."));
    assert.ok(p1Second.includes("Câu 18."));
    assert.equal(p1Second.includes("Câu 9."), false);

    const fullTex = buildFullTexDocument(sampleExam);
    assert.ok(fullTex.includes("\\documentclass[12pt,a4paper]{article}"));
    assert.ok(fullTex.includes("MÔN VẬT LÍ"));
    assert.ok(fullTex.includes("50 phút"));
    assert.ok(fullTex.includes("28 câu"));
    assert.ok(fullTex.includes(constantsTex));
    assert.ok(fullTex.includes(buildPart2Latex(sampleExam)));
    assert.ok(fullTex.includes(buildPart3Latex(sampleExam)));
    assert.ok(fullTex.includes(buildAnswersLatex(sampleExam)));

    assert.equal(isVietnameseSourceId("tridm/VMLU:default:test:row_12"), true);
    assert.equal(isVietnameseSourceId("chiayewken/m3exam:vietnamese:test:row_4"), true);
    assert.equal(isVietnameseSourceId("alexandrainst/m_mmlu:vi:test:row_9"), true);
    assert.equal(isVietnameseSourceId("Intelligent-Internet/Vietnamese-Entrance-Exam:default:train:row_2"), true);
    assert.equal(isVietnameseSourceId("PSE:12345"), false);
    assert.equal(sanitizeVaultKey(" lop 12ly!! "), "LOP-12LY");
});

test("PhysicsSourceHarvester extracts all HF schemas, routes via /api/harvest when proxy online, and filters 2006 seeds", async () => {
    // Test schema extractors
    assert.ok(
        extractProblemFromHfRow({
            vi_problem: "Ở mặt nước, hai nguồn sóng kết hợp dao động cùng pha cách nhau 19 cm.",
            vi_choices: "{'A': '5', 'B': '6'}",
            answer: "5"
        }).questionOnly.includes("hai nguồn sóng")
    );
    assert.ok(
        extractProblemFromHfRow({
            question_text: "Một khối khí lí tưởng biến đổi đẳng nhiệt ở 300 K.",
            options: ["A. Tăng", "B. Giảm"],
            answer_text: "A"
        }).questionOnly.includes("khí lí tưởng")
    );
    assert.ok(
        extractProblemFromHfRow({
            instruction: "Một proton chuyển động dọc trục ống dây solenoid.",
            option_a: "Đi thẳng đều",
            option_b: "Chuyển động tròn",
            answer: "A"
        }).questionOnly.includes("solenoid")
    );

    const vault = {
        sourceIds: new Set(),
        sessionDuplicatesBlocked: 0,
        sessionCurriculumRejected: 0
    };
    const harvester = new PhysicsSourceHarvester({
        vault,
        aiClient: { serverHealth: { proxyAvailable: true } }
    });

    const requestedUrls = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        const u = String(url);
        requestedUrls.push(u);
        assert.ok(u.startsWith("/api/harvest?url="), `Expected server-side /api/harvest routing, got ${u}`);

        const decoded = decodeURIComponent(u.slice("/api/harvest?url=".length));
        if (decoded.includes("datasets-server.huggingface.co")) {
            const rows = [
                // Several banned 2006 RLC & Bohr seeds -> guaranteed to be encountered & rejected regardless of CSPRNG shuffle
                ...Array.from({ length: 6 }, (_, k) => ({
                    row_idx: k + 1,
                    row: { question: `Một mạch RLC nối tiếp số ${k + 1} có cảm kháng 30 Ohm và dung kháng 40 Ohm, tính tổng trở Z.` }
                })),
                // Missing-figure seed -> must be filtered out
                { row_idx: 20, row: { question: "Quan sát đồ thị hình bên, hãy xác định chu kì dao động của vật." } },
                // Valid GDPT 2018 physics seeds
                ...Array.from({ length: 12 }, (_, i) => ({
                    row_idx: 100 + i,
                    row: {
                        question: `Một bình kín chứa ${i + 1} mol khí lí tưởng ở nhiệt độ 300 K, tính nội năng và áp suất của khối khí theo hệ SI.`
                    }
                }))
            ];
            return new Response(JSON.stringify({ rows, num_rows_total: 180 }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        if (decoded.includes("api.stackexchange.com")) {
            const items = Array.from({ length: 8 }, (_, i) => ({
                question_id: 7000 + i,
                title: `Ideal gas thermodynamic process ${i}`,
                body: `<p>Calculate the internal energy change and heat transferred in an isobaric expansion of ${i + 2} moles of ideal gas.</p>`,
                tags: ["thermodynamics", "ideal-gas"],
                link: `https://physics.stackexchange.com/q/${7000 + i}`
            }));
            return new Response(JSON.stringify({ items }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }
        return new Response("Not Found", { status: 404 });
    };

    try {
        const res = await harvester.harvestAllExamSeeds("vn_priority");
        assert.equal(res.part1.length, 18);
        assert.equal(res.part2.length, 4);
        assert.equal(res.part3.length, 6);
        assert.ok(vault.sessionCurriculumRejected >= 1, "Expected banned 2006 RLC seed to be rejected during harvest");
        assert.ok(requestedUrls.every((u) => u.startsWith("/api/harvest?url=")));
    } finally {
        globalThis.fetch = prevFetch;
    }
});

test("Strictly SEQUENTIAL 4-batch Physics exam pipeline compiles 28 questions (9+9+4+6), auto-recovers JSON & regenerates 2006 violations", async () => {
    const makeSeeds = (prefix, count) =>
        Array.from({ length: count }, (_, i) => ({
            sourceId: `tridm/VMLU:${prefix}_${i}`,
            sourceLabel: `VMLU #${prefix}_${i}`,
            sourceLang: "vi",
            sourceUrl: "https://huggingface.co/datasets/tridm/VMLU",
            rawContent: `Bài toán Vật Lý THPT chuẩn GDPT 2018 mẫu ${prefix} số ${i} về nhiệt học, khí lí tưởng, từ trường và hạt nhân.`
        }));

    const harvester = {
        harvestAllExamSeeds: async () => ({
            part1: makeSeeds("p1", 18),
            part2: makeSeeds("p2", 4),
            part3: makeSeeds("p3", 6),
            spare: makeSeeds("spare", 6)
        }),
        harvestSeedsForPart: async (partKey, count) => makeSeeds(`regen_${partKey}`, count)
    };

    let activeConcurrent = 0;
    let maxConcurrent = 0;
    let part3FailedOnce = false;
    let regenTriggered = false;
    const callOrder = [];

    const aiClient = {
        getConnectionModeLabel: () => ({ ready: true, mode: "byok", label: "Gemini Free · gemini-3.5-flash-lite", detail: "Mock" }),
        generate: async ({ prompt }) => {
            activeConcurrent += 1;
            maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
            await new Promise((r) => setTimeout(r, 40));
            activeConcurrent -= 1;

            // Single-question regeneration path when a banned 2006 question was detected
            if (prompt.startsWith("Tạo 1 câu hỏi PHẦN I")) {
                regenTriggered = true;
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        topic: "Từ trường 12",
                        stemLatex: "Một đoạn dây dẫn thẳng dài $0,5\\,\\text{m}$ mang dòng điện $4\\,\\text{A}$ đặt vuông góc với từ trường đều $B = 0,2\\,\\text{T}$. Lực từ tác dụng lên dây dẫn bằng bao nhiêu?",
                        svgFigure: "",
                        figureCaption: "",
                        optionA: "$0,4\\,\\text{N}$",
                        optionB: "$0,8\\,\\text{N}$",
                        optionC: "$0,2\\,\\text{N}$",
                        optionD: "$4\\,\\text{N}$",
                        correctOption: "A",
                        solutionLatex: "Áp dụng $F = BIL\\sin 90^\\circ = 0,2 \\cdot 4 \\cdot 0,5 = 0,4\\,\\text{N}$."
                    })
                };
            }

            if (prompt.includes("từ Câu 1 đến Câu 9")) {
                callOrder.push("batch1");
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        questions: Array.from({ length: 9 }, (_, i) => ({
                            number: i + 1,
                            topic: "Vật lí nhiệt & Khí lí tưởng",
                            stemLatex: `Câu nhiệt học và khí lí tưởng lô một số ${i + 1}: Đun nóng $${i + 2}\\,\\text{kg}$ nước tăng thêm $10\\,\\text{K}$, biết nhiệt dung riêng $c = 4200\\,\\text{J/(kg}\\cdot\\text{K)}$.`,
                            svgFigure: "",
                            figureCaption: "",
                            optionA: "$10\\,\\text{kJ}$",
                            optionB: "$20\\,\\text{kJ}$",
                            optionC: "$30\\,\\text{kJ}$",
                            optionD: "$40\\,\\text{kJ}$",
                            correctOption: "A",
                            solutionLatex: "Áp dụng $Q = mc\\Delta T$ theo đơn vị SI."
                        }))
                    })
                };
            }

            if (prompt.includes("từ Câu 10 đến Câu 18")) {
                callOrder.push("batch2");
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        questions: Array.from({ length: 9 }, (_, i) => ({
                            number: i + 10,
                            topic: "Từ trường & Hạt nhân",
                            // Inject 1 banned RLC violation at question 13 to verify auto-rejection & regeneration!
                            stemLatex:
                                i === 3
                                    ? "Đặt điện áp xoay chiều vào đoạn mạch RLC nối tiếp có cảm kháng $Z_L = 50\\,\\Omega$, tính tổng trở."
                                    : `Câu từ trường và vật lí hạt nhân lô hai số ${i + 10}: Tính năng lượng liên kết của hạt nhân có độ hụt khối $\\Delta m = 0,0${i + 1}2\\,\\text{amu}$.`,
                            svgFigure: "",
                            figureCaption: "",
                            optionA: "$10\\,\\text{MeV}$",
                            optionB: "$20\\,\\text{MeV}$",
                            optionC: "$30\\,\\text{MeV}$",
                            optionD: "$40\\,\\text{MeV}$",
                            correctOption: "B",
                            solutionLatex: "Đổi $1\\,\\text{amu} = 931,5\\,\\text{MeV}/c^2$."
                        }))
                    })
                };
            }

            if (prompt.includes("PHẦN III")) {
                callOrder.push("batch4");
                if (!part3FailedOnce) {
                    part3FailedOnce = true;
                    return { provider: "gemini", model: "gemini-3.5-flash-lite", text: "{malformed json" };
                }
                return {
                    provider: "gemini",
                    model: "gemini-3.5-flash-lite",
                    text: JSON.stringify({
                        questions: Array.from({ length: 6 }, (_, i) => ({
                            number: i + 1,
                            topic: "Trả lời ngắn Vật Lý",
                            stemLatex: `Bài toán trả lời ngắn Vật Lý số ${i + 1}: Một bình kín chứa $${i + 2}$ mol khí lí tưởng ở nhiệt độ $300\\,\\text{K}$, tính công suất nhiệt (làm tròn đến hàng phần mười).`,
                            svgFigure: "",
                            figureCaption: "",
                            shortAnswer: `${i + 1}.5`,
                            solutionLatex: "Áp dụng công thức hệ SI, bấm Casio fx-580VN X."
                        }))
                    })
                };
            }

            callOrder.push("batch3");
            const svgGraph = `<svg viewBox="0 0 420 230" xmlns="http://www.w3.org/2000/svg"><line x1="40" y1="200" x2="390" y2="200" stroke="currentColor"/><line x1="40" y1="200" x2="40" y2="20" stroke="currentColor"/><path d="M60 170 L200 90 L340 90" stroke="#0284c7" stroke-width="2.5" fill="none"/><text x="370" y="218">t (phút)</text><text x="10" y="30">t (°C)</text></svg>`;
            return {
                provider: "gemini",
                model: "gemini-3.5-flash-lite",
                text: JSON.stringify({
                    questions: Array.from({ length: 4 }, (_, i) => ({
                        number: i + 1,
                        topic: ["Vật lí nhiệt", "Khí lí tưởng", "Từ trường", "Vật lí hạt nhân"][i],
                        stemLatex:
                            i === 0
                                ? "Quan sát đồ thị hình bên biểu diễn sự thay đổi nhiệt độ của mẫu chất rắn khối lượng $0,5\\,\\text{kg}$ theo thời gian đun nóng với công suất $1000\\,\\text{W}$."
                                : `Thí nghiệm vật lí thực tế phần hai số ${i + 1}: Khảo sát mẫu vật khối lượng $${i + 2}\\,\\text{kg}$ trong phòng thí nghiệm chuẩn SI.`,
                        svgFigure: i === 0 ? svgGraph : "",
                        figureCaption: i === 0 ? "Đồ thị nhiệt độ theo thời gian đun nóng" : "",
                        statements: [
                            { label: "a", statementLatex: `Đại lượng đo thứ nhất câu ${i + 1} tăng đều theo thời gian`, isTrue: true },
                            { label: "b", statementLatex: `Nội năng hệ câu ${i + 1} không đổi suốt quá trình`, isTrue: false },
                            { label: "c", statementLatex: `Giá trị tính theo hệ SI câu ${i + 1} thỏa định luật bảo toàn`, isTrue: true },
                            { label: "d", statementLatex: `Kết quả thí nghiệm câu ${i + 1} phù hợp lý thuyết GDPT 2018`, isTrue: true }
                        ],
                        solutionLatex: "Phân tích từng ý a, b, c, d theo đơn vị SI và bấm Casio fx-580VN X."
                    }))
                })
            };
        }
    };

    let savedExam = null;
    const storage = {
        activeVaultKey: "TEST-VATLY-VAULT",
        vault: {
            hashes: new Set(),
            shingleEntries: [],
            sessionDuplicatesBlocked: 0,
            sessionCurriculumRejected: 0,
            sessionMissingFigureRejected: 0
        },
        saveExamAndFingerprints: async (examDoc) => {
            savedExam = examDoc;
        }
    };

    const progressUpdates = [];
    const exam = await runFullExamPipeline({
        aiClient,
        harvester,
        storage,
        priorityMode: "vn_priority",
        difficultyKey: "standard",
        onProgress: (pct, msg) => progressUpdates.push({ pct, msg }),
        onEntropy: () => {},
        onLog: () => {}
    });

    // Must run strictly sequentially!
    assert.equal(maxConcurrent, 1, `Expected strictly sequential execution (maxConcurrent=1), got ${maxConcurrent}`);
    assert.deepEqual(callOrder, ["batch1", "batch2", "batch3", "batch4", "batch4"]);
    assert.equal(part3FailedOnce, true);
    assert.equal(regenTriggered, true, "Expected banned RLC question 13 to be blocked and regenerated");
    assert.equal(exam.part1.length, 18);
    assert.equal(exam.part2.length, 4);
    assert.equal(exam.part3.length, 6);
    // Verify sanitized short answers use Vietnamese comma and <= 4 chars
    assert.equal(exam.part3[0].shortAnswer, "1,5");
    // Verify question 13 no longer contains RLC
    assert.equal(containsBanned2006Physics(exam.part1[12].stemLatex), false);
    // Verify SVG diagram preserved on Part II Q1
    assert.ok(exam.part2[0].svgFigure.startsWith("<svg"));
    assert.equal(exam.svgCount, 1);
    assert.equal(savedExam.examId, exam.examId);
    assert.equal(progressUpdates.at(-1).pct, 100);
});

test("HTTP server serves Physics frontend and enforces /api/health, /api/ai, /api/harvest security", async () => {
    const server = createAppServer({ GEMINI_API_KEY: "", DEFAULT_AI_PROVIDER: "gemini" });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    try {
        const homeRes = await fetch(`${base}/`);
        assert.equal(homeRes.status, 200);
        const html = await homeRes.text();
        assert.ok(html.includes("THPTQG 2026 Vật Lý"));
        assert.ok(html.includes("./js/app.js"));
        assert.ok(html.includes("Copy Phần I (1–9)"));
        assert.ok(html.includes("Copy Phần I (10–18)"));

        const cssRes = await fetch(`${base}/styles.css`);
        assert.equal(cssRes.status, 200);
        assert.ok((cssRes.headers.get("content-type") || "").includes("text/css"));

        const healthRes = await fetch(`${base}/api/health`);
        assert.equal(healthRes.status, 200);
        const health = await healthRes.json();
        assert.equal(health.ok, true);
        assert.equal(health.subject, "physics-2026");
        assert.equal(health.serverHasAnyKey, false);
        assert.equal(health.defaultModel, "gemini-3.5-flash-lite");

        const healthWithKey = getServerHealth({ GEMINI_API_KEY: "dummy-test-key" });
        assert.equal(healthWithKey.serverHasAnyKey, true);
        assert.equal(healthWithKey.configuredProviders.gemini, true);

        const aiRes = await fetch(`${base}/api/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "gemini", model: "gemini-3.5-flash-lite", prompt: "test" })
        });
        assert.equal(aiRes.status, 401);
        const aiJson = await aiRes.json();
        assert.equal(aiJson.code, "MISSING_API_KEY");

        const harvestBlocked = await fetch(`${base}/api/harvest?url=${encodeURIComponent("http://127.0.0.1/secret")}`);
        assert.equal(harvestBlocked.status, 403);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test("AI settings auto-migration and fallback cooldown work identically", async () => {
    const store = new Map();
    const prevStorage = globalThis.localStorage;
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };

    try {
        store.set(
            STORAGE_KEYS.AI_SETTINGS,
            JSON.stringify({
                provider: "gemini",
                models: { gemini: "gemini-4-hydrogen" },
                keys: { gemini: "dummy-saved-key" },
                thinkingLevel: "MEDIUM"
            })
        );
        const migrated = loadAiSettings();
        assert.equal(migrated.settingsVersion, AI_SETTINGS_VERSION);
        assert.equal(migrated.keys.gemini, "dummy-saved-key");
        assert.equal(migrated.models.gemini, "gemini-3.5-flash-lite");
        assert.equal(migrated.thinkingLevel, "LOW");
    } finally {
        globalThis.localStorage = prevStorage;
    }

    const chain = getFallbackCandidateModels("gemini", "gemini-4-hydrogen", true);
    assert.equal(chain[0], "gemini-4-hydrogen");
    assert.ok(chain.includes("gemini-3.5-flash-lite"));

    const client = new UnifiedAiClient();
    client.settings.provider = "gemini";
    client.settings.models.gemini = "gemini-4-hydrogen";
    client.settings.keys.gemini = "dummy-key";
    client.settings.autoFallback = true;

    const called = [];
    client._invokeSingleModel = async ({ model }) => {
        called.push(model);
        if (model === "gemini-4-hydrogen") {
            const err = new Error("Gemini HTTP 503");
            err.status = 503;
            err.retryable = true;
            throw err;
        }
        return { ok: true, provider: "gemini", model, text: '{"ok": true}', groundingLinks: [] };
    };

    const res1 = await client.generate({ prompt: "Lô 1" });
    assert.equal(res1.model, "gemini-3.5-flash-lite");
    assert.deepEqual(called, ["gemini-4-hydrogen", "gemini-3.5-flash-lite"]);

    called.length = 0;
    const res2 = await client.generate({ prompt: "Lô 2" });
    assert.equal(res2.model, "gemini-3.5-flash-lite");
    assert.deepEqual(called, ["gemini-3.5-flash-lite"]);
});
