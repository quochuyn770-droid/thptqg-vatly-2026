import {
    VN_HF_DATASETS,
    INTL_HF_DATASETS,
    PSE_TAGS_BY_PART,
    SOURCE_PRIORITY_CONFIG
} from "./config.js";
import {
    csprngHex,
    csprngInt,
    csprngSample,
    containsBanned2006Physics,
    detectMissingFigureReference
} from "./crypto-dedup.js";

/**
 * 8 Verified Open Physics Sources Harvester (4 VN HuggingFace + 4 International)
 * Routes requests through /api/harvest on the server when available to eliminate browser CORS issues!
 */

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
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

function stripHtmlToPlainPhysics(htmlStr) {
    if (typeof document !== "undefined") {
        const tmp = document.createElement("div");
        tmp.innerHTML = String(htmlStr || "");
        return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
    }
    return String(htmlStr || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatChoicesHint(rowObj) {
    if (Array.isArray(rowObj.choices) && rowObj.choices.length > 0) {
        return rowObj.choices.map((c) => String(c || "").trim()).filter(Boolean).join(" | ");
    }
    if (Array.isArray(rowObj.options) && rowObj.options.length > 0) {
        return rowObj.options.map((c) => String(c || "").trim()).filter(Boolean).join(" | ");
    }
    if (typeof rowObj.vi_choices === "string" && rowObj.vi_choices.trim()) {
        return rowObj.vi_choices.trim();
    }
    const opts = [rowObj.option_a, rowObj.option_b, rowObj.option_c, rowObj.option_d]
        .filter((x) => typeof x === "string" && x.trim())
        .map((x, i) => `${["A", "B", "C", "D"][i]}. ${x.trim()}`);
    if (opts.length > 0) return opts.join(" | ");
    return "";
}

/**
 * Normalizes row records from all 7 verified HuggingFace Physics datasets:
 * - tridm/VMLU: { id, question, choices, answer }
 * - chiayewken/m3exam: { question_text, background, options, answer_text, subject }
 * - alexandrainst/m_mmlu: { instruction, option_a..d, answer, id }
 * - Intelligent-Internet/Vietnamese-Entrance-Exam: { vi_problem, vi_choices, problem, answer, domain }
 * - cais/mmlu: { question, subject, choices, answer }
 * - allenai/sciq: { question, correct_answer, distractor1..3, support }
 */
export function extractProblemFromHfRow(rowObj) {
    if (!rowObj || typeof rowObj !== "object") return null;

    let qText = "";
    let aHint = "";

    const direct =
        rowObj.vi_problem ||
        rowObj.question_text ||
        rowObj.question ||
        rowObj.instruction ||
        rowObj.problem ||
        rowObj.prompt ||
        "";

    if (typeof direct === "string" && direct.trim()) {
        qText = direct.trim();
        if (typeof rowObj.background === "string" && rowObj.background.trim()) {
            qText = `${rowObj.background.trim()}\n${qText}`;
        }
        if (typeof rowObj.input === "string" && rowObj.input.trim()) {
            qText += `\n${rowObj.input.trim()}`;
        }
    }

    if (!qText && Array.isArray(rowObj.messages)) {
        const u = rowObj.messages.find((m) => m && (m.role === "user" || m.role === "human"));
        const a = rowObj.messages.find((m) => m && (m.role === "assistant" || m.role === "gpt" || m.role === "model"));
        if (u && typeof u.content === "string") qText = u.content.trim();
        if (a && typeof a.content === "string") aHint = a.content.trim();
    }

    if (!qText || qText.length < 18) return null;

    const choicesText = formatChoicesHint(rowObj);
    const ansRaw = rowObj.correct_answer ?? rowObj.answer_text ?? rowObj.answer;
    const ansStr = ansRaw !== null && ansRaw !== undefined && String(ansRaw).trim() !== ""
        ? `Đáp án gốc: ${String(ansRaw).trim()}`
        : "";
    const supportStr = typeof rowObj.support === "string" && rowObj.support.trim()
        ? rowObj.support.trim().slice(0, 220)
        : (typeof rowObj.explanation === "string" && rowObj.explanation.trim() ? rowObj.explanation.trim().slice(0, 220) : "");

    if (!aHint) {
        aHint = [choicesText ? `Phương án: ${choicesText.slice(0, 220)}` : "", ansStr, supportStr]
            .filter(Boolean)
            .join(" | ");
    }

    return {
        questionOnly: qText,
        combinedText: aHint
            ? `${qText.slice(0, 520)} | [Tham khảo: ${aHint.slice(0, 260)}]`
            : qText.slice(0, 680),
        tag: String(rowObj.subject || rowObj.domain || rowObj.id || "physics")
    };
}

export class PhysicsSourceHarvester {
    constructor({ vault, aiClient, onLog, onStatsChanged }) {
        this.vault = vault;
        this.aiClient = aiClient;
        this.onLog = typeof onLog === "function" ? onLog : () => {};
        this.onStatsChanged = typeof onStatsChanged === "function" ? onStatsChanged : () => {};
        this.hfMetaCache = new Map();
        this.unavailableDatasets = new Set();
    }

    /**
     * Prefers server-side /api/harvest proxy when backend is online to avoid browser CORS failures;
     * falls back cleanly to direct browser fetch when running as a static HTML site.
     */
    async smartFetch(url, timeoutMs = 8000) {
        const proxyAvailable = Boolean(this.aiClient?.serverHealth?.proxyAvailable);
        if (proxyAvailable) {
            try {
                const proxyRes = await fetchWithTimeout(
                    `/api/harvest?url=${encodeURIComponent(url)}`,
                    {},
                    timeoutMs + 2000
                );
                if (proxyRes.ok || proxyRes.status === 401 || proxyRes.status === 403 || proxyRes.status === 404) {
                    return proxyRes;
                }
            } catch {
                // Fallback to direct fetch below if local proxy hiccups
            }
        }

        const res = await fetchWithTimeout(url, {}, timeoutMs);
        if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
            return res;
        }
        return res;
    }

    getDatasetCacheKey(dsConfig) {
        return dsConfig.idKey || `${dsConfig.name}:${dsConfig.fallbackConfig || "default"}:${dsConfig.fallbackSplit || "train"}`;
    }

    getKnownHfMeta(dsConfig) {
        const key = this.getDatasetCacheKey(dsConfig);
        if (this.hfMetaCache.has(key)) {
            return this.hfMetaCache.get(key);
        }
        return {
            config: dsConfig.fallbackConfig || "default",
            split: dsConfig.fallbackSplit || "train",
            numRows: dsConfig.fallbackRows || 150
        };
    }

    async harvestSingleHfDataset(dsConfig, neededCount) {
        const collected = [];
        const flag = dsConfig.sourceLang === "vi" ? "🇻🇳" : "🌐";
        const cacheKey = this.getDatasetCacheKey(dsConfig);

        if (this.unavailableDatasets.has(cacheKey)) {
            return collected;
        }

        const meta = this.getKnownHfMeta(dsConfig);
        const length = Math.min(35, Math.max(12, neededCount * 2));
        const maxOffset = Math.max(0, meta.numRows - length);
        const offset = csprngInt(0, maxOffset);

        const url = dsConfig.filterWhere
            ? `https://datasets-server.huggingface.co/filter?dataset=${encodeURIComponent(dsConfig.name)}&config=${encodeURIComponent(meta.config)}&split=${encodeURIComponent(meta.split)}&where=${encodeURIComponent(dsConfig.filterWhere)}&offset=${offset}&length=${length}`
            : `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dsConfig.name)}&config=${encodeURIComponent(meta.config)}&split=${encodeURIComponent(meta.split)}&offset=${offset}&length=${length}`;

        this.onLog(`[${flag} HF API] Đang kéo ${dsConfig.shortLabel} tại offset CSPRNG #${offset.toLocaleString("vi-VN")}...`, "info");

        try {
            const res = await this.smartFetch(url, 8500);

            if (res.status === 401 || res.status === 403 || res.status === 404) {
                this.unavailableDatasets.add(cacheKey);
                throw new Error(`HTTP ${res.status}`);
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (typeof data.num_rows_total === "number" && data.num_rows_total > 0) {
                this.hfMetaCache.set(cacheKey, { ...meta, numRows: data.num_rows_total });
            }

            const serverFigFiltered = Number(data.filteredMissingFigures || 0);
            if (serverFigFiltered > 0) {
                this.vault.sessionMissingFigureRejected = (this.vault.sessionMissingFigureRejected || 0) + serverFigFiltered;
            }

            const rows = Array.isArray(data.rows) ? csprngSample(data.rows, data.rows.length) : [];
            let dupSkip = 0;
            let banned2006Skip = 0;
            let figSkip = serverFigFiltered;

            for (const item of rows) {
                const rowIdx = item.row_idx ?? offset + collected.length;
                const sourceId = `${cacheKey}:row_${rowIdx}`;
                if (this.vault.sourceIds.has(sourceId)) {
                    dupSkip++;
                    this.vault.sessionDuplicatesBlocked++;
                    continue;
                }

                const extracted = extractProblemFromHfRow(item.row);
                if (!extracted) continue;

                if (containsBanned2006Physics(extracted.combinedText)) {
                    banned2006Skip++;
                    this.vault.sessionCurriculumRejected = (this.vault.sessionCurriculumRejected || 0) + 1;
                    continue;
                }

                // Layer 1 strict seed filter: reject any record referencing missing figures/graphs/diagrams/images
                if (!detectMissingFigureReference(extracted.combinedText, "", { strictSeed: true }).ok) {
                    figSkip++;
                    this.vault.sessionMissingFigureRejected = (this.vault.sessionMissingFigureRejected || 0) + 1;
                    continue;
                }

                collected.push({
                    sourceId,
                    sourceLabel: `${dsConfig.shortLabel} #${rowIdx}`,
                    sourceUrl: `https://huggingface.co/datasets/${dsConfig.name}`,
                    sourceLang: dsConfig.sourceLang,
                    tag: extracted.tag,
                    rawContent: extracted.combinedText
                });
                if (collected.length >= neededCount) break;
            }

            this.onLog(
                `[${flag} ${dsConfig.shortLabel}] Nhận ${collected.length} câu mới (chặn ${dupSkip} trùng, loại ${banned2006Skip} câu CT 2006, lọc ${figSkip} câu thiếu hình).`,
                collected.length > 0 ? "success" : "warn"
            );
            return collected;
        } catch (err) {
            this.onLog(`[${flag} ${dsConfig.shortLabel}] Tạm bỏ qua (${err.message}), tự chuyển nguồn khác.`, "warn");
            return collected;
        }
    }

    async harvestPhysicsStackExchange(tags, neededCount) {
        if (neededCount <= 0) return [];
        const collected = [];
        const chosenTags = csprngSample(tags, neededCount > 5 ? 2 : 1);
        const nowSec = Math.floor(Date.now() / 1000);
        const minSec = 1388534400; // 2014-01-01
        const bannedSeTags = ["bohr-model", "rlc-circuits", "lc-circuits", "fresnel-diffraction", "special-relativity"];

        const tagResults = await Promise.all(
            chosenTags.map(async (tag) => {
                const page = csprngInt(1, 15);
                const startDate = csprngInt(minSec, nowSec - 180 * 86400);
                const endDate = Math.min(nowSec, startDate + csprngInt(180, 900) * 86400);
                const url = `https://api.stackexchange.com/2.3/questions?page=${page}&pagesize=15&order=desc&sort=votes&tagged=${encodeURIComponent(tag)}&site=physics&filter=withbody&fromdate=${startDate}&todate=${endDate}`;
                this.onLog(`[🌐 Physics SE] Kéo tag "${tag}" (trang #${page}, CSPRNG)...`, "info");

                const batch = [];
                try {
                    const res = await this.smartFetch(url, 7500);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    const serverFigFiltered = Number(data.filteredMissingFigures || 0);
                    if (serverFigFiltered > 0) {
                        this.vault.sessionMissingFigureRejected = (this.vault.sessionMissingFigureRejected || 0) + serverFigFiltered;
                    }
                    const items = Array.isArray(data.items) ? data.items : [];
                    let dupSkip = 0;
                    let banned2006Skip = 0;
                    let figSkip = serverFigFiltered;

                    for (const q of items) {
                        const sourceId = `PSE:${q.question_id}`;
                        if (this.vault.sourceIds.has(sourceId)) {
                            dupSkip++;
                            this.vault.sessionDuplicatesBlocked++;
                            continue;
                        }
                        const rawHtmlBody = String(q.body || "");
                        const bodyPlain = stripHtmlToPlainPhysics(rawHtmlBody);
                        if (bodyPlain.length < 30) continue;

                        const rawCheck = `${q.title || ""}\n${rawHtmlBody}`;
                        const fullCheck = `${q.title || ""} ${bodyPlain}`;
                        const hasBannedTag = Array.isArray(q.tags) && q.tags.some((t) => bannedSeTags.includes(t));
                        if (hasBannedTag || containsBanned2006Physics(fullCheck)) {
                            banned2006Skip++;
                            this.vault.sessionCurriculumRejected = (this.vault.sessionCurriculumRejected || 0) + 1;
                            continue;
                        }
                        // Layer 1 strict seed filter: catch <img tags in raw HTML and English figure/diagram references
                        if (
                            !detectMissingFigureReference(rawCheck, "", { strictSeed: true }).ok ||
                            !detectMissingFigureReference(fullCheck, "", { strictSeed: true }).ok
                        ) {
                            figSkip++;
                            this.vault.sessionMissingFigureRejected = (this.vault.sessionMissingFigureRejected || 0) + 1;
                            continue;
                        }
                        batch.push({
                            sourceId,
                            sourceLabel: `Physics SE #${q.question_id}`,
                            sourceUrl: q.link || `https://physics.stackexchange.com/q/${q.question_id}`,
                            sourceLang: "en",
                            tag,
                            rawContent: `${q.title || ""}. ${bodyPlain.slice(0, 560)}`
                        });
                        if (batch.length >= neededCount) break;
                    }
                    this.onLog(
                        `[🌐 Physics SE] Tag "${tag}": lấy ${batch.length} câu (chặn ${dupSkip} trùng, loại ${banned2006Skip} câu CT 2006, lọc ${figSkip} câu thiếu hình).`,
                        "success"
                    );
                } catch (err) {
                    this.onLog(`[🌐 Physics SE] Tag "${tag}" tạm giới hạn (${err.message}).`, "warn");
                }
                return batch;
            })
        );

        for (const list of tagResults) {
            for (const item of list) {
                collected.push(item);
                if (collected.length >= neededCount) return collected;
            }
        }
        return collected;
    }

    async harvestVietnameseSources(neededCount) {
        if (neededCount <= 0) return [];
        const available = VN_HF_DATASETS.filter((ds) => !this.unavailableDatasets.has(this.getDatasetCacheKey(ds)));
        const datasets = csprngSample(
            available.length > 0 ? available : VN_HF_DATASETS,
            available.length || VN_HF_DATASETS.length
        );
        const perDs = Math.max(5, Math.ceil((neededCount + 8) / Math.max(1, datasets.length)));
        const results = await Promise.all(datasets.map((ds) => this.harvestSingleHfDataset(ds, perDs)));
        return csprngSample(results.flat(), neededCount + 10);
    }

    async harvestInternationalSources(partKey, neededCount) {
        if (neededCount <= 0) return [];
        const tags = PSE_TAGS_BY_PART[partKey] || PSE_TAGS_BY_PART.part1;
        const pseNeed = Math.max(3, Math.ceil(neededCount * 0.4));
        const hfNeed = Math.max(3, neededCount - pseNeed + 3);
        const availableHf = INTL_HF_DATASETS.filter((ds) => !this.unavailableDatasets.has(this.getDatasetCacheKey(ds)));
        const poolHf = availableHf.length > 0 ? availableHf : INTL_HF_DATASETS;
        const pickedHf = csprngSample(poolHf, Math.min(3, poolHf.length));
        const [pseList, ...hfLists] = await Promise.all([
            this.harvestPhysicsStackExchange(tags, pseNeed),
            ...pickedHf.map((ds) => this.harvestSingleHfDataset(ds, Math.ceil(hfNeed / Math.max(1, pickedHf.length)) + 2))
        ]);
        return csprngSample([...pseList, ...hfLists.flat()], neededCount + 10);
    }

    buildInstantCsprngFallbackSeeds(partKey, neededCount, preferVi) {
        const topicsByPart = {
            part1: [
                "nội năng và định luật I nhiệt động lực học (ΔU = A + Q)",
                "nhiệt dung riêng, nhiệt nóng chảy riêng và nhiệt hóa hơi riêng",
                "định luật Boyle, Charles và phương trình trạng thái khí lí tưởng",
                "áp suất khí theo mô hình động học phân tử và động năng tịnh tiến trung bình",
                "lực từ tác dụng lên dây dẫn mang dòng điện F = BIL sin α",
                "từ thông, cảm ứng điện từ Faraday - Lenz và đại cương dòng xoay chiều",
                "độ hụt khối, năng lượng liên kết riêng, phản ứng hạt nhân và phóng xạ",
                "dao động điều hòa, sóng cơ, giao thoa Y-âng hoặc sóng dừng (Lớp 11)",
                "điện trường, tụ điện, định luật Ohm toàn mạch và sai số phép đo thí nghiệm"
            ],
            part2: [
                "thí nghiệm đo nhiệt dung riêng / nhiệt nóng chảy riêng kèm bảng số liệu",
                "chu trình biến đổi trạng thái khí lí tưởng kèm đồ thị p-V hoặc bảng số liệu",
                "thí nghiệm cảm ứng điện từ / khung dây quay tạo suất điện động xoay chiều",
                "ứng dụng đồng vị phóng xạ trong y học / phản ứng hạt nhân kèm số liệu thực tế"
            ],
            part3: [
                "cân bằng nhiệt kèm chuyển thể (nhiệt nóng chảy / nhiệt hóa hơi riêng)",
                "biến đổi trạng thái khí lí tưởng (áp suất, thể tích, số mol)",
                "lực từ cân bằng thanh dẫn hoặc suất điện động cảm ứng Faraday",
                "tính độ phóng xạ, khối lượng chất phóng xạ còn lại hoặc năng lượng phản ứng hạt nhân",
                "giao thoa sóng cơ / giao thoa ánh sáng Y-âng / sóng dừng (Lớp 11)",
                "tính sai số thí nghiệm hoặc công suất nguồn điện không đổi (Lớp 10–11)"
            ]
        };
        const topicPool = topicsByPart[partKey] || topicsByPart.part1;
        return Array.from({ length: neededCount }, (_, i) => {
            const uid = csprngHex(4);
            const topic = topicPool[i % topicPool.length];
            return {
                sourceId: `${preferVi ? "vn" : "csprng"}:physics_seed_${partKey}_${uid}`,
                sourceLabel: `CSPRNG #${uid}`,
                sourceUrl: "",
                sourceLang: preferVi ? "vi" : "en",
                tag: partKey,
                rawContent: `Biên soạn bài toán Vật Lý THPT chuẩn GDPT 2018 (0% RLC/Fresnel/LC/Bo) mới hoàn toàn về chủ đề ${topic}, hạt giống entropy ${uid}.`
            };
        });
    }

    /**
     * Unified 1-pass seed harvester for an entire 28-question Physics exam
     * (Part I: 18, Part II: 4, Part III: 6 + spares).
     */
    async harvestAllExamSeeds(modeKey = "vn_priority") {
        const cfg = SOURCE_PRIORITY_CONFIG[modeKey] || SOURCE_PRIORITY_CONFIG.vn_priority;
        const totalNeeded = 28;
        const spareTarget = 8;
        const fetchTotal = totalNeeded + spareTarget;
        const vnTargetTotal = Math.round(fetchTotal * cfg.vnRatio);
        const intlTargetTotal = fetchTotal - vnTargetTotal;

        this.onLog(
            `[Gom nguồn 1 lượt] Chế độ ${cfg.label} → Gom song song qua /api/harvest từ 8 kho Vật Lý mở cho 28 câu (+dự phòng)...`,
            "info"
        );

        const [vnRaw, intlRaw] = await Promise.all([
            vnTargetTotal > 0 ? this.harvestVietnameseSources(vnTargetTotal) : Promise.resolve([]),
            intlTargetTotal > 0 ? this.harvestInternationalSources("part1", intlTargetTotal) : Promise.resolve([])
        ]);

        const usedBatchIds = new Set();
        const dedupe = (arr) =>
            arr.filter((s) => {
                if (!s || usedBatchIds.has(s.sourceId) || this.vault.sourceIds.has(s.sourceId)) return false;
                usedBatchIds.add(s.sourceId);
                return true;
            });

        const cleanVn = dedupe(vnRaw);
        const cleanIntl = dedupe(intlRaw);

        const takeForPart = (partKey, count) => {
            const vnWant = Math.round(count * cfg.vnRatio);
            const intlWant = count - vnWant;
            const picked = [];

            picked.push(...cleanVn.splice(0, vnWant));
            picked.push(...cleanIntl.splice(0, intlWant));

            if (picked.length < count) {
                const remain = count - picked.length;
                if (cfg.vnRatio >= 0.5) {
                    picked.push(...cleanVn.splice(0, remain));
                    if (picked.length < count) picked.push(...cleanIntl.splice(0, count - picked.length));
                } else {
                    picked.push(...cleanIntl.splice(0, remain));
                    if (picked.length < count) picked.push(...cleanVn.splice(0, count - picked.length));
                }
            }

            if (picked.length < count) {
                picked.push(...this.buildInstantCsprngFallbackSeeds(partKey, count - picked.length, modeKey !== "intl_only"));
            }

            return csprngSample(picked, count);
        };

        const part1 = takeForPart("part1", 18);
        const part2 = takeForPart("part2", 4);
        const part3 = takeForPart("part3", 6);
        const spare = csprngSample([...cleanVn, ...cleanIntl], Math.min(10, cleanVn.length + cleanIntl.length));

        const allPicked = [...part1, ...part2, ...part3];
        const vnActual = allPicked.filter((s) => s.sourceLang === "vi").length;
        this.onLog(
            `[Hoàn tất gom nguồn] Đủ 28 hạt giống (🇻🇳 ${vnActual} VN · 🌐 ${28 - vnActual} QT · +${spare.length} dự phòng).`,
            "success"
        );
        this.onStatsChanged();
        return { part1, part2, part3, spare };
    }

    async harvestSeedsForPart(partKey, targetCount, modeKey = "vn_priority") {
        const cfg = SOURCE_PRIORITY_CONFIG[modeKey] || SOURCE_PRIORITY_CONFIG.vn_priority;
        const vnTarget = Math.round(targetCount * cfg.vnRatio);
        const intlTarget = targetCount - vnTarget;

        const [vnList, intlList] = await Promise.all([
            vnTarget > 0 ? this.harvestVietnameseSources(vnTarget) : Promise.resolve([]),
            intlTarget > 0 ? this.harvestInternationalSources(partKey, intlTarget) : Promise.resolve([])
        ]);

        const usedBatchIds = new Set();
        const dedupe = (arr) =>
            arr.filter((s) => {
                if (!s || usedBatchIds.has(s.sourceId) || this.vault.sourceIds.has(s.sourceId)) return false;
                usedBatchIds.add(s.sourceId);
                return true;
            });

        const cleanVn = dedupe(vnList);
        const cleanIntl = dedupe(intlList);

        let combined = [
            ...cleanVn.slice(0, vnTarget),
            ...cleanIntl.slice(0, intlTarget)
        ];

        if (combined.length < targetCount) {
            const surplus = [...cleanVn.slice(vnTarget), ...cleanIntl.slice(intlTarget)];
            combined = [...combined, ...surplus.slice(0, targetCount - combined.length)];
        }

        if (combined.length < targetCount) {
            combined = [...combined, ...this.buildInstantCsprngFallbackSeeds(partKey, targetCount - combined.length, modeKey !== "intl_only")];
        }

        return csprngSample(combined, targetCount);
    }
}
