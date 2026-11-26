import test from "node:test";
import assert from "node:assert/strict";

import {
    getServerHealth,
    resolveGeminiThinkingLevel,
    buildGeminiPayload,
    extractGeminiResponse,
    stripInlineThinkTags,
    validateCustomBaseUrl,
    validateHarvestUrl,
    detectServerMissingFigureText,
    filterHarvestPayloadMissingFigures
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
    containsMissingFigureReference,
    validateQuestionMissingFigures,
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
import { PHYSICS_CONSTANTS, STORAGE_KEYS, SYSTEM_INSTRUCTION_PHYSICS_2026 } from "../public/js/config.js";
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
        sessionCurriculumRejected: 0,
        sessionMissingFigureRejected: 0
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
                // Missing-figure seeds -> must be filtered out
                ...Array.from({ length: 5 }, (_, k) => ({
                    row_idx: 20 + k,
                    row: { question: `Quan sát đồ thị hình bên số ${k + 1}, hãy xác định chu kì dao động của vật.` }
                })),
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
            const items = [
                // Physics SE items with embedded <img> and "as shown in the figure" -> must be dropped
                {
                    question_id: 6990,
                    title: "Magnetic force on wire loop",
                    body: `<p>Calculate the magnetic flux as shown in the figure below: <img src="https://i.sstatic.net/sample.png" alt="loop"/></p>`,
                    tags: ["electromagnetism", "magnetic-fields"],
                    link: "https://physics.stackexchange.com/q/6990"
                },
                {
                    question_id: 6991,
                    title: "Pressure graph analysis",
                    body: `<p>Using the graph below, find the work done during the thermodynamic cycle in the diagram.</p>`,
                    tags: ["thermodynamics", "ideal-gas"],
                    link: "https://physics.stackexchange.com/q/6991"
                },
                ...Array.from({ length: 8 }, (_, i) => ({
                    question_id: 7000 + i,
                    title: `Ideal gas thermodynamic process ${i}`,
                    body: `<p>Calculate the internal energy change and heat transferred in an isobaric expansion of ${i + 2} moles of ideal gas.</p>`,
                    tags: ["thermodynamics", "ideal-gas"],
                    link: `https://physics.stackexchange.com/q/${7000 + i}`
                }))
            ];
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
        assert.ok(vault.sessionMissingFigureRejected >= 1, "Expected missing-figure seeds to be rejected during harvest");
        const allHarvested = [...res.part1, ...res.part2, ...res.part3, ...(res.spare || [])];
        for (const seed of allHarvested) {
            assert.equal(
                containsMissingFigureReference(seed.rawContent, "", { strictSeed: true }),
                false,
                `Missing-figure seed leaked into harvest results: ${seed.rawContent}`
            );
        }
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

test("Layer 1 Backend (/api/harvest) filters missing-figure HF rows & Physics SE items without false positives", () => {
    // Must detect all required Vietnamese, English, and raw image markup triggers
    const mustBlock = [
        "Cho mạch điện như hình vẽ bên dưới.",
        "Xác định áp suất từ hình bên.",
        "Xét con lắc đặt như hình dưới đây.",
        "Từ đồ thị bên, tính công của khối khí.",
        "Dựa vào đồ thị sau, tìm chu kì dao động.",
        "Một khung dây đặt trong từ trường như hình 2.",
        "Quan sát hình để xác định chiều dòng điện cảm ứng.",
        "Cho mạch điện bên có điện trở R = 10 Ohm.",
        "Cho bảng biến thiên sau của đại lượng vật lí.",
        "Find the net force as shown in the figure.",
        "Determine the current in the diagram.",
        "Based on the graph below, compute work done.",
        "The figure shows a conducting rod on rails.",
        "Consider \\includegraphics[width=5cm]{circuit.png} for the loop.",
        "Draw the path [asy]draw((0,0)--(1,1));[/asy]",
        "Diagram: ![circuit](https://example.com/fig.png)",
        "<p>Look at <img src='https://i.sstatic.net/123.png'> carefully.</p>"
    ];
    for (const sample of mustBlock) {
        assert.equal(
            detectServerMissingFigureText(sample).hasMissingFigure,
            true,
            `Backend Layer 1 failed to block: ${sample}`
        );
    }

    // Must NOT falsely block self-contained GDPT 2018 physics questions
    const mustAllow = [
        "Theo mô hình động học phân tử chất khí, các phân tử chuyển động hỗn loạn không ngừng.",
        "Một quả cầu hình cầu bán kính R = 5 cm tích điện đều.",
        "Một khối khí lí tưởng thực hiện quá trình đẳng nhiệt tuân theo phương trình pV = 240 J.",
        "Trong hệ tọa độ (p, V), trạng thái 1 có (p1 = 10^5 Pa, V1 = 4 lít) biến đổi đẳng áp sang V2 = 8 lít."
    ];
    for (const sample of mustAllow) {
        assert.equal(
            detectServerMissingFigureText(sample).hasMissingFigure,
            false,
            `Backend Layer 1 falsely blocked valid physics text: ${sample}`
        );
    }

    // HuggingFace payload filter
    const hfPayload = JSON.stringify({
        rows: [
            { row_idx: 1, row: { question: "Quan sát đồ thị hình bên và tính nhiệt dung riêng." } },
            { row_idx: 2, row: { question: "Cho mạch điện bên có suất điện động E = 12 V." } },
            { row_idx: 3, row: { question: "Xét câu hỏi hợp lệ", options: ["A. Xem hình vẽ dưới đây", "B. 5 J"] } },
            { row_idx: 4, row: { question: "Tính nội năng biến thiên của 2 mol khí lí tưởng khi nhận nhiệt 500 J và sinh công 200 J." } }
        ],
        num_rows_total: 4
    });
    const hfFiltered = filterHarvestPayloadMissingFigures(hfPayload, "application/json; charset=utf-8");
    assert.equal(hfFiltered.filteredMissingFigures, 3);
    const hfParsed = JSON.parse(hfFiltered.body);
    assert.equal(hfParsed.rows.length, 1);
    assert.equal(hfParsed.rows[0].row_idx, 4);
    assert.equal(hfParsed.filteredMissingFigures, 3);

    // Physics Stack Exchange payload filter
    const sePayload = JSON.stringify({
        items: [
            { question_id: 1, title: "Circuit", body: "<p>See <img src='https://i.sstatic.net/x.png'/></p>" },
            { question_id: 2, title: "Pulley", body: "<p>A mass is suspended as shown in the figure.</p>" },
            { question_id: 3, title: "Graph", body: "<p>From the graph below, determine entropy.</p>" },
            { question_id: 4, title: "Isothermal gas", body: "<p>Find the work done by 3 mol of ideal gas expanding from 2 L to 6 L at 300 K.</p>" }
        ]
    });
    const seFiltered = filterHarvestPayloadMissingFigures(sePayload, "application/json");
    assert.equal(seFiltered.filteredMissingFigures, 3);
    const seParsed = JSON.parse(seFiltered.body);
    assert.equal(seParsed.items.length, 1);
    assert.equal(seParsed.items[0].question_id, 4);
    assert.equal(seParsed.filteredMissingFigures, 3);
});

test("Layer 2 System Instruction & Layer 3 Post-Generation Validator catch leaks in stems, options A-D, and Part II statements", () => {
    // Layer 2: System Instruction explicitly forbids missing-figure phrases & mandates self-contained formulas/tables
    assert.ok(SYSTEM_INSTRUCTION_PHYSICS_2026.includes("đồ thị hình bên"));
    assert.ok(SYSTEM_INSTRUCTION_PHYSICS_2026.includes("bảng biến thiên"));
    assert.ok(SYSTEM_INSTRUCTION_PHYSICS_2026.includes("bảng số liệu Markdown"));

    // Table MUST NOT bypass figure/graph references ("như hình vẽ bên" / "đồ thị hình bên")
    const fakeTableWithFigurePhrase =
        "Quan sát đồ thị hình bên với bảng sau:\n| t | 0 | 2 |\n|---|---|\n| T | 20 | 40 |";
    assert.equal(detectMissingFigureReference(fakeTableWithFigurePhrase, "").ok, false);

    // Raw image markup MUST ALWAYS be rejected even if an SVG is attached!
    const validSvg = `<svg viewBox="0 0 420 230" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="200" x2="300" y2="200" stroke="currentColor"/></svg>`;
    assert.equal(detectMissingFigureReference("Xem \\includegraphics{fig1.png}", validSvg).ok, false);
    assert.equal(detectMissingFigureReference("Xem ![graph](x.png)", validSvg).ok, false);
    assert.equal(detectMissingFigureReference("Xem <img src='a.png'>", validSvg).ok, false);
    assert.equal(detectMissingFigureReference("Xem [asy]draw((0,0)--(1,1));[/asy]", validSvg).ok, false);

    // Layer 3 validator catches leak hidden inside Part I optionC
    const badPart1Option = validateQuestionMissingFigures(
        {
            stemLatex: "Một chất điểm dao động điều hòa với phương trình $x = 4\\cos(2\\pi t)\\,\\text{cm}$.",
            svgFigure: "",
            optionA: "$2\\,\\text{Hz}$",
            optionB: "$1\\,\\text{Hz}$",
            optionC: "Đồ thị như hình vẽ dưới đây",
            optionD: "$4\\,\\text{Hz}$"
        },
        "part1"
    );
    assert.equal(badPart1Option.ok, false);
    assert.equal(badPart1Option.field, "phương án C");

    // Layer 3 validator catches missing variation-table leak inside Part II statement b) when no table exists
    const badPart2Stmt = validateQuestionMissingFigures(
        {
            stemLatex: "Một lượng khí lí tưởng thực hiện quá trình biến đổi trạng thái.",
            svgFigure: "",
            statements: [
                { label: "a", statementLatex: "Nhiệt độ tăng gấp đôi.", isTrue: true },
                { label: "b", statementLatex: "Dựa vào bảng biến thiên sau, áp suất tăng tuyến tính.", isTrue: false },
                { label: "c", statementLatex: "Nội năng tăng.", isTrue: true },
                { label: "d", statementLatex: "Khí sinh công dương.", isTrue: false }
            ]
        },
        "part2"
    );
    assert.equal(badPart2Stmt.ok, false);
    assert.equal(badPart2Stmt.field, "mệnh đề b)");

    // Layer 3 validator ALLOWS variation-table reference in Part II statement when stemLatex explicitly provides the table
    const validPart2WithTable = validateQuestionMissingFigures(
        {
            stemLatex: "Cho bảng biến thiên sau:\n| $t$ (s) | $0$ | $2$ | $4$ |\n|---|---|---|---|\n| $T$ (K) | $300$ | $360$ | $420$ |",
            svgFigure: "",
            statements: [
                { label: "a", statementLatex: "Theo bảng biến thiên sau $2\\,\\text{s}$, nhiệt độ tăng $60\\,\\text{K}$.", isTrue: true }
            ]
        },
        "part2"
    );
    assert.equal(validPart2WithTable.ok, true);
});

test("Layer 3 Post-generation Validator in runFullExamPipeline logs [Chặn thiếu hình] and auto-regenerates clean replacements across retries", async () => {
    const makeSeeds = (prefix, count) =>
        Array.from({ length: count }, (_, i) => ({
            sourceId: `tridm/VMLU:figtest_${prefix}_${i}`,
            sourceLabel: `VMLU #${prefix}_${i}`,
            sourceLang: "vi",
            sourceUrl: "https://huggingface.co/datasets/tridm/VMLU",
            rawContent: `Hạt giống vật lý sạch mẫu ${prefix} số ${i} về nhiệt học, khí lí tưởng, từ trường và hạt nhân.`
        }));

    const harvester = {
        harvestAllExamSeeds: async () => ({
            part1: makeSeeds("p1", 18),
            part2: makeSeeds("p2", 4),
            part3: makeSeeds("p3", 6),
            spare: makeSeeds("spare", 8)
        }),
        harvestSeedsForPart: async (partKey, count) => makeSeeds(`regen_${partKey}`, count)
    };

    let q5RegenAttempts = 0;
    let q14RegenAttempts = 0;
    let p2q2RegenAttempts = 0;
    const logs = [];

    const p1Batch1Stems = [
        "Xét khối đồng đỏ khối lượng $1,5\\,\\text{kg}$ nóng lên thêm $25\\,\\text{K}$, tìm nhiệt lượng hấp thụ biết nhiệt dung riêng của đồng bằng $380\\,\\text{J/(kg}\\cdot\\text{K)}$.",
        "Một bình thép kín dung tích $12\\,\\text{lít}$ chứa khí oxi ở $27^\\circ\\text{C}$ và áp suất $200\\,\\text{kPa}$, xác định số mol phân tử khí bên trong bình.",
        "Một miếng nước đá khối lượng $400\\,\\text{g}$ đang ở $0^\\circ\\text{C}$ chuyển hoàn toàn sang thể lỏng, tính nhiệt lượng cần cung cấp với $\\lambda = 3,34\\cdot 10^5\\,\\text{J/kg}$.",
        "Đun sôi $0,5\\,\\text{kg}$ nước tinh khiết ở $100^\\circ\\text{C}$ cho bay hơi hết, xác định năng lượng hóa hơi biết $L = 2,26\\cdot 10^6\\,\\text{J/kg}$.",
        // Inject missing figure leak at Question 5!
        "Dựa vào đồ thị hình bên, tính công mà khối khí thực hiện trong chu trình kín.",
        "Một xi lanh có pit-tông di chuyển tự do nén đẳng nhiệt khối khí nitơ từ $8\\,\\text{lít}$ xuống $2\\,\\text{lít}$ với áp suất đầu $1\\,\\text{atm}$, tìm áp suất lúc sau.",
        "Hơ nóng đẳng áp $3\\,\\text{mol}$ khí heli từ $300\\,\\text{K}$ lên $450\\,\\text{K}$, xác định công khối khí sinh ra khi giãn nở.",
        "Tính động năng tịnh tiến trung bình của mỗi phân tử khí argon ở nhiệt độ tuyệt đối $400\\,\\text{K}$ theo đơn vị Jun.",
        "Truyền nhiệt lượng $1200\\,\\text{J}$ cho khí trong bình đồng thời thực hiện công nén $300\\,\\text{J}$, xác định độ biến thiên nội năng theo định luật I nhiệt động lực học."
    ];

    const p1Batch2Stems = [
        "Đoạn dây dẫn thẳng dài $0,4\\,\\text{m}$ mang dòng điện $5\\,\\text{A}$ đặt vuông góc cảm ứng từ đều $0,3\\,\\text{T}$, tính lực từ tác dụng lên đoạn dây.",
        "Khung dây phẳng gồm $200$ vòng diện tích $50\\,\\text{cm}^2$ quay đều trong từ trường $0,1\\,\\text{T}$, xác định từ thông cực đại gửi qua khung.",
        "Trong chân không, sóng điện từ tần số $150\\,\\text{MHz}$ truyền đi với vận tốc ánh sáng $c$, tìm bước sóng tương ứng.",
        "Máy biến áp lí tưởng có cuộn sơ cấp $1000$ vòng nối điện áp hiệu dụng $220\\,\\text{V}$ và cuộn thứ cấp $250$ vòng, tính điện áp hiệu dụng đầu ra.",
        // Question 14: stem is clean, but optionC will carry missing figure leak!
        "Dòng điện xoay chiều chạy qua điện trở thuần có biểu thức $i = 4\\sqrt{2}\\cos(100\\pi t)\\,\\text{A}$, tìm cường độ hiệu dụng.",
        "Hạt nhân heli ${}^4_2\\text{He}$ có độ hụt khối $0,0304\\,\\text{amu}$, tính năng lượng liên kết riêng trên mỗi nuclôn.",
        "Chất phóng xạ poloni có chu kì bán rã $138$ ngày, sau $276$ ngày phần trăm hạt nhân chưa phân rã còn lại bằng bao nhiêu?",
        "Một con lắc lò xo dao động điều hòa với phương trình $x = 6\\cos(4\\pi t)\\,\\text{cm}$, xác định chu kì dao động của vật nặng.",
        "Sóng cơ lan truyền trên mặt hồ yên lặng với tốc độ $1,2\\,\\text{m/s}$ và tần số $6\\,\\text{Hz}$, tính khoảng cách giữa hai đỉnh sóng liên tiếp."
    ];

    const p3Stems = [
        "Đun nóng $2\\,\\text{kg}$ nhôm từ $25^\\circ\\text{C}$ lên $75^\\circ\\text{C}$ với $c = 880\\,\\text{J/(kg}\\cdot\\text{K)}$, tính nhiệt lượng theo $\\text{kJ}$.",
        "Một bình chứa $0,5\\,\\text{mol}$ khí lí tưởng ở $300\\,\\text{K}$ có thể tích $6\\,\\text{lít}$, tính áp suất khí theo đơn vị $\\text{kPa}$ (làm tròn phần nguyên).",
        "Thanh dẫn dài $0,8\\,\\text{m}$ trượt đều vận tốc $5\\,\\text{m/s}$ vuông góc từ trường $0,25\\,\\text{T}$, tìm suất điện động cảm ứng theo Vôn.",
        "Hạt nhân đơteri có độ hụt khối $0,0024\\,\\text{amu}$, xác định năng lượng liên kết theo $\\text{MeV}$ (làm tròn đến hàng phần mười).",
        "Hai nguồn sóng kết hợp cùng pha phát bước sóng $4\\,\\text{cm}$, tìm khoảng cách ngắn nhất giữa hai cực đại giao thoa liên tiếp theo $\\text{cm}$.",
        "Tụ điện phẳng có điện dung $20\\,\\mu\\text{F}$ tích điện ở hiệu điện thế $50\\,\\text{V}$, tính điện tích trên mỗi bản tụ theo $\\text{mC}$."
    ];

    const p2Fixtures = [
        {
            topic: "Vật lí nhiệt",
            stem: "Nhóm học sinh dùng ấm điện công suất $1500\\,\\text{W}$ đun nóng $1,2\\,\\text{kg}$ nước tinh khiết từ $20^\\circ\\text{C}$ đến khi sôi ở áp suất tiêu chuẩn.",
            stmts: [
                { label: "a", statementLatex: "Nhiệt độ sôi của nước ở áp suất chuẩn bằng $373\\,\\text{K}$.", isTrue: true },
                { label: "b", statementLatex: "Độ tăng nhiệt độ của nước là $80\\,\\text{K}$.", isTrue: true },
                { label: "c", statementLatex: "Nội năng khối nước giảm dần trong lúc đun.", isTrue: false },
                { label: "d", statementLatex: "Nhiệt lượng nước thu vào xấp xỉ $403,2\\,\\text{kJ}$.", isTrue: true }
            ]
        },
        {
            topic: "Khí lí tưởng",
            stem: "Xét $2\\,\\text{mol}$ khí nitơ đựng trong xi lanh chịu nhiệt thực hiện quá trình đẳng tích từ trạng thái ban đầu $300\\,\\text{K}$.",
            stmts: [
                { label: "a", statementLatex: "Thể tích xi lanh giữ nguyên trong suốt quá trình.", isTrue: true },
                // Inject missing variation-table leak inside Part II Q2 statement b)!
                { label: "b", statementLatex: "Quan sát bảng biến thiên sau, áp suất đạt cực đại tại $t = 4\\,\\text{s}$.", isTrue: false },
                { label: "c", statementLatex: "Khối khí không thực hiện công cơ học lên pit-tông.", isTrue: true },
                { label: "d", statementLatex: "Động năng phân tử tăng khi nhiệt độ tăng.", isTrue: true }
            ]
        },
        {
            topic: "Từ trường",
            stem: "Khung dây dẫn đồng hình vuông cạnh $10\\,\\text{cm}$ đặt vuông góc với các đường sức của một nam châm điện đang tăng dần cảm ứng từ.",
            stmts: [
                { label: "a", statementLatex: "Diện tích tiết diện khung dây bằng $0,01\\,\\text{m}^2$.", isTrue: true },
                { label: "b", statementLatex: "Từ thông qua khung biến thiên sinh ra dòng điện cảm ứng.", isTrue: true },
                { label: "c", statementLatex: "Từ trường cảm ứng cùng chiều với từ trường ngoài khi $B$ tăng.", isTrue: false },
                { label: "d", statementLatex: "Độ lớn suất điện động tỉ lệ với tốc độ biến thiên từ thông.", isTrue: true }
            ]
        },
        {
            topic: "Vật lí hạt nhân",
            stem: "Trong y học hạt nhân, đồng vị phóng xạ I-131 có chu kì bán rã $8$ ngày được dùng để chẩn đoán tuyến giáp với độ phóng xạ ban đầu $400\\,\\text{MBq}$.",
            stmts: [
                { label: "a", statementLatex: "Đồng vị I-131 phân rã theo quy luật hàm mũ theo thời gian.", isTrue: true },
                { label: "b", statementLatex: "Sau $16$ ngày độ phóng xạ giảm còn $100\\,\\text{MBq}$.", isTrue: true },
                { label: "c", statementLatex: "Chu kì bán rã phụ thuộc mạnh vào nhiệt độ phòng bệnh.", isTrue: false },
                { label: "d", statementLatex: "Hằng số phóng xạ tỉ lệ nghịch với chu kì bán rã.", isTrue: true }
            ]
        }
    ];

    const aiClient = {
        getConnectionModeLabel: () => ({ ready: true, mode: "byok", label: "Mock AI", detail: "Test" }),
        generate: async ({ prompt }) => {
            // Regeneration path for Part I
            if (prompt.startsWith("Tạo 1 câu hỏi PHẦN I ")) {
                if (prompt.includes("Vật lí nhiệt 12 — Câu 5")) {
                    q5RegenAttempts++;
                    // First regen still leaks a missing figure phrase -> pipeline MUST catch and retry a 2nd time!
                    if (q5RegenAttempts === 1) {
                        return {
                            provider: "gemini",
                            model: "mock-model",
                            text: JSON.stringify({
                                topic: "Vật lí nhiệt 12 — Câu 5",
                                stemLatex: "Quan sát hình dưới đây và tính nhiệt lượng truyền cho khối thép.",
                                svgFigure: "",
                                figureCaption: "",
                                optionA: "$10\\,\\text{kJ}$",
                                optionB: "$20\\,\\text{kJ}$",
                                optionC: "$30\\,\\text{kJ}$",
                                optionD: "$40\\,\\text{kJ}$",
                                correctOption: "A",
                                solutionLatex: "Áp dụng $Q = mc\\Delta T$."
                            })
                        };
                    }
                    return {
                        provider: "gemini",
                        model: "mock-model",
                        text: JSON.stringify({
                            topic: "Vật lí nhiệt 12 — Câu 5",
                            stemLatex: "Một thỏi chì nặng $3\\,\\text{kg}$ có nhiệt dung riêng $130\\,\\text{J/(kg}\\cdot\\text{K)}$ nguội đi từ $120^\\circ\\text{C}$ xuống $20^\\circ\\text{C}$. Nhiệt lượng tỏa ra môi trường bằng bao nhiêu?",
                            svgFigure: "",
                            figureCaption: "",
                            optionA: "$39\\,\\text{kJ}$",
                            optionB: "$19,5\\,\\text{kJ}$",
                            optionC: "$78\\,\\text{kJ}$",
                            optionD: "$3,9\\,\\text{kJ}$",
                            correctOption: "A",
                            solutionLatex: "Áp dụng $Q = mc|\\Delta T| = 3 \\cdot 130 \\cdot 100 = 39000\\,\\text{J} = 39\\,\\text{kJ}$."
                        })
                    };
                }
                q14RegenAttempts++;
                return {
                    provider: "gemini",
                    model: "mock-model",
                    text: JSON.stringify({
                        topic: "Dòng điện xoay chiều 12",
                        stemLatex: "Mạng điện dân dụng có điện áp tức thời $u = 220\\sqrt{2}\\cos(100\\pi t)\\,\\text{V}$. Giá trị hiệu dụng và tần số dòng điện lần lượt là bao nhiêu?",
                        svgFigure: "",
                        figureCaption: "",
                        optionA: "$220\\,\\text{V}$ và $50\\,\\text{Hz}$",
                        optionB: "$311\\,\\text{V}$ và $50\\,\\text{Hz}$",
                        optionC: "$220\\,\\text{V}$ và $100\\,\\text{Hz}$",
                        optionD: "$110\\,\\text{V}$ và $60\\,\\text{Hz}$",
                        correctOption: "A",
                        solutionLatex: "Ta có $U = U_0/\\sqrt{2} = 220\\,\\text{V}$ và $f = \\omega/(2\\pi) = 50\\,\\text{Hz}$."
                    })
                };
            }

            // Regeneration path for Part II
            if (prompt.startsWith("Tạo 1 câu hỏi PHẦN II ")) {
                p2q2RegenAttempts++;
                return {
                    provider: "gemini",
                    model: "mock-model",
                    text: JSON.stringify({
                        topic: "Khí lí tưởng",
                        stemLatex:
                            "Thí nghiệm kiểm chứng định luật Boyle với ống thủy tinh chứa khí khô ở $300\\,\\text{K}$ thu được bảng số liệu:\n| Lần đo | $p$ ($\\text{kPa}$) | $V$ ($\\text{lít}$) |\n|---|---|---|\n| 1 | $100$ | $6$ |\n| 2 | $200$ | $3$ |",
                        svgFigure: "",
                        figureCaption: "",
                        statements: [
                            { label: "a", statementLatex: "Tích $pV$ giữ không đổi bằng $600\\,\\text{J}$ ở hai lần đo.", isTrue: true },
                            { label: "b", statementLatex: "Áp suất tỉ lệ nghịch với thể tích trong quá trình đẳng nhiệt.", isTrue: true },
                            { label: "c", statementLatex: "Nhiệt độ tuyệt đối tăng gấp đôi giữa lần 1 và lần 2.", isTrue: false },
                            { label: "d", statementLatex: "Lượng khí thí nghiệm xấp xỉ $0,24\\,\\text{mol}$.", isTrue: true }
                        ],
                        solutionLatex: "Đổi $1\\,\\text{kPa}\\cdot\\text{lít} = 1\\,\\text{J}$, áp dụng $pV = nRT$."
                    })
                };
            }

            if (prompt.includes("từ Câu 1 đến Câu 9")) {
                return {
                    provider: "gemini",
                    model: "mock-model",
                    text: JSON.stringify({
                        questions: p1Batch1Stems.map((stem, i) => ({
                            number: i + 1,
                            topic: i === 4 ? "Vật lí nhiệt 12 — Câu 5" : "Vật lí nhiệt & Khí lí tưởng",
                            stemLatex: stem,
                            svgFigure: "",
                            figureCaption: "",
                            optionA: `$${i + 1}1\\,\\text{đv}$`,
                            optionB: `$${i + 2}2\\,\\text{đv}$`,
                            optionC: `$${i + 3}3\\,\\text{đv}$`,
                            optionD: `$${i + 4}4\\,\\text{đv}$`,
                            correctOption: "A",
                            solutionLatex: "Áp dụng công thức chuẩn SI."
                        }))
                    })
                };
            }

            if (prompt.includes("từ Câu 10 đến Câu 18")) {
                return {
                    provider: "gemini",
                    model: "mock-model",
                    text: JSON.stringify({
                        questions: p1Batch2Stems.map((stem, i) => ({
                            number: i + 10,
                            topic: "Từ trường & Hạt nhân",
                            stemLatex: stem,
                            svgFigure: "",
                            figureCaption: "",
                            optionA: `$${i + 1},2$`,
                            optionB: `$${i + 2},4$`,
                            // Inject missing figure leak inside optionC of Question 14!
                            optionC: i === 4 ? "Chiều dòng điện như hình vẽ dưới đây" : `$${i + 3},6$`,
                            optionD: `$${i + 4},8$`,
                            correctOption: "B",
                            solutionLatex: "Áp dụng công thức chuẩn SI."
                        }))
                    })
                };
            }

            if (prompt.includes("PHẦN III")) {
                return {
                    provider: "gemini",
                    model: "mock-model",
                    text: JSON.stringify({
                        questions: p3Stems.map((stem, i) => ({
                            number: i + 1,
                            topic: "Trả lời ngắn",
                            stemLatex: stem,
                            svgFigure: "",
                            figureCaption: "",
                            shortAnswer: `${i + 2},5`,
                            solutionLatex: "Tính toán theo hệ SI."
                        }))
                    })
                };
            }

            // Part II (4 True/False questions)
            return {
                provider: "gemini",
                model: "mock-model",
                text: JSON.stringify({
                    questions: p2Fixtures.map((fix, i) => ({
                        number: i + 1,
                        topic: fix.topic,
                        stemLatex: fix.stem,
                        svgFigure: "",
                        figureCaption: "",
                        statements: fix.stmts,
                        solutionLatex: "Phân tích từng ý a, b, c, d theo hệ SI."
                    }))
                })
            };
        }
    };

    const storage = {
        activeVaultKey: "TEST-MISSING-FIG",
        vault: {
            hashes: new Set(),
            shingleEntries: [],
            sessionDuplicatesBlocked: 0,
            sessionCurriculumRejected: 0,
            sessionMissingFigureRejected: 0
        },
        saveExamAndFingerprints: async () => {}
    };

    const exam = await runFullExamPipeline({
        aiClient,
        harvester,
        storage,
        priorityMode: "vn_priority",
        difficultyKey: "standard",
        onProgress: () => {},
        onEntropy: () => {},
        onLog: (msg, level) => logs.push({ msg, level })
    });

    assert.equal(q5RegenAttempts, 2, "Expected Q5 to fail first regen and succeed on second regen");
    assert.equal(q14RegenAttempts, 1, "Expected Q14 (bad optionC) to be regenerated once");
    assert.equal(p2q2RegenAttempts, 1, "Expected Part II Q2 (bad statement b) to be regenerated once");
    assert.ok(exam.harvestSummary.missingFigureRejected >= 4);

    assert.ok(logs.some((l) => l.msg.includes("[Chặn thiếu hình PART1 Câu 5]")));
    assert.ok(logs.some((l) => l.msg.includes("[Chặn thiếu hình PART1 Câu 14]")));
    assert.ok(logs.some((l) => l.msg.includes("[Chặn thiếu hình PART2 Câu 2]")));
    assert.ok(logs.some((l) => l.msg.includes("[Đã phục hồi PART1 Câu 5]")));

    // Zero missing-figure questions across the ENTIRE compiled 28-question exam!
    for (const q of exam.part1) {
        assert.equal(validateQuestionMissingFigures(q, "part1").ok, true, `Part I Q${q.number} leaked missing figure`);
    }
    for (const q of exam.part2) {
        assert.equal(validateQuestionMissingFigures(q, "part2").ok, true, `Part II Q${q.number} leaked missing figure`);
    }
    for (const q of exam.part3) {
        assert.equal(validateQuestionMissingFigures(q, "part3").ok, true, `Part III Q${q.number} leaked missing figure`);
    }
});

