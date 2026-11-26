import { AI_PROVIDERS, DEFAULT_VAULT_KEY, PHYSICS_CONSTANTS, STORAGE_KEYS } from "./config.js";
import { isVietnameseSourceId, sanitizeInlineSvg } from "./crypto-dedup.js";
import { UnifiedAiClient } from "./ai-client.js";
import { VaultStorageManager, parseFirebaseConfigInput } from "./storage.js";
import { PhysicsSourceHarvester } from "./harvester.js";
import { runFullExamPipeline } from "./exam-pipeline.js";
import {
    buildConstantsLatex,
    formatSinglePart1Latex,
    formatSinglePart2Latex,
    formatSinglePart3Latex,
    buildPart1LatexSlice,
    buildPart2Latex,
    buildPart3Latex,
    buildAnswersLatex,
    buildFullTexDocument
} from "./latex-export.js";

// =========================================================================
// 1. DOM REFERENCES & UI STATE
// =========================================================================

const $ = (id) => document.getElementById(id);

const dom = {
    // Header
    btnOpenAiTop: $("btnOpenAiTop"),
    topAiDot: $("topAiDot"),
    topAiLabel: $("topAiLabel"),
    btnOpenVaultTop: $("btnOpenVaultTop"),
    topStorageDot: $("topStorageDot"),
    topVaultLabel: $("topVaultLabel"),
    btnJumpHistory: $("btnJumpHistory"),
    topSavedCountBadge: $("topSavedCountBadge"),
    btnToggleTheme: $("btnToggleTheme"),
    iconSun: $("iconSun"),
    iconMoon: $("iconMoon"),

    // Status Strip
    stripDot: $("stripDot"),
    stripText: $("stripText"),
    btnSyncCloud: $("btnSyncCloud"),
    btnOpenVaultBar: $("btnOpenVaultBar"),
    btnQuickExportJson: $("btnQuickExportJson"),
    quickImportFileInput: $("quickImportFileInput"),
    cloudErrorBanner: $("cloudErrorBanner"),
    cloudErrorText: $("cloudErrorText"),
    btnDismissCloudError: $("btnDismissCloudError"),

    // Onboarding Callout
    aiSetupBanner: $("aiSetupBanner"),
    btnSetupAiNow: $("btnSetupAiNow"),

    // Harvester Hero
    sourcePrioritySelect: $("sourcePrioritySelect"),
    difficultySelect: $("difficultySelect"),
    heroAiSummary: $("heroAiSummary"),
    btnChangeAiHero: $("btnChangeAiHero"),
    btnGenerateExam: $("btnGenerateExam"),
    btnGenerateLabel: $("btnGenerateLabel"),
    iconGenerateIdle: $("iconGenerateIdle"),
    iconGenerateSpin: $("iconGenerateSpin"),

    progressContainer: $("progressContainer"),
    progressMessage: $("progressMessage"),
    progressPercent: $("progressPercent"),
    progressBarFill: $("progressBarFill"),
    progressBatchDetail: $("progressBatchDetail"),
    progressEntropyBadge: $("progressEntropyBadge"),

    btnToggleLog: $("btnToggleLog"),
    logPanel: $("logPanel"),
    logChevron: $("logChevron"),
    logCountBadge: $("logCountBadge"),

    // Stats
    statLockedHashes: $("statLockedHashes"),
    statVnSources: $("statVnSources"),
    statIntlSources: $("statIntlSources"),
    statBlockedDups: $("statBlockedDups"),
    statSavedExams: $("statSavedExams"),

    // History
    historySection: $("historySection"),
    btnToggleHistoryBody: $("btnToggleHistoryBody"),
    btnCollapseHistory: $("btnCollapseHistory"),
    historyChevron: $("historyChevron"),
    historyPanelBody: $("historyPanelBody"),
    historyPanelBadge: $("historyPanelBadge"),
    historyVaultKeyInline: $("historyVaultKeyInline"),
    historyListContainer: $("historyListContainer"),
    btnClearVaultFromHistory: $("btnClearVaultFromHistory"),

    // Welcome & Constants
    emptyStateSection: $("emptyStateSection"),
    welcomeConstantsPreview: $("welcomeConstantsPreview"),
    examConstantsGrid: $("examConstantsGrid"),
    btnCopyConstants: $("btnCopyConstants"),
    charConstants: $("charConstants"),

    // Exam Workspace
    examWorkspace: $("examWorkspace"),
    examCodeBadge: $("examCodeBadge"),
    examDiffBadge: $("examDiffBadge"),
    examMetaSub: $("examMetaSub"),
    btnPrintExam: $("btnPrintExam"),
    btnDownloadTex: $("btnDownloadTex"),

    btnCopyPart1First: $("btnCopyPart1First"),
    btnCopyPart1Second: $("btnCopyPart1Second"),
    btnCopyPart1All: $("btnCopyPart1All"),
    btnCopyPart2All: $("btnCopyPart2All"),
    btnCopyPart3All: $("btnCopyPart3All"),
    btnCopyAnswersAll: $("btnCopyAnswersAll"),
    btnToggleSolutions: $("btnToggleSolutions"),

    charPart1First: $("charPart1First"),
    charPart1Second: $("charPart1Second"),
    charPart1All: $("charPart1All"),
    charPart2All: $("charPart2All"),
    charPart3All: $("charPart3All"),
    charAnswersAll: $("charAnswersAll"),

    part1Container: $("part1Container"),
    part2Container: $("part2Container"),
    part3Container: $("part3Container"),
    answersContainer: $("answersContainer"),

    // AI Settings Modal
    aiSettingsModal: $("aiSettingsModal"),
    serverProxyBadge: $("serverProxyBadge"),
    serverProxyDesc: $("serverProxyDesc"),
    providerCardGrid: $("providerCardGrid"),
    presetModelGroup: $("presetModelGroup"),
    aiModelSelect: $("aiModelSelect"),
    aiCustomModelInput: $("aiCustomModelInput"),
    aiModelHint: $("aiModelHint"),
    customBaseUrlGroup: $("customBaseUrlGroup"),
    aiCustomBaseUrlInput: $("aiCustomBaseUrlInput"),
    aiKeyHelpLink: $("aiKeyHelpLink"),
    aiApiKeyInput: $("aiApiKeyInput"),
    btnToggleKeyVisibility: $("btnToggleKeyVisibility"),
    aiKeyNote: $("aiKeyNote"),
    geminiThinkingGroup: $("geminiThinkingGroup"),
    aiThinkingLevelSelect: $("aiThinkingLevelSelect"),
    chkAutoFallback: $("chkAutoFallback"),
    rowGoogleSearchToggle: $("rowGoogleSearchToggle"),
    chkGoogleSearchFallback: $("chkGoogleSearchFallback"),
    aiTestResultBox: $("aiTestResultBox"),
    btnTestAiConnection: $("btnTestAiConnection"),
    btnSaveAiSettings: $("btnSaveAiSettings"),

    // Vault Modal
    vaultModal: $("vaultModal"),
    modalStorageStatusBadge: $("modalStorageStatusBadge"),
    vaultKeyInput: $("vaultKeyInput"),
    btnApplyVaultKey: $("btnApplyVaultKey"),
    btnResetDefaultKey: $("btnResetDefaultKey"),
    btnCopyVaultKey: $("btnCopyVaultKey"),
    idbStatusLabel: $("idbStatusLabel"),
    modalFirebaseState: $("modalFirebaseState"),
    firebaseConfigInput: $("firebaseConfigInput"),
    btnConnectFirebase: $("btnConnectFirebase"),
    btnDisconnectFirebase: $("btnDisconnectFirebase"),
    btnModalExportJson: $("btnModalExportJson"),
    modalImportFileInput: $("modalImportFileInput"),
    btnOpenConfirmClearVault: $("btnOpenConfirmClearVault"),

    // Confirm Modal
    confirmModal: $("confirmModal"),
    confirmModalTitle: $("confirmModalTitle"),
    confirmModalBody: $("confirmModalBody"),
    btnConfirmCancel: $("btnConfirmCancel"),
    btnConfirmProceed: $("btnConfirmProceed"),

    // Toasts
    toastContainer: $("toastContainer")
};

const uiState = {
    viewMode: "both", // 'both' | 'latex' | 'katex'
    showSolutions: true,
    historyExpanded: true,
    isGenerating: false,
    currentExam: null,
    logs: [],
    pendingConfirmAction: null,
    modalDraftProvider: "gemini"
};

const STACKED_SHEETS_SVG = `<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

// =========================================================================
// 2. UI UTILITIES (ESCAPE, TOAST, LOG, CLIPBOARD, THEME, MODALS)
// =========================================================================

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDateTime(ts) {
    try {
        return new Date(ts).toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    } catch {
        return "";
    }
}

function formatCharCount(str) {
    return `${String(str || "").length.toLocaleString("vi-VN")} ký tự`;
}

function showToast(message, type = "info") {
    const colorMap = {
        info: "bg-slate-900 dark:bg-slate-800 text-white",
        success: "bg-emerald-600 text-white",
        warn: "bg-amber-600 text-white",
        error: "bg-rose-600 text-white"
    };
    const el = document.createElement("div");
    el.className = `toast-item px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg ${colorMap[type] || colorMap.info}`;
    el.textContent = message;
    dom.toastContainer.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(8px)";
        setTimeout(() => el.remove(), 220);
    }, 3800);
}

function addLog(message, level = "info") {
    const now = new Date().toLocaleTimeString("vi-VN", { hour12: false });
    const clsMap = {
        info: "text-sky-300",
        success: "text-emerald-300",
        warn: "text-amber-300",
        error: "text-rose-300"
    };
    const cls = clsMap[level] || clsMap.info;
    uiState.logs.push({ time: now, message, cls });
    if (uiState.logs.length > 240) uiState.logs.shift();

    dom.logCountBadge.textContent = `${uiState.logs.length} dòng`;
    if (uiState.logs.length === 1) dom.logPanel.innerHTML = "";

    const line = document.createElement("div");
    line.className = "flex gap-2";
    line.innerHTML = `<span class="text-slate-500 shrink-0">[${now}]</span><span class="${cls}">${escapeHtml(message)}</span>`;
    dom.logPanel.appendChild(line);
    dom.logPanel.scrollTop = dom.logPanel.scrollHeight;
}

function setProgress(percent, message, batchDetail = "") {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    dom.progressContainer.classList.remove("hidden");
    dom.progressPercent.textContent = `${clamped}%`;
    dom.progressBarFill.style.width = `${clamped}%`;
    if (message) dom.progressMessage.textContent = message;
    if (batchDetail) dom.progressBatchDetail.textContent = batchDetail;
}

function showCloudError(msg) {
    dom.cloudErrorText.textContent = `⚠️ ${msg}`;
    dom.cloudErrorBanner.classList.remove("hidden");
    addLog(`[Cloud] ${msg}`, "error");
}

function clearCloudError() {
    dom.cloudErrorBanner.classList.add("hidden");
}

async function copyTextToClipboard(text, label = "Nội dung") {
    const content = String(text || "");
    if (!content) {
        showToast("Không có nội dung để sao chép.", "warn");
        return false;
    }

    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
            await navigator.clipboard.writeText(content);
            copied = true;
        } catch {
            copied = false;
        }
    }

    if (!copied) {
        try {
            const ta = document.createElement("textarea");
            ta.value = content;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.top = "-9999px";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, content.length);
            copied = document.execCommand("copy");
            document.body.removeChild(ta);
        } catch {
            copied = false;
        }
    }

    if (copied) {
        showToast(`Đã sao chép ${label} (${formatCharCount(content)})`, "success");
    } else {
        showToast("Trình duyệt chặn tự động copy. Hãy chọn trực tiếp trong khung mã LaTeX.", "error");
    }
    return copied;
}

function syncThemeIcons() {
    const isDark = document.documentElement.classList.contains("dark");
    dom.iconSun.classList.toggle("hidden", !isDark);
    dom.iconMoon.classList.toggle("hidden", isDark);
}

function openModal(id) {
    const el = $(id);
    if (el) el.classList.remove("hidden");
}

function closeModal(id) {
    const el = $(id);
    if (el) el.classList.add("hidden");
}

function openConfirmDialog(title, body, proceedLabel, onProceed) {
    dom.confirmModalTitle.textContent = title;
    dom.confirmModalBody.textContent = body;
    dom.btnConfirmProceed.textContent = proceedLabel || "Xác nhận";
    uiState.pendingConfirmAction = onProceed;
    openModal("confirmModal");
}

function runKatexAutoRender(container) {
    if (!container || typeof window.renderMathInElement !== "function") return;
    try {
        window.renderMathInElement(container, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true }
            ],
            throwOnError: false,
            strict: false
        });
    } catch {
        // Keep raw LaTeX visible if formula has syntax edge case
    }
}

function renderPhysicalConstantsBoxes() {
    const chipsHtml = PHYSICS_CONSTANTS.map(
        (c) => `<span class="constants-chip" title="${escapeHtml(c.name)}">$${escapeHtml(c.latex)}$</span>`
    ).join("");

    if (dom.welcomeConstantsPreview) {
        dom.welcomeConstantsPreview.innerHTML = chipsHtml;
    }
    if (dom.examConstantsGrid) {
        dom.examConstantsGrid.innerHTML = chipsHtml;
    }
    if (dom.charConstants) {
        dom.charConstants.textContent = formatCharCount(buildConstantsLatex());
    }

    const renderNow = () => {
        if (dom.welcomeConstantsPreview) runKatexAutoRender(dom.welcomeConstantsPreview);
        if (dom.examConstantsGrid) runKatexAutoRender(dom.examConstantsGrid);
    };
    if (typeof window.renderMathInElement === "function") {
        renderNow();
    } else {
        window.addEventListener("load", renderNow, { once: true });
    }
}

// =========================================================================
// 3. CORE SERVICES (AI CLIENT, STORAGE MANAGER, HARVESTER)
// =========================================================================

const aiClient = new UnifiedAiClient({ onLog: addLog });

const storage = new VaultStorageManager({
    onChange: () => updateStorageAndHistoryUI(),
    onLog: addLog,
    onToast: showToast,
    onCloudError: showCloudError
});

const harvester = new PhysicsSourceHarvester({
    vault: storage.vault,
    aiClient,
    onLog: addLog,
    onStatsChanged: () => updateStorageAndHistoryUI()
});

// =========================================================================
// 4. AI SETTINGS UI & MODAL
// =========================================================================

function updateAiStatusBadges() {
    const info = aiClient.getConnectionModeLabel();
    const checkingServer = !info.ready && !aiClient.serverHealth.checked;
    dom.topAiDot.className = `w-2 h-2 rounded-full shrink-0 ${info.ready ? "bg-emerald-500" : "bg-amber-500"}`;
    dom.topAiLabel.textContent = info.ready ? info.label : (checkingServer ? "Đang kết nối AI..." : "Cài đặt AI");
    dom.heroAiSummary.textContent = info.ready
        ? `${info.label} (${info.detail})`
        : (checkingServer ? "Đang kiểm tra Server AI..." : "Chưa có API Key");
    dom.aiSetupBanner.classList.toggle("hidden", info.ready || checkingServer);
}

function renderServerProxyInfoInModal() {
    const h = aiClient.serverHealth;
    if (!h.proxyAvailable) {
        dom.serverProxyBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
        dom.serverProxyBadge.textContent = "Chế độ Static (Trình duyệt)";
        dom.serverProxyDesc.textContent =
            "Website đang chạy dạng tĩnh (không có backend /api/ai). Trình duyệt sẽ gọi trực tiếp API của Google Gemini / Groq / OpenRouter bằng API Key miễn phí bạn nhập bên dưới.";
        return;
    }

    const activeNames = Object.entries(h.configuredProviders || {})
        .filter(([, ok]) => ok)
        .map(([k]) => AI_PROVIDERS[k]?.shortLabel || k);

    if (activeNames.length > 0) {
        dom.serverProxyBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
        dom.serverProxyBadge.textContent = `Proxy sẵn sàng (${activeNames.join(", ")})`;
        dom.serverProxyDesc.textContent =
            `Máy chủ đã cấu hình sẵn API Key bảo mật cho: ${activeNames.join(", ")}. Bạn có thể tạo đề ngay mà không cần nhập Key, hoặc nhập Key riêng bên dưới nếu muốn ghi đè.`;
    } else {
        dom.serverProxyBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
        dom.serverProxyBadge.textContent = "Proxy online · Chưa đặt ENV Key";
        dom.serverProxyDesc.textContent =
            "Máy chủ proxy (/api/ai & /api/harvest) đang hoạt động nhưng chưa đặt biến môi trường API Key. Hãy nhập API Key miễn phí của bạn bên dưới (hoặc thêm GEMINI_API_KEY vào Vercel/Netlify để ẩn Key khi chia sẻ).";
    }
}

function renderAiProviderCards(selectedProvider) {
    dom.providerCardGrid.innerHTML = Object.values(AI_PROVIDERS)
        .map((p) => {
            const isActive = p.id === selectedProvider;
            const hasKey = Boolean(aiClient.getBrowserKey(p.id)) || aiClient.hasServerKeyFor(p.id);
            return `
                <button type="button" data-select-provider="${p.id}" class="provider-card ${isActive ? "active" : ""} p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 text-left flex flex-col gap-1 transition cursor-pointer">
                    <div class="flex items-center justify-between gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
                        <span>${escapeHtml(p.name)}</span>
                        ${hasKey ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Sẵn sàng</span>' : ""}
                    </div>
                    <span class="text-[11px] text-slate-500 dark:text-slate-400">${escapeHtml(p.badge)}</span>
                </button>
            `;
        })
        .join("");
}

function syncAiModalFieldsForProvider(providerId) {
    uiState.modalDraftProvider = providerId;
    const cfg = AI_PROVIDERS[providerId] || AI_PROVIDERS.gemini;
    renderAiProviderCards(providerId);

    const savedModel = aiClient.settings.models?.[providerId] || cfg.defaultModel;
    const isCustomProvider = providerId === "custom";

    dom.presetModelGroup.classList.toggle("hidden", isCustomProvider);
    dom.customBaseUrlGroup.classList.toggle("hidden", !isCustomProvider);
    dom.geminiThinkingGroup.classList.toggle("hidden", providerId !== "gemini");
    dom.rowGoogleSearchToggle.classList.toggle("hidden", providerId !== "gemini");

    if (!isCustomProvider) {
        dom.aiModelSelect.innerHTML = cfg.models
            .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`)
            .join("");

        const matchedPreset = cfg.models.find((m) => m.id === savedModel);
        if (matchedPreset) {
            dom.aiModelSelect.value = matchedPreset.id;
            dom.aiCustomModelInput.value = "";
            dom.aiModelHint.textContent = matchedPreset.hint;
        } else {
            dom.aiModelSelect.value = cfg.models[0]?.id || "";
            dom.aiCustomModelInput.value = savedModel;
            dom.aiModelHint.textContent = `Đang dùng Model ID tùy chỉnh: ${savedModel}`;
        }
    } else {
        dom.aiCustomModelInput.value = savedModel || "";
        dom.aiCustomBaseUrlInput.value = aiClient.settings.customBaseUrl || "";
        dom.aiModelHint.textContent = "Nhập Base URL chuẩn OpenAI (VD: https://api.cerebras.ai/v1 hoặc http://localhost:11434/v1) và tên model.";
    }

    dom.aiApiKeyInput.value = aiClient.settings.keys?.[providerId] || "";
    dom.aiApiKeyInput.placeholder = aiClient.hasServerKeyFor(providerId)
        ? "Đã có Key trên Server Proxy (để trống nếu muốn dùng Key server)"
        : cfg.keyPlaceholder;
    dom.aiApiKeyInput.type = "password";
    dom.btnToggleKeyVisibility.textContent = "Hiện";

    if (cfg.keyUrl) {
        dom.aiKeyHelpLink.href = cfg.keyUrl;
        dom.aiKeyHelpLink.textContent = `↗ ${cfg.keyUrlLabel}`;
        dom.aiKeyHelpLink.classList.remove("hidden");
    } else {
        dom.aiKeyHelpLink.classList.add("hidden");
    }

    dom.aiThinkingLevelSelect.value = aiClient.settings.thinkingLevel || "LOW";
    dom.chkAutoFallback.checked = aiClient.settings.autoFallback !== false;
    dom.chkGoogleSearchFallback.checked = aiClient.settings.useGoogleSearchFallback !== false;
    dom.aiTestResultBox.classList.add("hidden");
}

function collectAiSettingsFromModal() {
    const provider = uiState.modalDraftProvider;
    const customModel = dom.aiCustomModelInput.value.trim();
    const chosenModel =
        provider === "custom"
            ? customModel
            : customModel || dom.aiModelSelect.value || AI_PROVIDERS[provider]?.defaultModel || "";

    return {
        provider,
        models: { [provider]: chosenModel },
        keys: { [provider]: dom.aiApiKeyInput.value.trim() },
        customBaseUrl: provider === "custom" ? dom.aiCustomBaseUrlInput.value.trim() : aiClient.settings.customBaseUrl,
        thinkingLevel: dom.aiThinkingLevelSelect.value || "LOW",
        autoFallback: dom.chkAutoFallback.checked,
        useGoogleSearchFallback: dom.chkGoogleSearchFallback.checked
    };
}

function openAiSettingsModal() {
    renderServerProxyInfoInModal();
    syncAiModalFieldsForProvider(aiClient.getActiveProvider());
    openModal("aiSettingsModal");
}

// =========================================================================
// 5. STORAGE STATUS, STATS & PERSISTENT HISTORY UI
// =========================================================================

function updateStorageAndHistoryUI() {
    const v = storage.vault;
    const examCount = v.exams.size;
    const lockedCount = Math.max(v.hashes.size, v.sourceIds.size);
    const vnCount = v.vnSourceIds.size;
    const intlCount = v.intlSourceIds.size;
    const blockedTotal =
        (v.totalDuplicatesBlocked || 0) +
        (v.sessionDuplicatesBlocked || 0) +
        (v.totalCurriculumRejected || 0) +
        (v.sessionCurriculumRejected || 0) +
        (v.totalMissingFigureRejected || 0) +
        (v.sessionMissingFigureRejected || 0);
    const key = storage.activeVaultKey;

    dom.topVaultLabel.textContent = key;
    dom.historyVaultKeyInline.textContent = key;
    dom.vaultKeyInput.value = key;
    dom.topSavedCountBadge.textContent = String(examCount);
    dom.historyPanelBadge.textContent = `${examCount} đề`;

    dom.statLockedHashes.textContent = lockedCount.toLocaleString("vi-VN");
    dom.statVnSources.textContent = vnCount.toLocaleString("vi-VN");
    dom.statIntlSources.textContent = intlCount.toLocaleString("vi-VN");
    dom.statBlockedDups.textContent = blockedTotal.toLocaleString("vi-VN");
    dom.statSavedExams.textContent = examCount.toLocaleString("vi-VN");

    dom.idbStatusLabel.textContent = storage.idbReady
        ? `IndexedDB trình duyệt: Hoạt động ổn định (${examCount} đề trong Kho này)`
        : `IndexedDB: ${storage.idbError || "Không khả dụng"}`;

    const status = storage.storageStatus;
    if (status === "cloud_connected") {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.stripText.innerHTML = `☁️ Firebase Cloud Đã Kết Nối · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong> · Đã lưu <strong>${examCount} đề</strong>`;
        dom.modalStorageStatusBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
        dom.modalStorageStatusBadge.textContent = `☁️ Cloud + IndexedDB (${examCount} đề)`;
        dom.modalFirebaseState.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
        dom.modalFirebaseState.textContent = `Đã kết nối (${storage.firebaseConfig?.projectId || "Firebase"})`;
        dom.btnSyncCloud.classList.remove("hidden");
        dom.btnDisconnectFirebase.classList.remove("hidden");
    } else if (status === "cloud_connecting") {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-amber-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-amber-500 shrink-0";
        dom.stripText.innerHTML = `⏳ Đang kết nối Firebase Cloud · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong>`;
        dom.modalStorageStatusBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
        dom.modalStorageStatusBadge.textContent = "⏳ Đang kết nối Cloud...";
        dom.modalFirebaseState.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
        dom.modalFirebaseState.textContent = "Đang kết nối...";
        dom.btnSyncCloud.classList.remove("hidden");
        dom.btnDisconnectFirebase.classList.remove("hidden");
    } else if (status === "cloud_error") {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-rose-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-rose-500 shrink-0";
        dom.stripText.innerHTML = `⚠️ Gián đoạn Firebase Cloud (đã lưu cục bộ) · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong> · <strong>${examCount} đề</strong>`;
        dom.modalStorageStatusBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
        dom.modalStorageStatusBadge.textContent = `💾 Cục bộ (${examCount} đề)`;
        dom.modalFirebaseState.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
        dom.modalFirebaseState.textContent = "Lỗi kết nối";
        dom.btnSyncCloud.classList.remove("hidden");
        dom.btnDisconnectFirebase.classList.remove("hidden");
    } else {
        dom.stripDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.topStorageDot.className = "w-2 h-2 rounded-full bg-emerald-500 shrink-0";
        dom.stripText.innerHTML = `💾 Lưu cục bộ vĩnh viễn (IndexedDB) · Kho: <strong class="font-mono text-slate-900 dark:text-white">${escapeHtml(key)}</strong> · Đã lưu <strong>${examCount} đề</strong>`;
        dom.modalStorageStatusBadge.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
        dom.modalStorageStatusBadge.textContent = `💾 IndexedDB (${examCount} đề)`;
        dom.modalFirebaseState.className = "px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
        dom.modalFirebaseState.textContent = "Chưa bật (Tùy chọn)";
        dom.btnSyncCloud.classList.add("hidden");
        dom.btnDisconnectFirebase.classList.add("hidden");
    }

    renderPersistentHistoryList();
}

function renderPersistentHistoryList() {
    const sorted = Array.from(storage.vault.exams.values()).sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    if (sorted.length === 0) {
        dom.historyListContainer.innerHTML = `
            <div class="md:col-span-2 p-5 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                Chưa có đề nào trong Kho <strong class="font-mono text-slate-800 dark:text-slate-200">${escapeHtml(storage.activeVaultKey)}</strong>.
                Nhấn <strong>"Kéo Source &amp; Tạo Đề Vật Lý 2026"</strong> để tạo bộ đề 28 câu đầu tiên, hoặc bấm <strong>⬆ Nhập .json</strong> để khôi phục sao lưu.
            </div>
        `;
        return;
    }

    dom.historyListContainer.innerHTML = sorted
        .map((ex) => {
            const isActive = uiState.currentExam && uiState.currentExam.examId === ex.examId;
            const totalQs = (ex.part1?.length || 0) + (ex.part2?.length || 0) + (ex.part3?.length || 0);
            const vn = typeof ex.vnCount === "number" ? ex.vnCount : 0;
            const qt = typeof ex.intlCount === "number" ? ex.intlCount : Math.max(0, totalQs - vn);

            return `
                <div class="flex items-center justify-between gap-2.5 p-3 rounded-xl border transition ${
                    isActive
                        ? "bg-sky-50/90 dark:bg-sky-950/40 border-sky-400 dark:border-sky-700"
                        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600"
                }">
                    <button type="button" data-open-exam="${escapeHtml(ex.examId)}" class="flex-1 min-w-0 text-left cursor-pointer">
                        <div class="flex flex-wrap items-center gap-1.5 mb-1">
                            <span class="px-2 py-0.5 rounded-md bg-sky-600 text-white font-mono text-[11px] font-extrabold">MÃ ĐỀ ${escapeHtml(ex.examCode || "2026")}</span>
                            <span class="text-xs font-bold text-slate-900 dark:text-white">${escapeHtml(ex.difficultyLabel || "Chuẩn BGD 2026")}</span>
                            <span class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-semibold">${totalQs} câu</span>
                        </div>
                        <div class="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>🕒 ${formatDateTime(ex.createdAt)}</span>
                            <span class="text-emerald-700 dark:text-emerald-400 font-semibold">🇻🇳 ${vn} VN</span>
                            <span class="text-sky-700 dark:text-sky-400 font-semibold">🌐 ${qt} QT</span>
                            ${ex.aiModelUsed ? `<span class="font-mono truncate max-w-[160px]">${escapeHtml(ex.aiModelUsed)}</span>` : ""}
                        </div>
                    </button>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" data-open-exam="${escapeHtml(ex.examId)}" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isActive
                                ? "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                                : "bg-sky-600 hover:bg-sky-700 text-white"
                        }">
                            ${isActive ? "Đang xem" : "Mở đề"}
                        </button>
                        <button type="button" data-delete-exam="${escapeHtml(ex.examId)}" title="Xóa đề này" aria-label="Xóa Mã đề ${escapeHtml(ex.examCode || "")}" class="px-2 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 cursor-pointer">
                            ✕
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
}

// =========================================================================
// 6. EXAM WORKSPACE RENDERER (KATEX + INLINE SVG + LATEX + COPY BUTTONS)
// =========================================================================

function splitMarkdownTableRow(line) {
    let s = String(line || "").trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);

    const cells = [];
    let current = "";
    let inMath = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        const prev = i > 0 ? s[i - 1] : "";
        if (ch === "$" && prev !== "\\") {
            inMath = !inMath;
            current += ch;
        } else if (ch === "|" && !inMath && prev !== "\\") {
            cells.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }
    cells.push(current.trim());
    return cells;
}

function isMarkdownTableSeparator(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
    const cells = splitMarkdownTableRow(trimmed);
    return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function formatMathHtml(rawLatex) {
    const text = String(rawLatex || "").replace(/\r\n?/g, "\n");
    if (!text.includes("|")) {
        return escapeHtml(text).replace(/\n/g, "<br>");
    }

    const lines = text.split("\n");
    const blocks = [];
    let textBuffer = [];

    const flushText = () => {
        if (textBuffer.length === 0) return;
        blocks.push(textBuffer.map((l) => escapeHtml(l)).join("<br>"));
        textBuffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const cur = lines[i];
        const next = i + 1 < lines.length ? lines[i + 1] : "";

        if (cur.includes("|") && isMarkdownTableSeparator(next)) {
            const headers = splitMarkdownTableRow(cur);
            if (headers.length >= 2) {
                flushText();
                const bodyRows = [];
                let j = i + 2;
                while (j < lines.length) {
                    const rowLine = lines[j].trim();
                    if (!rowLine || !rowLine.includes("|")) break;
                    bodyRows.push(splitMarkdownTableRow(rowLine));
                    j++;
                }

                const headHtml = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
                const bodyHtml = bodyRows.length
                    ? `<tbody>${bodyRows
                          .map((r) => {
                              const padded = Array.from({ length: headers.length }, (_, idx) => r[idx] ?? "");
                              return `<tr>${padded.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
                          })
                          .join("")}</tbody>`
                    : "";
                blocks.push(`<div class="physics-table-wrap thin-scroll"><table class="physics-data-table">${headHtml}${bodyHtml}</table></div>`);
                i = j - 1;
                continue;
            }
        }
        textBuffer.push(cur);
    }

    flushText();
    return blocks.join("");
}

function renderSvgFigureHtml(q) {
    const cleanSvg = sanitizeInlineSvg(q?.svgFigure || "");
    if (!cleanSvg) return "";
    const caption = q.figureCaption
        ? `<figcaption class="physics-svg-caption">${escapeHtml(q.figureCaption)}</figcaption>`
        : "";
    return `<figure class="physics-svg-frame">${cleanSvg}${caption}</figure>`;
}

function renderSourceBadgesHtml(q) {
    const isVn = q.sourceLang === "vi" || isVietnameseSourceId(q.sourceId) || isVietnameseSourceId(q.sourceLabel);
    const cleanLabel = escapeHtml(String(q.sourceLabel || q.sourceId || "Open Physics").replace(/^(🇻🇳|🌐)\s*/, ""));
    const topic = escapeHtml(q.topic || "Vật Lý 2026");
    const badgeCls = isVn
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        : "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300";
    const flag = isVn ? "🇻🇳" : "🌐";

    const srcElem = q.sourceUrl
        ? `<a href="${escapeHtml(q.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold font-mono hover:underline ${badgeCls}">${flag} ${cleanLabel} ↗</a>`
        : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${badgeCls}">${flag} ${cleanLabel}</span>`;

    const svgBadge = sanitizeInlineSvg(q.svgFigure || "")
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">📊 Đồ thị SVG</span>`
        : "";

    return `
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">${topic}</span>
        ${srcElem}
        ${svgBadge}
    `;
}

function updateViewModeButtons() {
    document.querySelectorAll("[data-view-mode]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.viewMode === uiState.viewMode);
    });
}

function renderExamWorkspace(exam) {
    if (!exam) return;
    uiState.currentExam = exam;
    dom.emptyStateSection.classList.add("hidden");
    dom.examWorkspace.classList.remove("hidden");

    const allQs = [...(exam.part1 || []), ...(exam.part2 || []), ...(exam.part3 || [])];
    const vnInExam =
        typeof exam.vnCount === "number"
            ? exam.vnCount
            : allQs.filter((q) => q.sourceLang === "vi" || isVietnameseSourceId(q.sourceId)).length;
    const qtInExam = typeof exam.intlCount === "number" ? exam.intlCount : Math.max(0, allQs.length - vnInExam);
    const svgInExam = allQs.filter((q) => Boolean(sanitizeInlineSvg(q.svgFigure || ""))).length;

    dom.examCodeBadge.textContent = `MÃ ĐỀ: ${exam.examCode || "2026"}`;
    dom.examDiffBadge.textContent = exam.difficultyLabel || "Chuẩn BGD 2026";
    dom.examMetaSub.textContent = `Tạo lúc ${formatDateTime(exam.createdAt)} · 🇻🇳 ${vnInExam} câu VN · 🌐 ${qtInExam} câu QT${svgInExam ? ` · 📊 ${svgInExam} hình SVG` : ""}${exam.aiModelUsed ? ` · AI: ${exam.aiModelUsed}` : ""} · Kho "${storage.activeVaultKey}"`;

    // Character counts on all mobile-safe copy buttons
    const p1FirstStr = buildPart1LatexSlice(exam, 0, 9, "Câu 1–9");
    const p1SecondStr = buildPart1LatexSlice(exam, 9, 18, "Câu 10–18");
    const p1AllStr = buildPart1LatexSlice(exam, 0, 18, "Câu 1–18");
    const p2AllStr = buildPart2Latex(exam);
    const p3AllStr = buildPart3Latex(exam);
    const ansAllStr = buildAnswersLatex(exam);

    dom.charPart1First.textContent = formatCharCount(p1FirstStr);
    dom.charPart1Second.textContent = formatCharCount(p1SecondStr);
    dom.charPart1All.textContent = formatCharCount(p1AllStr);
    dom.charPart2All.textContent = formatCharCount(p2AllStr);
    dom.charPart3All.textContent = formatCharCount(p3AllStr);
    dom.charAnswersAll.textContent = formatCharCount(ansAllStr);

    const showKatex = uiState.viewMode === "both" || uiState.viewMode === "katex";
    const showLatex = uiState.viewMode === "both" || uiState.viewMode === "latex";

    // PHẦN I (18 câu)
    dom.part1Container.innerHTML = (exam.part1 || [])
        .map((q, idx) => {
            const latexBlock = formatSinglePart1Latex(q);
            return `
                <article class="print-clean-card rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-lg bg-sky-600 text-white text-xs font-extrabold">Câu ${q.number}</span>
                            ${renderSourceBadgesHtml(q)}
                        </div>
                        <button type="button" data-copy-single="part1:${idx}" class="no-print inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer">
                            ${STACKED_SHEETS_SVG}
                            <span>Copy câu ${q.number}</span>
                        </button>
                    </div>
                    ${
                        showKatex
                            ? `
                        <div class="katex-render-target text-sm leading-relaxed text-slate-900 dark:text-slate-100 math-content">
                            <div>${formatMathHtml(q.stemLatex)}</div>
                            ${renderSvgFigureHtml(q)}
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80"><span class="font-extrabold text-sky-700 dark:text-sky-400 mr-1.5">A.</span>${formatMathHtml(q.optionA)}</div>
                                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80"><span class="font-extrabold text-sky-700 dark:text-sky-400 mr-1.5">B.</span>${formatMathHtml(q.optionB)}</div>
                                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80"><span class="font-extrabold text-sky-700 dark:text-sky-400 mr-1.5">C.</span>${formatMathHtml(q.optionC)}</div>
                                <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80"><span class="font-extrabold text-sky-700 dark:text-sky-400 mr-1.5">D.</span>${formatMathHtml(q.optionD)}</div>
                            </div>
                        </div>`
                            : ""
                    }
                    ${
                        showLatex
                            ? `
                        <div class="latex-box rounded-xl bg-slate-950 text-emerald-300 p-3 text-xs overflow-x-auto border border-slate-800 thin-scroll">
                            <div class="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Mã LaTeX · ${formatCharCount(latexBlock)}</div>
                            <pre class="latex-code-box font-mono">${escapeHtml(latexBlock)}</pre>
                        </div>`
                            : ""
                    }
                </article>
            `;
        })
        .join("");

    // PHẦN II (4 câu Đúng/Sai)
    dom.part2Container.innerHTML = (exam.part2 || [])
        .map((q, idx) => {
            const latexBlock = formatSinglePart2Latex(q);
            return `
                <article class="print-clean-card rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-extrabold">Câu ${q.number}</span>
                            ${renderSourceBadgesHtml(q)}
                        </div>
                        <button type="button" data-copy-single="part2:${idx}" class="no-print inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer">
                            ${STACKED_SHEETS_SVG}
                            <span>Copy câu ${q.number}</span>
                        </button>
                    </div>
                    ${
                        showKatex
                            ? `
                        <div class="katex-render-target text-sm leading-relaxed text-slate-900 dark:text-slate-100 math-content">
                            <div>${formatMathHtml(q.stemLatex)}</div>
                            ${renderSvgFigureHtml(q)}
                            <div class="space-y-2 mt-3">
                                ${(q.statements || [])
                                    .map(
                                        (st) => `
                                    <div class="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                                        <span class="font-extrabold text-emerald-700 dark:text-emerald-400 shrink-0">${escapeHtml(st.label)})</span>
                                        <span>${formatMathHtml(st.statementLatex)}</span>
                                    </div>`
                                    )
                                    .join("")}
                            </div>
                        </div>`
                            : ""
                    }
                    ${
                        showLatex
                            ? `
                        <div class="latex-box rounded-xl bg-slate-950 text-emerald-300 p-3 text-xs overflow-x-auto border border-slate-800 thin-scroll">
                            <div class="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Mã LaTeX · ${formatCharCount(latexBlock)}</div>
                            <pre class="latex-code-box font-mono">${escapeHtml(latexBlock)}</pre>
                        </div>`
                            : ""
                    }
                </article>
            `;
        })
        .join("");

    // PHẦN III (6 câu Trả lời ngắn)
    dom.part3Container.innerHTML = (exam.part3 || [])
        .map((q, idx) => {
            const latexBlock = formatSinglePart3Latex(q);
            return `
                <article class="print-clean-card rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-lg bg-amber-600 text-white text-xs font-extrabold">Câu ${q.number}</span>
                            ${renderSourceBadgesHtml(q)}
                        </div>
                        <button type="button" data-copy-single="part3:${idx}" class="no-print inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer">
                            ${STACKED_SHEETS_SVG}
                            <span>Copy câu ${q.number}</span>
                        </button>
                    </div>
                    ${
                        showKatex
                            ? `
                        <div class="katex-render-target text-sm leading-relaxed text-slate-900 dark:text-slate-100 math-content">
                            <div>${formatMathHtml(q.stemLatex)}</div>
                            ${renderSvgFigureHtml(q)}
                            <div class="flex items-center gap-2 mt-3 text-xs text-slate-500 dark:text-slate-400">
                                <span>Ô tô đáp số (tối đa 4 ký tự):</span>
                                <span class="answer-slot"></span>
                                <span class="answer-slot"></span>
                                <span class="answer-slot"></span>
                                <span class="answer-slot"></span>
                            </div>
                        </div>`
                            : ""
                    }
                    ${
                        showLatex
                            ? `
                        <div class="latex-box rounded-xl bg-slate-950 text-emerald-300 p-3 text-xs overflow-x-auto border border-slate-800 thin-scroll">
                            <div class="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Mã LaTeX · ${formatCharCount(latexBlock)}</div>
                            <pre class="latex-code-box font-mono">${escapeHtml(latexBlock)}</pre>
                        </div>`
                            : ""
                    }
                </article>
            `;
        })
        .join("");

    // BẢNG ĐÁP ÁN & LỜI GIẢI (18 + 4 + 6 = 28 câu)
    dom.answersContainer.innerHTML = `
        <div class="space-y-4">
            <div>
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400 mb-2">Đáp án nhanh Phần I (18 câu — 4,5 điểm)</h4>
                <div class="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-1.5">
                    ${(exam.part1 || [])
                        .map(
                            (q) => `
                        <div class="p-2 rounded-xl text-center bg-sky-50 dark:bg-sky-950/50 border border-sky-200/80 dark:border-sky-900">
                            <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400">C${q.number}</div>
                            <div class="font-mono text-sm font-extrabold text-sky-800 dark:text-sky-300">${escapeHtml(q.correctOption)}</div>
                        </div>`
                        )
                        .join("")}
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <h4 class="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">Đáp án nhanh Phần II (4 câu — 4,0 điểm)</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        ${(exam.part2 || [])
                            .map(
                                (q) => `
                            <div class="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-900 flex items-center justify-between gap-2">
                                <span class="text-xs font-bold text-slate-800 dark:text-slate-100">Câu ${q.number}</span>
                                <span class="font-mono text-xs font-extrabold text-emerald-800 dark:text-emerald-300">${(q.statements || []).map((s) => `${s.label}:${s.isTrue ? "Đ" : "S"}`).join(" ")}</span>
                            </div>`
                            )
                            .join("")}
                    </div>
                </div>

                <div>
                    <h4 class="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Đáp án nhanh Phần III (6 câu — 1,5 điểm)</h4>
                    <div class="grid grid-cols-3 gap-2">
                        ${(exam.part3 || [])
                            .map(
                                (q) => `
                            <div class="p-2 rounded-xl text-center bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-900">
                                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400">Câu ${q.number}</div>
                                <div class="font-mono text-sm font-extrabold text-amber-800 dark:text-amber-300">${escapeHtml(q.shortAnswer)}</div>
                            </div>`
                            )
                            .join("")}
                    </div>
                </div>
            </div>
        </div>

        <div id="detailedSolutionsBlock" class="${uiState.showSolutions ? "" : "hidden"} space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            ${
                showKatex
                    ? `
                <div class="katex-render-target space-y-4 math-content">
                    <div class="space-y-2">
                        <h5 class="text-xs font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400">Gợi ý giải nhanh Phần I (1–18)</h5>
                        ${(exam.part1 || [])
                            .map(
                                (q) =>
                                    `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-xs sm:text-sm leading-relaxed"><strong class="text-sky-700 dark:text-sky-400">Câu ${q.number} (${escapeHtml(q.correctOption)}):</strong> ${formatMathHtml(q.solutionLatex)}</div>`
                            )
                            .join("")}
                    </div>
                    <div class="space-y-2">
                        <h5 class="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Gợi ý giải nhanh Phần II (1–4)</h5>
                        ${(exam.part2 || [])
                            .map(
                                (q) =>
                                    `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-xs sm:text-sm leading-relaxed"><strong class="text-emerald-700 dark:text-emerald-400">Câu ${q.number}:</strong> ${formatMathHtml(q.solutionLatex)}</div>`
                            )
                            .join("")}
                    </div>
                    <div class="space-y-2">
                        <h5 class="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">Gợi ý giải nhanh Phần III (1–6)</h5>
                        ${(exam.part3 || [])
                            .map(
                                (q) =>
                                    `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-xs sm:text-sm leading-relaxed"><strong class="text-amber-700 dark:text-amber-400">Câu ${q.number} (Đáp số: ${escapeHtml(q.shortAnswer)}):</strong> ${formatMathHtml(q.solutionLatex)}</div>`
                            )
                            .join("")}
                    </div>
                </div>`
                    : ""
            }
            ${
                showLatex
                    ? `
                <div class="latex-box rounded-xl bg-slate-950 text-emerald-300 p-3 text-xs overflow-x-auto max-h-96 border border-slate-800 thin-scroll">
                    <div class="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Mã LaTeX Đáp án &amp; Gợi ý giải nhanh · ${formatCharCount(ansAllStr)}</div>
                    <pre class="latex-code-box font-mono">${escapeHtml(ansAllStr)}</pre>
                </div>`
                    : ""
            }
        </div>
    `;

    updateViewModeButtons();
    renderPersistentHistoryList();

    if (showKatex) {
        requestAnimationFrame(() => {
            dom.examWorkspace.querySelectorAll(".katex-render-target").forEach(runKatexAutoRender);
            if (dom.examConstantsGrid) runKatexAutoRender(dom.examConstantsGrid);
        });
    }
}

// =========================================================================
// 7. GENERATION TRIGGER & EXPORT / IMPORT HANDLERS
// =========================================================================

let serverHealthBootPromise = null;

async function handleGenerateExam() {
    if (uiState.isGenerating) return;

    if (!aiClient.serverHealth.checked && serverHealthBootPromise) {
        await serverHealthBootPromise;
    }

    if (!aiClient.isReadyForActiveProvider()) {
        showToast("Vui lòng nhập API Key miễn phí (Google AI Studio / Groq / OpenRouter) trước khi tạo đề.", "warn");
        openAiSettingsModal();
        return;
    }

    uiState.isGenerating = true;
    dom.btnGenerateExam.disabled = true;
    dom.iconGenerateIdle.classList.add("hidden");
    dom.iconGenerateSpin.classList.remove("hidden");
    const startedMs = Date.now();
    dom.btnGenerateLabel.textContent = "Đang kéo Source & Biên soạn... (0s)";
    const elapsedTimer = setInterval(() => {
        const secs = Math.floor((Date.now() - startedMs) / 1000);
        dom.btnGenerateLabel.textContent = `Đang kéo Source & Biên soạn... (${secs}s)`;
    }, 1000);

    try {
        const examDoc = await runFullExamPipeline({
            aiClient,
            harvester,
            storage,
            priorityMode: dom.sourcePrioritySelect.value || "vn_priority",
            difficultyKey: dom.difficultySelect.value || "standard",
            onProgress: setProgress,
            onEntropy: (hex) => {
                dom.progressEntropyBadge.textContent = `CSPRNG-128: ${hex.slice(0, 12)}...`;
            },
            onLog: addLog
        });

        renderExamWorkspace(examDoc);
        dom.examWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        addLog(`[LỖI PHIÊN TẠO ĐỀ] ${err.message}`, "error");
        dom.progressMessage.textContent = `Lỗi: ${err.message}`;
        showToast(`Có lỗi khi biên soạn đề: ${err.message}`, "error");
        if (err.code === "MISSING_API_KEY" || err.status === 401 || err.status === 403) {
            openAiSettingsModal();
        }
    } finally {
        clearInterval(elapsedTimer);
        uiState.isGenerating = false;
        dom.btnGenerateExam.disabled = false;
        dom.iconGenerateIdle.classList.remove("hidden");
        dom.iconGenerateSpin.classList.add("hidden");
        dom.btnGenerateLabel.textContent = "Kéo Source & Tạo Đề Vật Lý 2026";
        updateAiStatusBadges();
    }
}

function handleExportJson() {
    const payload = storage.buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-vatly2026-${storage.activeVaultKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
        `Đã xuất sao lưu Kho ${storage.activeVaultKey} (${payload.exams.length} đề, ${storage.vault.hashes.size} câu khóa).`,
        "success"
    );
}

async function handleImportJsonFile(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const { importedExams, importedFps } = await storage.importFromJsonText(text);
        showToast(`Đã nhập ${importedExams} đề và ${importedFps} gói chống trùng lặp vào Kho "${storage.activeVaultKey}"!`, "success");
    } catch (err) {
        showToast(`Lỗi nhập tệp .json: ${err.message}`, "error");
    }
}

// =========================================================================
// 8. EVENT WIRING & APP BOOT
// =========================================================================

function bindEvents() {
    // Theme toggle
    dom.btnToggleTheme.addEventListener("click", () => {
        const isDark = document.documentElement.classList.toggle("dark");
        try {
            localStorage.setItem(STORAGE_KEYS.THEME, isDark ? "dark" : "light");
        } catch {
            // ignore
        }
        syncThemeIcons();
    });

    // AI Settings modal triggers
    dom.btnOpenAiTop.addEventListener("click", openAiSettingsModal);
    dom.btnSetupAiNow.addEventListener("click", openAiSettingsModal);
    dom.btnChangeAiHero.addEventListener("click", openAiSettingsModal);

    dom.providerCardGrid.addEventListener("click", (e) => {
        const card = e.target.closest("[data-select-provider]");
        if (!card) return;
        syncAiModalFieldsForProvider(card.dataset.selectProvider);
    });

    dom.aiModelSelect.addEventListener("change", () => {
        const cfg = AI_PROVIDERS[uiState.modalDraftProvider];
        const m = cfg?.models.find((item) => item.id === dom.aiModelSelect.value);
        if (m) dom.aiModelHint.textContent = m.hint;
        dom.aiCustomModelInput.value = "";
    });

    dom.btnToggleKeyVisibility.addEventListener("click", () => {
        const isPassword = dom.aiApiKeyInput.type === "password";
        dom.aiApiKeyInput.type = isPassword ? "text" : "password";
        dom.btnToggleKeyVisibility.textContent = isPassword ? "Ẩn" : "Hiện";
    });

    dom.btnSaveAiSettings.addEventListener("click", () => {
        const patch = collectAiSettingsFromModal();
        aiClient.updateSettings(patch);
        updateAiStatusBadges();
        closeModal("aiSettingsModal");
        showToast(`Đã lưu cấu hình AI: ${aiClient.getConnectionModeLabel().label}`, "success");
    });

    dom.btnTestAiConnection.addEventListener("click", async () => {
        const patch = collectAiSettingsFromModal();
        aiClient.updateSettings(patch);
        updateAiStatusBadges();

        dom.btnTestAiConnection.disabled = true;
        dom.btnTestAiConnection.textContent = "Đang kiểm tra...";
        dom.aiTestResultBox.classList.add("hidden");

        try {
            const res = await aiClient.testConnection();
            dom.aiTestResultBox.className = "p-3 rounded-xl text-xs font-semibold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
            dom.aiTestResultBox.textContent = `✅ Kết nối thành công với ${res.provider}/${res.model} (${res.elapsedSec}s)! Sẵn sàng tạo đề Vật Lý 2026.`;
            dom.aiTestResultBox.classList.remove("hidden");
        } catch (err) {
            dom.aiTestResultBox.className = "p-3 rounded-xl text-xs font-semibold bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
            dom.aiTestResultBox.textContent = `❌ Kiểm tra thất bại: ${err.message}`;
            dom.aiTestResultBox.classList.remove("hidden");
        } finally {
            dom.btnTestAiConnection.disabled = false;
            dom.btnTestAiConnection.textContent = "⚡ Kiểm tra kết nối";
        }
    });

    // Vault & Firebase Modal triggers
    const openVaultModal = () => {
        dom.vaultKeyInput.value = storage.activeVaultKey;
        if (storage.firebaseConfig) {
            dom.firebaseConfigInput.value = JSON.stringify(storage.firebaseConfig, null, 2);
        }
        openModal("vaultModal");
    };
    dom.btnOpenVaultTop.addEventListener("click", openVaultModal);
    dom.btnOpenVaultBar.addEventListener("click", openVaultModal);

    dom.btnSyncCloud.addEventListener("click", () => storage.syncWithCloud(true, false));
    dom.btnDismissCloudError.addEventListener("click", clearCloudError);

    dom.btnApplyVaultKey.addEventListener("click", async () => {
        await storage.switchActiveVaultKey(dom.vaultKeyInput.value);
        uiState.currentExam = null;
        dom.examWorkspace.classList.add("hidden");
        dom.emptyStateSection.classList.remove("hidden");
        closeModal("vaultModal");
    });

    dom.btnResetDefaultKey.addEventListener("click", async () => {
        await storage.switchActiveVaultKey(DEFAULT_VAULT_KEY);
        uiState.currentExam = null;
        dom.examWorkspace.classList.add("hidden");
        dom.emptyStateSection.classList.remove("hidden");
        closeModal("vaultModal");
    });

    dom.btnCopyVaultKey.addEventListener("click", () => copyTextToClipboard(storage.activeVaultKey, "Mã Kho"));

    dom.btnConnectFirebase.addEventListener("click", async () => {
        const parsed = parseFirebaseConfigInput(dom.firebaseConfigInput.value);
        if (!parsed.ok) {
            showToast(parsed.error, "error");
            return;
        }
        dom.btnConnectFirebase.disabled = true;
        dom.btnConnectFirebase.textContent = "Đang kết nối...";
        const ok = await storage.connectFirebase(parsed.config, "thptqg-vatly-2026-studio", true);
        dom.btnConnectFirebase.disabled = false;
        dom.btnConnectFirebase.textContent = "Kết nối Firebase Cloud";
        if (ok) {
            clearCloudError();
            showToast(`☁️ Đã kết nối Firebase Cloud (${parsed.config.projectId}) thành công!`, "success");
        }
    });

    dom.btnDisconnectFirebase.addEventListener("click", () => {
        clearCloudError();
        storage.disconnectFirebase();
        dom.firebaseConfigInput.value = "";
    });

    // Export / Import JSON
    dom.btnQuickExportJson.addEventListener("click", handleExportJson);
    dom.btnModalExportJson.addEventListener("click", handleExportJson);
    dom.quickImportFileInput.addEventListener("change", (e) => {
        handleImportJsonFile(e.target.files?.[0]);
        e.target.value = "";
    });
    dom.modalImportFileInput.addEventListener("change", (e) => {
        handleImportJsonFile(e.target.files?.[0]);
        e.target.value = "";
    });

    // Clear Vault confirmation
    const askClearVault = () => {
        openConfirmDialog(
            `Dọn sạch Kho "${storage.activeVaultKey}"?`,
            `Toàn bộ ${storage.vault.exams.size} đề thi và ${storage.vault.hashes.size} dấu vân tay chống trùng lặp của Kho "${storage.activeVaultKey}" sẽ bị xóa. Bạn có chắc muốn tiếp tục?`,
            "Xóa sạch Kho",
            async () => {
                await storage.clearEntireActiveVault(dom.sourcePrioritySelect.value || "vn_priority");
                uiState.currentExam = null;
                dom.examWorkspace.classList.add("hidden");
                dom.emptyStateSection.classList.remove("hidden");
                closeModal("vaultModal");
            }
        );
    };
    dom.btnClearVaultFromHistory.addEventListener("click", askClearVault);
    dom.btnOpenConfirmClearVault.addEventListener("click", askClearVault);

    // Confirm Modal
    dom.btnConfirmCancel.addEventListener("click", () => {
        uiState.pendingConfirmAction = null;
        closeModal("confirmModal");
    });
    dom.btnConfirmProceed.addEventListener("click", async () => {
        const fn = uiState.pendingConfirmAction;
        uiState.pendingConfirmAction = null;
        closeModal("confirmModal");
        if (typeof fn === "function") await fn();
    });

    // Generic modal close handlers
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
        btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
    });
    [dom.aiSettingsModal, dom.vaultModal, dom.confirmModal].forEach((modal) => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeModal("aiSettingsModal");
            closeModal("vaultModal");
            closeModal("confirmModal");
        }
    });

    // Harvester Generate & Log Accordion
    dom.btnGenerateExam.addEventListener("click", handleGenerateExam);
    dom.btnToggleLog.addEventListener("click", () => {
        const isHidden = dom.logPanel.classList.toggle("hidden");
        dom.btnToggleLog.setAttribute("aria-expanded", String(!isHidden));
        dom.logChevron.style.transform = isHidden ? "rotate(0deg)" : "rotate(180deg)";
    });

    // History Jump & Collapse
    dom.btnJumpHistory.addEventListener("click", () => {
        uiState.historyExpanded = true;
        dom.historyPanelBody.classList.remove("hidden");
        dom.historyChevron.style.transform = "rotate(180deg)";
        dom.historySection.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const toggleHistory = () => {
        uiState.historyExpanded = !uiState.historyExpanded;
        dom.historyPanelBody.classList.toggle("hidden", !uiState.historyExpanded);
        dom.historyChevron.style.transform = uiState.historyExpanded ? "rotate(180deg)" : "rotate(0deg)";
    };
    dom.btnToggleHistoryBody.addEventListener("click", toggleHistory);
    dom.btnCollapseHistory.addEventListener("click", toggleHistory);

    // History Item Open / Delete delegation
    dom.historyListContainer.addEventListener("click", (e) => {
        const delBtn = e.target.closest("[data-delete-exam]");
        if (delBtn) {
            const eid = delBtn.dataset.deleteExam;
            const ex = storage.vault.exams.get(eid);
            if (!ex) return;
            openConfirmDialog(
                `Xóa Mã đề ${ex.examCode}?`,
                `Mã đề ${ex.examCode} (tạo lúc ${formatDateTime(ex.createdAt)}) và gói dấu vân tay chống trùng lặp tương ứng sẽ bị xóa.`,
                "Xóa đề này",
                async () => {
                    await storage.deleteSingleExam(eid);
                    if (uiState.currentExam && uiState.currentExam.examId === eid) {
                        uiState.currentExam = null;
                        dom.examWorkspace.classList.add("hidden");
                        dom.emptyStateSection.classList.remove("hidden");
                    }
                }
            );
            return;
        }

        const openBtn = e.target.closest("[data-open-exam]");
        if (openBtn) {
            const ex = storage.vault.exams.get(openBtn.dataset.openExam);
            if (ex) {
                renderExamWorkspace(ex);
                dom.examWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
                showToast(`Đã mở lại Mã đề ${ex.examCode}.`, "info");
            }
        }
    });

    // Exam Display Mode & Solutions Toggle
    document.querySelectorAll("[data-view-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
            uiState.viewMode = btn.dataset.viewMode;
            if (uiState.currentExam) renderExamWorkspace(uiState.currentExam);
        });
    });

    dom.btnToggleSolutions.addEventListener("click", () => {
        uiState.showSolutions = !uiState.showSolutions;
        const block = $("detailedSolutionsBlock");
        if (block) block.classList.toggle("hidden", !uiState.showSolutions);
    });

    // Print / Save PDF & Download .tex
    dom.btnPrintExam.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        const prevMode = uiState.viewMode;
        if (prevMode === "latex") {
            uiState.viewMode = "katex";
            renderExamWorkspace(uiState.currentExam);
            setTimeout(() => {
                window.print();
                uiState.viewMode = prevMode;
                renderExamWorkspace(uiState.currentExam);
            }, 250);
        } else {
            window.print();
        }
    });

    dom.btnDownloadTex.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        const tex = buildFullTexDocument(uiState.currentExam);
        const blob = new Blob([tex], { type: "application/x-tex;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `De-Thi-VatLy-THPTQG-2026-MaDe-${uiState.currentExam.examCode}.tex`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã tải xuống tệp .tex cho Mã đề ${uiState.currentExam.examCode}.`, "success");
    });

    // Copy Constants & Mobile-Safe Split Section Copy Buttons
    dom.btnCopyConstants.addEventListener("click", () => {
        copyTextToClipboard(buildConstantsLatex(), "Bảng Hằng số Vật lý chuẩn");
    });
    dom.btnCopyPart1First.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildPart1LatexSlice(uiState.currentExam, 0, 9, "Câu 1–9"), "Phần I (Câu 1–9)");
    });
    dom.btnCopyPart1Second.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildPart1LatexSlice(uiState.currentExam, 9, 18, "Câu 10–18"), "Phần I (Câu 10–18)");
    });
    dom.btnCopyPart1All.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildPart1LatexSlice(uiState.currentExam, 0, 18, "Câu 1–18"), "Trọn bộ Phần I (Câu 1–18)");
    });
    dom.btnCopyPart2All.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildPart2Latex(uiState.currentExam), "Phần II (Câu 1–4 Đúng/Sai)");
    });
    dom.btnCopyPart3All.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildPart3Latex(uiState.currentExam), "Phần III (Câu 1–6 Trả lời ngắn)");
    });
    dom.btnCopyAnswersAll.addEventListener("click", () => {
        if (!uiState.currentExam) return;
        copyTextToClipboard(buildAnswersLatex(uiState.currentExam), "Bảng Đáp Án & Gợi Ý Giải Nhanh");
    });

    // Single-Question Copy Delegation
    dom.examWorkspace.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-copy-single]");
        if (!btn || !uiState.currentExam) return;
        const [partKey, idxStr] = btn.dataset.copySingle.split(":");
        const idx = parseInt(idxStr, 10);
        const q = uiState.currentExam[partKey]?.[idx];
        if (!q) return;

        let text = "";
        let label = "";
        if (partKey === "part1") {
            text = formatSinglePart1Latex(q);
            label = `Phần I - Câu ${q.number}`;
        } else if (partKey === "part2") {
            text = formatSinglePart2Latex(q);
            label = `Phần II - Câu ${q.number}`;
        } else {
            text = formatSinglePart3Latex(q);
            label = `Phần III - Câu ${q.number}`;
        }
        copyTextToClipboard(text, label);
    });
}

async function bootApp() {
    syncThemeIcons();
    renderPhysicalConstantsBoxes();
    bindEvents();
    updateViewModeButtons();
    updateAiStatusBadges();

    serverHealthBootPromise = aiClient.detectServerHealth().then(() => {
        updateAiStatusBadges();
        const modeInfo = aiClient.getConnectionModeLabel();
        addLog(
            `[Boot] Sẵn sàng · AI: ${modeInfo.label} (${modeInfo.detail}) · Proxy /api/harvest: ${aiClient.serverHealth.proxyAvailable ? "Bật (Chống CORS)" : "Static"}`,
            "info"
        );
    });

    await storage.boot();
    updateStorageAndHistoryUI();
}

bootApp();
