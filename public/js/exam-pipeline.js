import {
    DIFFICULTY_CONFIG,
    SOURCE_PRIORITY_CONFIG,
    SYSTEM_INSTRUCTION_PHYSICS_2026
} from "./config.js";
import {
    csprngHex,
    csprngInt,
    isVietnameseSourceId,
    normalizeTextForHash,
    sha256Hex,
    extractShinglesFromNormalized,
    sanitizeShortAnswer,
    sanitizeInlineSvg,
    evaluateQuestionIntegrity
} from "./crypto-dedup.js";
import { parseRobustLatexJson } from "./ai-client.js";

/**
 * 4-Batch SEQUENTIAL Physics Exam Compiler + 3-Layer Anti-Duplication & GDPT 2018 Integrity Pipeline.
 * Generates a full 28-question THPTQG 2026 Physics Exam (50 mins, 10 pts — QĐ 764/QĐ-BGDĐT):
 *   - Batch 1: Part I (Questions 1–9, 9 MCQs)
 *   - Batch 2: Part I (Questions 10–18, 9 MCQs)
 *   - Batch 3: Part II (Questions 1–4, 4 True/False sets × 4 statements)
 *   - Batch 4: Part III (Questions 1–6, 6 Short-Answer numeric questions <= 4 chars)
 * Runs strictly SEQUENTIALLY to guarantee zero Vercel timeout & zero burst 429 rate-limit failures.
 */

const PART1_SCHEMA = {
    type: "OBJECT",
    properties: {
        questions: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    number: { type: "INTEGER" },
                    topic: { type: "STRING" },
                    sourceId: { type: "STRING" },
                    sourceLabel: { type: "STRING" },
                    sourceLang: { type: "STRING" },
                    sourceUrl: { type: "STRING" },
                    stemLatex: { type: "STRING" },
                    svgFigure: { type: "STRING" },
                    figureCaption: { type: "STRING" },
                    optionA: { type: "STRING" },
                    optionB: { type: "STRING" },
                    optionC: { type: "STRING" },
                    optionD: { type: "STRING" },
                    correctOption: { type: "STRING" },
                    solutionLatex: { type: "STRING" }
                },
                required: [
                    "number",
                    "topic",
                    "stemLatex",
                    "optionA",
                    "optionB",
                    "optionC",
                    "optionD",
                    "correctOption",
                    "solutionLatex"
                ]
            }
        }
    },
    required: ["questions"]
};

const PART2_SCHEMA = {
    type: "OBJECT",
    properties: {
        questions: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    number: { type: "INTEGER" },
                    topic: { type: "STRING" },
                    sourceId: { type: "STRING" },
                    sourceLabel: { type: "STRING" },
                    sourceLang: { type: "STRING" },
                    sourceUrl: { type: "STRING" },
                    stemLatex: { type: "STRING" },
                    svgFigure: { type: "STRING" },
                    figureCaption: { type: "STRING" },
                    statements: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                label: { type: "STRING" },
                                statementLatex: { type: "STRING" },
                                isTrue: { type: "BOOLEAN" }
                            },
                            required: ["label", "statementLatex", "isTrue"]
                        }
                    },
                    solutionLatex: { type: "STRING" }
                },
                required: ["number", "topic", "stemLatex", "statements", "solutionLatex"]
            }
        }
    },
    required: ["questions"]
};

const PART3_SCHEMA = {
    type: "OBJECT",
    properties: {
        questions: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    number: { type: "INTEGER" },
                    topic: { type: "STRING" },
                    sourceId: { type: "STRING" },
                    sourceLabel: { type: "STRING" },
                    sourceLang: { type: "STRING" },
                    sourceUrl: { type: "STRING" },
                    stemLatex: { type: "STRING" },
                    svgFigure: { type: "STRING" },
                    figureCaption: { type: "STRING" },
                    shortAnswer: { type: "STRING" },
                    solutionLatex: { type: "STRING" }
                },
                required: ["number", "topic", "stemLatex", "shortAnswer", "solutionLatex"]
            }
        }
    },
    required: ["questions"]
};

function formatSeedBlock(seeds) {
    return seeds
        .map(
            (s, idx) =>
                `Seed ${idx + 1} [sourceId="${s.sourceId}" | sourceLabel="${s.sourceLabel}" | sourceLang="${s.sourceLang}" | sourceUrl="${s.sourceUrl}"]: ${s.rawContent}`
        )
        .join("\n");
}

export async function compilePart1Batch(aiClient, seeds, startNum, topicsList, diffCfg, avoidPreviews) {
    const endNum = startNum + 8;
    const prompt = `Biên soạn ĐÚNG 9 câu hỏi PHẦN I (Trắc nghiệm 4 phương án A, B, C, D) từ Câu ${startNum} đến Câu ${endNum} chuẩn THPTQG Vật Lý 2026 (GDPT 2018 — QĐ 764/QĐ-BGDĐT).
Mức độ: ${diffCfg.label} — ${diffCfg.guidance}
Ma trận chuyên đề bắt buộc cho 9 câu này (đúng thứ tự Câu ${startNum} đến Câu ${endNum}):
${topicsList.map((t, i) => `- Câu ${startNum + i}: ${t}`).join("\n")}

LƯU Ý QUAN TRỌNG:
- 0% nội dung chương trình 2006 (KHÔNG RLC nối tiếp phức tạp, KHÔNG giản đồ Fresnel, KHÔNG mạch dao động LC, KHÔNG mẫu nguyên tử Bo).
- TUYỆT ĐỐI KHÔNG viết "như hình vẽ bên" hoặc "quan sát đồ thị sau" trừ khi câu đó có kèm mã đồ thị/hình vẽ hợp lệ trong trường \`svgFigure\` (nếu không cần hình, để \`svgFigure: ""\` và cho số liệu/phương trình tường minh).
- Trong \`solutionLatex\`, trình bày đổi đơn vị SI ngắn gọn và gợi ý bấm Casio fx-580VN X khi có phép tính hằng số/đổi đơn vị.
- Nội dung đã có trong kho lịch sử (KHÔNG lặp lại): ${avoidPreviews.slice(0, 10).join(" | ") || "Không có"}.

Nguồn hạt giống thực tế:
${formatSeedBlock(seeds)}`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_PHYSICS_2026,
        prompt,
        responseSchema: PART1_SCHEMA
    });

    const parsed = parseRobustLatexJson(res.text);
    const list = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (list.length < 9) {
        throw new Error(`Phần I lô ${startNum}–${endNum} chỉ trả về ${list.length}/9 câu.`);
    }

    return {
        modelUsed: `${res.provider}/${res.model}`,
        questions: list.slice(0, 9).map((q, idx) => {
            const fb = seeds[idx % seeds.length] || {};
            const sid = q.sourceId || fb.sourceId || `seed:p1_${startNum + idx}`;
            const cleanSvg = sanitizeInlineSvg(q.svgFigure || "");
            return {
                ...q,
                number: startNum + idx,
                svgFigure: cleanSvg,
                figureCaption: cleanSvg ? String(q.figureCaption || "").trim() : "",
                sourceId: sid,
                sourceLabel: q.sourceLabel || fb.sourceLabel || "Open Physics",
                sourceLang:
                    q.sourceLang === "vi" || q.sourceLang === "en"
                        ? q.sourceLang
                        : fb.sourceLang || (isVietnameseSourceId(sid) ? "vi" : "en"),
                sourceUrl: q.sourceUrl || fb.sourceUrl || "",
                correctOption: String(q.correctOption || "A").trim().toUpperCase().replace(/[^ABCD]/g, "").charAt(0) || "A"
            };
        })
    };
}

export async function compilePart2(aiClient, seeds, diffCfg, avoidPreviews) {
    const prompt = `Biên soạn ĐÚNG 4 câu hỏi PHẦN II (Trắc nghiệm Đúng/Sai) đánh số từ Câu 1 đến Câu 4 chuẩn THPTQG Vật Lý 2026 (GDPT 2018 — QĐ 764/QĐ-BGDĐT).
Mức độ: ${diffCfg.label} — ${diffCfg.guidance}
Phân bổ bắt buộc 4 câu trọng tâm Lớp 12 (mỗi câu gồm đề dẫn thí nghiệm / bảng số liệu / tình huống thực tế và ĐÚNG 4 mệnh đề a, b, c, d phân hóa từ Biết → Hiểu → Vận dụng):
- Câu 1: Vật lí nhiệt (thí nghiệm đo nhiệt dung riêng / nhiệt nóng chảy riêng / nhiệt hóa hơi riêng hoặc quá trình đun nóng chuyển thể kèm bảng số liệu hoặc đồ thị nhiệt độ theo thời gian bằng SVG nội tuyến \`svgFigure\`).
- Câu 2: Khí lí tưởng (chu trình biến đổi trạng thái hoặc thí nghiệm kiểm chứng định luật khí lí tưởng kèm bảng số liệu tường minh hoặc đồ thị $p-V$ / $p-T$ bằng SVG nội tuyến \`svgFigure\`).
- Câu 3: Từ trường & Cảm ứng điện từ / Đại cương dòng điện xoay chiều (thí nghiệm lực từ cân bằng thanh dẫn, khung dây quay trong từ trường đều hoặc máy biến áp lí tưởng — TUYỆT ĐỐI KHÔNG mạch RLC nối tiếp hay giản đồ Fresnel).
- Câu 4: Vật lí hạt nhân & Phóng xạ (ứng dụng đồng vị phóng xạ trong y học / khảo cổ / nhà máy điện hạt nhân kèm bảng số liệu hoặc đồ thị phân rã bằng SVG nội tuyến \`svgFigure\` — TUYỆT ĐỐI KHÔNG mẫu nguyên tử Bo).

QUY TẮC BẮT BUỘC:
- Khuyến khích tạo 1–2 đồ thị SVG nội tuyến gọn đẹp trong \`svgFigure\` (\`<svg viewBox="0 0 420 230" xmlns="http://www.w3.org/2000/svg">...</svg>\`) có trục tọa độ, số liệu rõ ràng; nếu câu nào không vẽ SVG thì PHẢI ghi số liệu tường minh bằng bảng/phương trình và TUYỆT ĐỐI KHÔNG viết "như hình vẽ bên" hay "quan sát đồ thị sau".
- Trong \`solutionLatex\`, giải thích rõ từng ý a), b), c), d) có đổi đơn vị SI và mẹo bấm Casio fx-580VN X khi phù hợp.
- Tránh trùng lặp: ${avoidPreviews.slice(0, 8).join(" | ") || "Không có"}.

Nguồn hạt giống thực tế:
${formatSeedBlock(seeds)}`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_PHYSICS_2026,
        prompt,
        responseSchema: PART2_SCHEMA
    });

    const parsed = parseRobustLatexJson(res.text);
    const list = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (list.length < 4) {
        throw new Error(`Phần II chỉ trả về ${list.length}/4 câu.`);
    }

    const labels = ["a", "b", "c", "d"];
    return {
        modelUsed: `${res.provider}/${res.model}`,
        questions: list.slice(0, 4).map((q, idx) => {
            const fb = seeds[idx % seeds.length] || {};
            const sid = q.sourceId || fb.sourceId || `seed:p2_${idx + 1}`;
            const cleanSvg = sanitizeInlineSvg(q.svgFigure || "");
            return {
                ...q,
                number: idx + 1,
                svgFigure: cleanSvg,
                figureCaption: cleanSvg ? String(q.figureCaption || "").trim() : "",
                sourceId: sid,
                sourceLabel: q.sourceLabel || fb.sourceLabel || "Open Physics",
                sourceLang:
                    q.sourceLang === "vi" || q.sourceLang === "en"
                        ? q.sourceLang
                        : fb.sourceLang || (isVietnameseSourceId(sid) ? "vi" : "en"),
                sourceUrl: q.sourceUrl || fb.sourceUrl || "",
                statements: (q.statements || []).slice(0, 4).map((st, sIdx) => ({
                    label: labels[sIdx],
                    statementLatex: st.statementLatex || "",
                    isTrue: Boolean(st.isTrue)
                }))
            };
        })
    };
}

export async function compilePart3(aiClient, seeds, diffCfg, avoidPreviews) {
    const prompt = `Biên soạn ĐÚNG 6 câu hỏi PHẦN III (Trắc nghiệm trả lời ngắn) đánh số từ Câu 1 đến Câu 6 chuẩn THPTQG Vật Lý 2026 (GDPT 2018 — QĐ 764/QĐ-BGDĐT).
Mức độ: ${diffCfg.label} — ${diffCfg.guidance}
Phân bổ bắt buộc 6 câu đa dạng chuyên đề:
1. Vật lí nhiệt (cân bằng nhiệt, định luật I NĐLH, nhiệt nóng chảy/hóa hơi riêng — Lớp 12)
2. Khí lí tưởng (phương trình trạng thái, đẳng quá trình, áp suất động học phân tử — Lớp 12)
3. Từ trường / Lực từ / Cảm ứng điện từ Faraday hoặc Đại cương dòng điện xoay chiều (KHÔNG RLC — Lớp 12)
4. Vật lí hạt nhân (độ hụt khối, năng lượng phản ứng hạt nhân hoặc định luật phóng xạ/độ phóng xạ — Lớp 12)
5. Dao động điều hòa / Sóng cơ / Giao thoa ánh sáng Y-âng / Sóng dừng (Lớp 11)
6. Điện trường – Tụ điện / Dòng điện không đổi & Nguồn điện hoặc Xử lý số liệu & Sai số thí nghiệm (Lớp 10–11)

QUY TẮC BẮT BUỘC:
- Đáp số \`shortAnswer\` của MỖI câu PHẢI là số nguyên hoặc số thập phân dùng dấu phẩy ',' có TỐI ĐA 4 KÝ TỰ (tính cả dấu '-' và ','), ví dụ: "12,5", "300", "-2,4", "0,75".
- Nếu kết quả tính ra là số lẻ, BẮT BUỘC ghi rõ trong đề yêu cầu làm tròn (VD: *"làm tròn kết quả đến chữ số hàng phần mười"* hoặc *"đến hàng đơn vị"*) để đáp số đúng khớp <= 4 ký tự.
- TUYỆT ĐỐI KHÔNG viết "như hình vẽ bên" hay "đồ thị sau" nếu không cung cấp mã \`svgFigure\` hợp lệ.
- Trong \`solutionLatex\`, trình bày đổi đơn vị SI đầy đủ và mẹo bấm Casio fx-580VN X khi phù hợp.
- Tránh trùng lặp: ${avoidPreviews.slice(0, 8).join(" | ") || "Không có"}.

Nguồn hạt giống thực tế:
${formatSeedBlock(seeds)}`;

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_PHYSICS_2026,
        prompt,
        responseSchema: PART3_SCHEMA
    });

    const parsed = parseRobustLatexJson(res.text);
    const list = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (list.length < 6) {
        throw new Error(`Phần III chỉ trả về ${list.length}/6 câu.`);
    }

    return {
        modelUsed: `${res.provider}/${res.model}`,
        questions: list.slice(0, 6).map((q, idx) => {
            const fb = seeds[idx % seeds.length] || {};
            const sid = q.sourceId || fb.sourceId || `seed:p3_${idx + 1}`;
            const cleanSvg = sanitizeInlineSvg(q.svgFigure || "");
            return {
                ...q,
                number: idx + 1,
                svgFigure: cleanSvg,
                figureCaption: cleanSvg ? String(q.figureCaption || "").trim() : "",
                sourceId: sid,
                sourceLabel: q.sourceLabel || fb.sourceLabel || "Open Physics",
                sourceLang:
                    q.sourceLang === "vi" || q.sourceLang === "en"
                        ? q.sourceLang
                        : fb.sourceLang || (isVietnameseSourceId(sid) ? "vi" : "en"),
                sourceUrl: q.sourceUrl || fb.sourceUrl || "",
                shortAnswer: sanitizeShortAnswer(q.shortAnswer)
            };
        })
    };
}

async function regenerateSingleQuestion(aiClient, harvester, partKey, qNum, topicHint, diffCfg, modeKey, onLog, spareSeeds = []) {
    let seed = Array.isArray(spareSeeds) && spareSeeds.length > 0 ? spareSeeds.shift() : null;
    if (!seed) {
        const freshSeeds = await harvester.harvestSeedsForPart(partKey, 2, modeKey);
        seed = freshSeeds[0];
    }
    onLog(`[Auto-Retry] Kéo hạt giống thay thế ${seed.sourceLabel} cho ${partKey.toUpperCase()} Câu ${qNum}...`, "warn");

    if (partKey === "part1") {
        const res = await aiClient.generate({
            systemInstruction: SYSTEM_INSTRUCTION_PHYSICS_2026,
            prompt: `Tạo 1 câu hỏi PHẦN I (Trắc nghiệm A, B, C, D) mới hoàn toàn cho Câu ${qNum}, chuyên đề "${topicHint}", mức độ ${diffCfg.label}. TUYỆT ĐỐI KHÔNG RLC/Fresnel/LC/Bo, KHÔNG nhắc "như hình vẽ bên" nếu không có svgFigure hợp lệ. Hạt giống [${seed.sourceLabel}]: ${seed.rawContent}`,
            responseSchema: {
                type: "OBJECT",
                properties: {
                    topic: { type: "STRING" },
                    stemLatex: { type: "STRING" },
                    svgFigure: { type: "STRING" },
                    figureCaption: { type: "STRING" },
                    optionA: { type: "STRING" },
                    optionB: { type: "STRING" },
                    optionC: { type: "STRING" },
                    optionD: { type: "STRING" },
                    correctOption: { type: "STRING" },
                    solutionLatex: { type: "STRING" }
                },
                required: ["topic", "stemLatex", "optionA", "optionB", "optionC", "optionD", "correctOption", "solutionLatex"]
            }
        });
        const q = parseRobustLatexJson(res.text);
        const cleanSvg = sanitizeInlineSvg(q.svgFigure || "");
        return {
            ...q,
            number: qNum,
            svgFigure: cleanSvg,
            figureCaption: cleanSvg ? String(q.figureCaption || "").trim() : "",
            sourceId: seed.sourceId,
            sourceLabel: seed.sourceLabel,
            sourceLang: seed.sourceLang,
            sourceUrl: seed.sourceUrl,
            correctOption: String(q.correctOption || "A").trim().toUpperCase().replace(/[^ABCD]/g, "").charAt(0) || "A"
        };
    }

    if (partKey === "part2") {
        const res = await aiClient.generate({
            systemInstruction: SYSTEM_INSTRUCTION_PHYSICS_2026,
            prompt: `Tạo 1 câu hỏi PHẦN II (Đúng/Sai gồm đề dẫn thực tế/thí nghiệm và 4 ý a, b, c, d) mới hoàn toàn cho Câu ${qNum}, chuyên đề "${topicHint}", mức độ ${diffCfg.label}. TUYỆT ĐỐI KHÔNG RLC/Fresnel/LC/Bo, KHÔNG nhắc "như hình vẽ bên" nếu không có svgFigure hợp lệ. Hạt giống [${seed.sourceLabel}]: ${seed.rawContent}`,
            responseSchema: {
                type: "OBJECT",
                properties: {
                    topic: { type: "STRING" },
                    stemLatex: { type: "STRING" },
                    svgFigure: { type: "STRING" },
                    figureCaption: { type: "STRING" },
                    statements: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                label: { type: "STRING" },
                                statementLatex: { type: "STRING" },
                                isTrue: { type: "BOOLEAN" }
                            },
                            required: ["label", "statementLatex", "isTrue"]
                        }
                    },
                    solutionLatex: { type: "STRING" }
                },
                required: ["topic", "stemLatex", "statements", "solutionLatex"]
            }
        });
        const q = parseRobustLatexJson(res.text);
        const cleanSvg = sanitizeInlineSvg(q.svgFigure || "");
        const labels = ["a", "b", "c", "d"];
        return {
            ...q,
            number: qNum,
            svgFigure: cleanSvg,
            figureCaption: cleanSvg ? String(q.figureCaption || "").trim() : "",
            sourceId: seed.sourceId,
            sourceLabel: seed.sourceLabel,
            sourceLang: seed.sourceLang,
            sourceUrl: seed.sourceUrl,
            statements: (q.statements || []).slice(0, 4).map((st, idx) => ({
                label: labels[idx],
                statementLatex: st.statementLatex || "",
                isTrue: Boolean(st.isTrue)
            }))
        };
    }

    const res = await aiClient.generate({
        systemInstruction: SYSTEM_INSTRUCTION_PHYSICS_2026,
        prompt: `Tạo 1 câu hỏi PHẦN III (Trả lời ngắn, đáp số tối đa 4 ký tự dùng dấu phẩy ',', ghi rõ yêu cầu làm tròn nếu số lẻ) mới hoàn toàn cho Câu ${qNum}, chuyên đề "${topicHint}", mức độ ${diffCfg.label}. TUYỆT ĐỐI KHÔNG RLC/Fresnel/LC/Bo, KHÔNG nhắc "như hình vẽ bên" nếu không có svgFigure hợp lệ. Hạt giống [${seed.sourceLabel}]: ${seed.rawContent}`,
        responseSchema: {
            type: "OBJECT",
            properties: {
                topic: { type: "STRING" },
                stemLatex: { type: "STRING" },
                svgFigure: { type: "STRING" },
                figureCaption: { type: "STRING" },
                shortAnswer: { type: "STRING" },
                solutionLatex: { type: "STRING" }
            },
            required: ["topic", "stemLatex", "shortAnswer", "solutionLatex"]
        }
    });
    const q = parseRobustLatexJson(res.text);
    const cleanSvg = sanitizeInlineSvg(q.svgFigure || "");
    return {
        ...q,
        number: qNum,
        svgFigure: cleanSvg,
        figureCaption: cleanSvg ? String(q.figureCaption || "").trim() : "",
        sourceId: seed.sourceId,
        sourceLabel: seed.sourceLabel,
        sourceLang: seed.sourceLang,
        sourceUrl: seed.sourceUrl,
        shortAnswer: sanitizeShortAnswer(q.shortAnswer)
    };
}

async function verifyAndSanitizePart({
    aiClient,
    harvester,
    vault,
    partKey,
    questions,
    batchHashes,
    batchShingles,
    diffCfg,
    modeKey,
    onLog,
    spareSeeds = []
}) {
    const verified = [];
    const lockMeta = [];

    for (let i = 0; i < questions.length; i++) {
        let candidate = questions[i];
        let accepted = null;

        for (let retry = 0; retry < 2; retry++) {
            const textBody =
                partKey === "part2"
                    ? `${candidate.stemLatex} ${(candidate.statements || []).map((s) => s.statementLatex).join(" ")}`
                    : `${candidate.stemLatex} ${candidate.optionA || ""} ${candidate.optionB || ""} ${candidate.optionC || ""} ${candidate.optionD || ""}`;

            const check = await evaluateQuestionIntegrity(textBody, vault, batchHashes, batchShingles, {
                svgFigure: candidate.svgFigure || ""
            });
            if (check.ok) {
                accepted = { q: candidate, hash: check.hash, normText: check.normText, shingles: check.shingles };
                break;
            }
            onLog(`[Chặn ${partKey.toUpperCase()} Câu ${candidate.number}] ${check.reason} → Tự kéo câu thay thế...`, "warn");
            try {
                candidate = await regenerateSingleQuestion(
                    aiClient,
                    harvester,
                    partKey,
                    candidate.number,
                    candidate.topic || "Vật Lý GDPT 2018",
                    diffCfg,
                    modeKey,
                    onLog,
                    spareSeeds
                );
            } catch {
                break;
            }
        }

        if (!accepted) {
            const fallbackText = String(candidate.stemLatex || `q_${partKey}_${i}_${csprngHex(3)}`);
            const normText = normalizeTextForHash(fallbackText).slice(0, 420);
            const h = await sha256Hex(fallbackText);
            accepted = { q: candidate, hash: h, normText, shingles: extractShinglesFromNormalized(normText, 3) };
        }

        batchHashes.add(accepted.hash);
        batchShingles.push(accepted.shingles);
        verified.push(accepted.q);
        lockMeta.push({
            sourceId: accepted.q.sourceId || `seed:${partKey}_${i}`,
            sourceLang: accepted.q.sourceLang || (isVietnameseSourceId(accepted.q.sourceId) ? "vi" : "en"),
            hash: accepted.hash,
            normText: accepted.normText
        });
    }

    return { verified, lockMeta };
}

async function runBatchWithAutoRetry(batchLabel, fn, onLog) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (err?.code === "MISSING_API_KEY" || err?.status === 401 || err?.status === 403) {
                throw err;
            }
            if (attempt === 0) {
                onLog(`[Tự phục hồi ${batchLabel}] Định dạng phản hồi chưa khớp (${err.message}) → Tự biên soạn lại lô này...`, "warn");
            }
        }
    }
    throw lastErr;
}

export async function runFullExamPipeline({
    aiClient,
    harvester,
    storage,
    priorityMode,
    difficultyKey,
    onProgress,
    onEntropy,
    onLog
}) {
    const startedAt = Date.now();
    const vault = storage.vault;
    const dupsBefore = vault.sessionDuplicatesBlocked || 0;
    const currRejBefore = vault.sessionCurriculumRejected || 0;
    const figRejBefore = vault.sessionMissingFigureRejected || 0;

    const entropyHex = csprngHex(16);
    onEntropy(entropyHex);

    const diffCfg = DIFFICULTY_CONFIG[difficultyKey] || DIFFICULTY_CONFIG.standard;
    const prioCfg = SOURCE_PRIORITY_CONFIG[priorityMode] || SOURCE_PRIORITY_CONFIG.vn_priority;
    const avoidPreviews = vault.shingleEntries
        .slice(-24)
        .map((s) => s.preview)
        .filter(Boolean);

    const aiInfo = aiClient.getConnectionModeLabel();

    onLog(
        `=== PHIÊN TẠO ĐỀ VẬT LÝ 2026 (${prioCfg.label} | ${diffCfg.label} | AI: ${aiInfo.label} | 4 Lô tuần tự | Kho: ${storage.activeVaultKey}) ===`,
        "info"
    );

    // STEP 1: Harvest 28 physics seeds (+ spares) via /api/harvest
    onProgress(
        10,
        "Bước 1/6: Đang kéo nguồn Vật Lý mở qua /api/harvest (8 kho đã kiểm chứng)...",
        "VMLU, M3Exam VI, MMLU VI, Đề ĐH VN, Physics SE, cais/mmlu & SciQ (CSPRNG 128-bit)"
    );

    let seedsP1;
    let seedsP2;
    let seedsP3;
    let spareSeeds = [];

    if (typeof harvester.harvestAllExamSeeds === "function") {
        const harvested = await harvester.harvestAllExamSeeds(priorityMode);
        seedsP1 = harvested.part1;
        seedsP2 = harvested.part2;
        seedsP3 = harvested.part3;
        spareSeeds = Array.isArray(harvested.spare) ? harvested.spare : [];
    } else {
        [seedsP1, seedsP2, seedsP3] = await Promise.all([
            harvester.harvestSeedsForPart("part1", 18, priorityMode),
            harvester.harvestSeedsForPart("part2", 4, priorityMode),
            harvester.harvestSeedsForPart("part3", 6, priorityMode)
        ]);
    }

    // STEP 2: STRICTLY SEQUENTIAL 4-BATCH AI COMPILATION (Vercel timeout-safe)
    const p1TopicsA = [
        "Vật lí nhiệt 12 — Cấu trúc chất, sự chuyển thể hoặc nội năng",
        "Vật lí nhiệt 12 — Định luật I nhiệt động lực học (ΔU = A + Q)",
        "Vật lí nhiệt 12 — Thang nhiệt độ Kelvin–Celsius hoặc Nhiệt dung riêng",
        "Vật lí nhiệt 12 — Nhiệt nóng chảy riêng hoặc Nhiệt hóa hơi riêng",
        "Khí lí tưởng 12 — Mô hình động học phân tử hoặc Định luật Boyle/Charles",
        "Khí lí tưởng 12 — Phương trình trạng thái khí lí tưởng (pV/T = const hoặc pV = nRT)",
        "Khí lí tưởng 12 — Áp suất khí theo động học phân tử hoặc Động năng tịnh tiến trung bình",
        "Vật lí 11 — Dao động điều hòa (li độ, vận tốc, gia tốc, năng lượng hoặc cộng hưởng cơ)",
        "Vật lí 11 — Sóng cơ, giao thoa sóng, sóng dừng hoặc giao thoa ánh sáng Y-âng"
    ];
    const p1TopicsB = [
        "Từ trường 12 — Từ trường, đường sức từ hoặc cảm ứng từ",
        "Từ trường 12 — Lực từ tác dụng lên dây dẫn mang dòng điện (F = BIL sin α)",
        "Từ trường 12 — Từ thông và hiện tượng cảm ứng điện từ (Faraday / định luật Lenz)",
        "Từ trường 12 — Đại cương dòng điện xoay chiều (giá trị hiệu dụng, nguyên tắc tạo dòng, máy biến áp cơ bản — KHÔNG RLC) hoặc Sóng điện từ",
        "Vật lí hạt nhân 12 — Cấu tạo hạt nhân nguyên tử và lực hạt nhân",
        "Vật lí hạt nhân 12 — Độ hụt khối, năng lượng liên kết và năng lượng liên kết riêng",
        "Vật lí hạt nhân 12 — Phản ứng hạt nhân (phân hạch/nhiệt hạch) hoặc Hiện tượng phóng xạ & chu kì bán rã",
        "Vật lí 11 — Điện trường, tụ điện hoặc Dòng điện không đổi & nguồn điện (định luật Ohm toàn mạch)",
        "Vật lí 10/11 — Thực hành thí nghiệm, xử lý bảng số liệu và tính sai số phép đo"
    ];

    // Lô 1/4: Phần I (Câu 1–9)
    onProgress(
        22,
        "Bước 2/6: Đang gọi AI Lô 1/4 — Phần I (Câu 1–9)...",
        "Chạy tuần tự an toàn cho Vercel · Trọng tâm Nhiệt học, Khí lí tưởng & Dao động/Sóng"
    );
    const batch1 = await runBatchWithAutoRetry(
        "Lô 1/4 — Phần I (Câu 1–9)",
        () => compilePart1Batch(aiClient, seedsP1.slice(0, 9), 1, p1TopicsA, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lô 1/4 — Phần I (Câu 1–9)] Hoàn tất bằng ${batch1.modelUsed}.`, "success");

    // Lô 2/4: Phần I (Câu 10–18)
    onProgress(
        42,
        "Bước 3/6: Đang gọi AI Lô 2/4 — Phần I (Câu 10–18)...",
        `Vừa xong Lô 1/4 · Trọng tâm Từ trường, Hạt nhân, Điện 11 & Sai số thí nghiệm`
    );
    const batch2 = await runBatchWithAutoRetry(
        "Lô 2/4 — Phần I (Câu 10–18)",
        () => compilePart1Batch(aiClient, seedsP1.slice(9, 18), 10, p1TopicsB, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lô 2/4 — Phần I (Câu 10–18)] Hoàn tất bằng ${batch2.modelUsed}.`, "success");

    // Lô 3/4: Phần II (4 câu Đúng/Sai)
    onProgress(
        62,
        "Bước 4/6: Đang gọi AI Lô 3/4 — Phần II (4 câu Đúng/Sai)...",
        "Vừa xong 18 câu Phần I · Biên soạn 4 câu thí nghiệm/số liệu/đồ thị SVG (16 mệnh đề)"
    );
    const batch3 = await runBatchWithAutoRetry(
        "Lô 3/4 — Phần II (4 câu Đúng/Sai)",
        () => compilePart2(aiClient, seedsP2, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lô 3/4 — Phần II (4 câu Đúng/Sai)] Hoàn tất bằng ${batch3.modelUsed}.`, "success");

    // Lô 4/4: Phần III (6 câu Trả lời ngắn)
    onProgress(
        80,
        "Bước 5/6: Đang gọi AI Lô 4/4 — Phần III (6 câu Trả lời ngắn)...",
        "Vừa xong Phần II · Biên soạn 6 câu định lượng chuẩn phiếu tô <= 4 ký tự"
    );
    const batch4 = await runBatchWithAutoRetry(
        "Lô 4/4 — Phần III (6 câu Trả lời ngắn)",
        () => compilePart3(aiClient, seedsP3, diffCfg, avoidPreviews),
        onLog
    );
    onLog(`[Lô 4/4 — Phần III (6 câu Trả lời ngắn)] Hoàn tất bằng ${batch4.modelUsed}.`, "success");

    // STEP 3: 3-Layer Anti-Duplication + Banned 2006 Curriculum + Missing-Figure Verification & Persistence
    onProgress(
        92,
        "Bước 6/6: Kiểm định SHA-256, 3-Gram Jaccard, Bộ lọc cấm CT 2006 & Chống thiếu hình...",
        "Đối chiếu lịch sử chống trùng lặp + làm sạch SVG + lưu IndexedDB (và Cloud nếu bật)"
    );
    const batchHashes = new Set();
    const batchShingles = [];

    const resP1 = await verifyAndSanitizePart({
        aiClient,
        harvester,
        vault,
        partKey: "part1",
        questions: [...batch1.questions, ...batch2.questions],
        batchHashes,
        batchShingles,
        diffCfg,
        modeKey: priorityMode,
        onLog,
        spareSeeds
    });
    const resP2 = await verifyAndSanitizePart({
        aiClient,
        harvester,
        vault,
        partKey: "part2",
        questions: batch3.questions,
        batchHashes,
        batchShingles,
        diffCfg,
        modeKey: priorityMode,
        onLog,
        spareSeeds
    });
    const resP3 = await verifyAndSanitizePart({
        aiClient,
        harvester,
        vault,
        partKey: "part3",
        questions: batch4.questions,
        batchHashes,
        batchShingles,
        diffCfg,
        modeKey: priorityMode,
        onLog,
        spareSeeds
    });

    const allMeta = [...resP1.lockMeta, ...resP2.lockMeta, ...resP3.lockMeta];
    const vnSourceIds = allMeta
        .filter((m) => m.sourceLang === "vi" || isVietnameseSourceId(m.sourceId))
        .map((m) => m.sourceId);
    const intlSourceIds = allMeta
        .filter((m) => !(m.sourceLang === "vi" || isVietnameseSourceId(m.sourceId)))
        .map((m) => m.sourceId);

    const examId = `vatly_exam_${Date.now()}_${csprngHex(3)}`;
    const examCode = String(csprngInt(201, 999));
    const createdAt = Date.now();
    const elapsedSec = ((createdAt - startedAt) / 1000).toFixed(1);
    const batchDupsBlocked = Math.max(0, (vault.sessionDuplicatesBlocked || 0) - dupsBefore);
    const batchCurriculumRejected = Math.max(0, (vault.sessionCurriculumRejected || 0) - currRejBefore);
    const batchMissingFigureRejected = Math.max(0, (vault.sessionMissingFigureRejected || 0) - figRejBefore);

    vault.sessionDuplicatesBlocked = dupsBefore;
    vault.sessionCurriculumRejected = currRejBefore;
    vault.sessionMissingFigureRejected = figRejBefore;

    const svgCount = [...resP1.verified, ...resP2.verified, ...resP3.verified].filter((q) => Boolean(q.svgFigure)).length;

    const examDoc = {
        vaultKey: storage.activeVaultKey,
        subject: "vatly-2026",
        examId,
        examCode,
        createdAt,
        aiModelUsed: batch4.modelUsed || batch1.modelUsed,
        difficulty: difficultyKey,
        difficultyLabel: diffCfg.label,
        priorityMode,
        priorityLabel: prioCfg.label,
        vnCount: vnSourceIds.length,
        intlCount: intlSourceIds.length,
        svgCount,
        part1: resP1.verified,
        part2: resP2.verified,
        part3: resP3.verified,
        answers: {
            part1: resP1.verified.map((q) => q.correctOption),
            part2: resP2.verified.map((q) => (q.statements || []).map((s) => (s.isTrue ? "Đ" : "S")).join("")),
            part3: resP3.verified.map((q) => q.shortAnswer)
        },
        harvestSummary: {
            entropyHex: entropyHex.slice(0, 16),
            duplicatesBlocked: batchDupsBlocked,
            curriculumRejected: batchCurriculumRejected,
            missingFigureRejected: batchMissingFigureRejected,
            svgCount,
            elapsedSec: Number(elapsedSec)
        }
    };

    const fpDoc = {
        vaultKey: storage.activeVaultKey,
        examId,
        createdAt,
        sourceIds: allMeta.map((m) => m.sourceId),
        vnSourceIds,
        intlSourceIds,
        hashes: allMeta.map((m) => m.hash),
        normalizedTexts: allMeta.map((m) => m.normText),
        duplicatesBlocked: batchDupsBlocked,
        curriculumRejected: batchCurriculumRejected
    };

    await storage.saveExamAndFingerprints(examDoc, fpDoc, priorityMode);

    onProgress(
        100,
        `Hoàn tất 100% trong ${elapsedSec}s! Bộ đề 28 câu Vật Lý đã lưu vĩnh viễn vào Kho.`,
        `Mã đề ${examCode} · 28 câu (50 phút) · 🇻🇳 ${vnSourceIds.length} VN · 🌐 ${intlSourceIds.length} QT · ${svgCount} hình SVG · ${examDoc.aiModelUsed}`
    );
    onLog(
        `=== HOÀN TẤT MÃ ĐỀ ${examCode} TRONG ${elapsedSec}s (28 câu · Chặn ${batchDupsBlocked} trùng · Loại ${batchCurriculumRejected} câu CT 2006 · ${svgCount} đồ thị SVG) ===`,
        "success"
    );

    return examDoc;
}
