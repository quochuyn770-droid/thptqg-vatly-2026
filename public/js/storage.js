import { DEFAULT_VAULT_KEY, STORAGE_KEYS } from "./config.js";
import {
    csprngHex,
    extractShinglesFromNormalized,
    isVietnameseSourceId,
    sanitizeVaultKey
} from "./crypto-dedup.js";

/**
 * Local-First Permanent Browser Storage (IndexedDB — isolated namespace for Physics 2026)
 * + Optional User-Configured Firebase Cloud Sync (dynamically loaded ONLY when configured!)
 * + Portable .json Export & Import backup.
 */

const IDB_NAME = "THPTQG2026_VatLyVault_v1";
const IDB_VERSION = 1;
const COL_EXAMS = "vatly2026_exams";
const COL_FINGERPRINTS = "vatly2026_fingerprints";
const COL_VAULT_META = "vatly2026_vault_meta";
const FIREBASE_SDK_VER = "11.6.1";

function sanitizeForFirestore(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => sanitizeForFirestore(item));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) out[k] = sanitizeForFirestore(v);
    }
    return out;
}

export function parseFirebaseConfigInput(rawText) {
    const trimmed = String(rawText || "").trim();
    if (!trimmed) return { ok: false, error: "Chưa nhập cấu hình Firebase JSON." };

    let jsonCandidate = trimmed;
    const braceStart = jsonCandidate.indexOf("{");
    const braceEnd = jsonCandidate.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
        jsonCandidate = jsonCandidate.slice(braceStart, braceEnd + 1);
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonCandidate);
    } catch {
        try {
            const quoted = jsonCandidate
                .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
                .replace(/'/g, '"')
                .replace(/,\s*}/g, "}");
            parsed = JSON.parse(quoted);
        } catch {
            return { ok: false, error: "Không thể đọc JSON cấu hình Firebase. Hãy dán đúng khối { apiKey, authDomain, projectId, appId }." };
        }
    }

    if (!parsed || typeof parsed !== "object" || !parsed.apiKey || !parsed.projectId) {
        return { ok: false, error: "Cấu hình Firebase thiếu trường bắt buộc `apiKey` hoặc `projectId`." };
    }

    return { ok: true, config: parsed };
}

export class VaultStorageManager {
    constructor({ onChange, onLog, onToast, onCloudError }) {
        this.onChange = typeof onChange === "function" ? onChange : () => {};
        this.onLog = typeof onLog === "function" ? onLog : () => {};
        this.onToast = typeof onToast === "function" ? onToast : () => {};
        this.onCloudError = typeof onCloudError === "function" ? onCloudError : () => {};

        this.activeVaultKey = DEFAULT_VAULT_KEY;
        this.idb = null;
        this.idbReady = false;
        this.idbError = "";

        this.firebaseConfig = null;
        this.firebaseAppId = "thptqg-vatly-2026-studio";
        this.fbSdk = null;
        this.fbApp = null;
        this.db = null;
        this.auth = null;
        this.authUser = null;
        this.unsubExams = null;
        this.unsubFingerprints = null;
        this.unsubMeta = null;

        this.storageStatus = "local";
        this.cloudErrorMsg = "";

        this.vault = {
            exams: new Map(),
            fingerprintDocs: new Map(),
            sourceIds: new Set(),
            vnSourceIds: new Set(),
            intlSourceIds: new Set(),
            hashes: new Set(),
            shingleEntries: [],
            totalDuplicatesBlocked: 0,
            totalCurriculumRejected: 0,
            totalMissingFigureRejected: 0,
            sessionDuplicatesBlocked: 0,
            sessionCurriculumRejected: 0,
            sessionMissingFigureRejected: 0
        };
    }

    _openIdb() {
        return new Promise((resolve, reject) => {
            if (!globalThis.indexedDB) return reject(new Error("IndexedDB không được hỗ trợ"));
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
                if (!db.objectStoreNames.contains("exams")) db.createObjectStore("exams", { keyPath: "docId" });
                if (!db.objectStoreNames.contains("fingerprints")) db.createObjectStore("fingerprints", { keyPath: "docId" });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("Không thể mở IndexedDB"));
        });
    }

    idbPut(storeName, value) {
        return new Promise((resolve) => {
            if (!this.idb) return resolve(false);
            try {
                const tx = this.idb.transaction(storeName, "readwrite");
                tx.objectStore(storeName).put(value);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    }

    idbGet(storeName, key) {
        return new Promise((resolve) => {
            if (!this.idb) return resolve(null);
            try {
                const tx = this.idb.transaction(storeName, "readonly");
                const req = tx.objectStore(storeName).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }

    idbGetAll(storeName) {
        return new Promise((resolve) => {
            if (!this.idb) return resolve([]);
            try {
                const tx = this.idb.transaction(storeName, "readonly");
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
                req.onerror = () => resolve([]);
            } catch {
                resolve([]);
            }
        });
    }

    idbDelete(storeName, key) {
        return new Promise((resolve) => {
            if (!this.idb) return resolve(false);
            try {
                const tx = this.idb.transaction(storeName, "readwrite");
                tx.objectStore(storeName).delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    }

    resetVaultMemory() {
        this.vault.exams.clear();
        this.vault.fingerprintDocs.clear();
        this.vault.sourceIds.clear();
        this.vault.vnSourceIds.clear();
        this.vault.intlSourceIds.clear();
        this.vault.hashes.clear();
        this.vault.shingleEntries = [];
        this.vault.totalDuplicatesBlocked = 0;
        this.vault.totalCurriculumRejected = 0;
        this.vault.totalMissingFigureRejected = 0;
        this.vault.sessionDuplicatesBlocked = 0;
        this.vault.sessionCurriculumRejected = 0;
        this.vault.sessionMissingFigureRejected = 0;
    }

    rebuildInMemoryIndexes() {
        this.vault.sourceIds.clear();
        this.vault.vnSourceIds.clear();
        this.vault.intlSourceIds.clear();
        this.vault.hashes.clear();
        this.vault.shingleEntries = [];

        let fpDupSum = 0;
        let fpCurrSum = 0;
        let fpFigSum = 0;

        for (const fp of this.vault.fingerprintDocs.values()) {
            if (!fp || fp.vaultKey !== this.activeVaultKey) continue;
            fpDupSum += Number(fp.duplicatesBlocked || 0);
            fpCurrSum += Number(fp.curriculumRejected || fp.complexRejected || 0);
            fpFigSum += Number(fp.missingFigureRejected || 0);

            for (const sid of Array.isArray(fp.sourceIds) ? fp.sourceIds : []) {
                if (!sid) continue;
                const str = String(sid);
                this.vault.sourceIds.add(str);
                if (isVietnameseSourceId(str)) this.vault.vnSourceIds.add(str);
                else this.vault.intlSourceIds.add(str);
            }
            for (const sid of Array.isArray(fp.vnSourceIds) ? fp.vnSourceIds : []) {
                if (!sid) continue;
                this.vault.sourceIds.add(String(sid));
                this.vault.vnSourceIds.add(String(sid));
            }
            for (const sid of Array.isArray(fp.intlSourceIds) ? fp.intlSourceIds : []) {
                if (!sid) continue;
                this.vault.sourceIds.add(String(sid));
                this.vault.intlSourceIds.add(String(sid));
            }

            const hashes = Array.isArray(fp.hashes) ? fp.hashes : [];
            const normTexts = Array.isArray(fp.normalizedTexts) ? fp.normalizedTexts : [];
            for (let i = 0; i < hashes.length; i++) {
                const h = String(hashes[i] || "");
                if (h) this.vault.hashes.add(h);
                const nt = String(normTexts[i] || "");
                if (nt) {
                    this.vault.shingleEntries.push({
                        hash: h,
                        shingles: extractShinglesFromNormalized(nt, 3),
                        preview: nt.slice(0, 90)
                    });
                }
            }
        }

        for (const ex of this.vault.exams.values()) {
            if (!ex || ex.vaultKey !== this.activeVaultKey) continue;
            const allQs = [...(ex.part1 || []), ...(ex.part2 || []), ...(ex.part3 || [])];
            for (const q of allQs) {
                if (q && q.sourceId) {
                    const sid = String(q.sourceId);
                    this.vault.sourceIds.add(sid);
                    if (q.sourceLang === "vi" || isVietnameseSourceId(sid)) this.vault.vnSourceIds.add(sid);
                    else this.vault.intlSourceIds.add(sid);
                }
            }
        }

        this.vault.totalDuplicatesBlocked = Math.max(this.vault.totalDuplicatesBlocked, fpDupSum);
        this.vault.totalCurriculumRejected = Math.max(this.vault.totalCurriculumRejected, fpCurrSum);
        this.vault.totalMissingFigureRejected = Math.max(this.vault.totalMissingFigureRejected, fpFigSum);
    }

    async loadLocalForActiveVault() {
        const cachedExams = await this.idbGetAll("exams");
        for (const ex of cachedExams) {
            if (ex && ex.vaultKey === this.activeVaultKey && ex.examId) {
                this.vault.exams.set(ex.examId, ex);
            }
        }
        const cachedFps = await this.idbGetAll("fingerprints");
        for (const fp of cachedFps) {
            if (fp && fp.vaultKey === this.activeVaultKey && fp.docId) {
                this.vault.fingerprintDocs.set(fp.docId, fp);
            }
        }
        const savedMeta = await this.idbGet("meta", `vault_stats:${this.activeVaultKey}`);
        if (savedMeta && savedMeta.value) {
            this.vault.totalDuplicatesBlocked = Number(savedMeta.value.totalDuplicatesBlocked || 0);
            this.vault.totalCurriculumRejected = Number(savedMeta.value.totalCurriculumRejected || 0);
            this.vault.totalMissingFigureRejected = Number(savedMeta.value.totalMissingFigureRejected || 0);
        }
        this.rebuildInMemoryIndexes();
        this.onChange();
    }

    loadSavedFirebaseConfig() {
        if (typeof globalThis.__firebase_config !== "undefined" && globalThis.__firebase_config) {
            try {
                const cfg =
                    typeof globalThis.__firebase_config === "string"
                        ? JSON.parse(globalThis.__firebase_config)
                        : globalThis.__firebase_config;
                if (cfg && cfg.apiKey && cfg.projectId) {
                    return {
                        config: cfg,
                        appId: typeof globalThis.__app_id !== "undefined" ? String(globalThis.__app_id) : "thptqg-vatly-2026-studio"
                    };
                }
            } catch {
                // ignore
            }
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.FIREBASE_CONFIG);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.config && parsed.config.apiKey && parsed.config.projectId) {
                return {
                    config: parsed.config,
                    appId: parsed.appId || "thptqg-vatly-2026-studio"
                };
            }
        } catch {
            // ignore
        }
        return null;
    }

    isCloudConfigured() {
        return Boolean(this.firebaseConfig && this.firebaseConfig.apiKey && this.firebaseConfig.projectId);
    }

    isCloudConnected() {
        return Boolean(this.db && this.authUser && this.storageStatus === "cloud_connected");
    }

    async _ensureFirebaseSdk() {
        if (this.fbSdk) return this.fbSdk;
        const [appMod, authMod, fsMod] = await Promise.all([
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VER}/firebase-app.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VER}/firebase-auth.js`),
            import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VER}/firebase-firestore.js`)
        ]);
        this.fbSdk = { appMod, authMod, fsMod };
        return this.fbSdk;
    }

    _detachListeners() {
        if (this.unsubExams) {
            try { this.unsubExams(); } catch { /* ignore */ }
            this.unsubExams = null;
        }
        if (this.unsubFingerprints) {
            try { this.unsubFingerprints(); } catch { /* ignore */ }
            this.unsubFingerprints = null;
        }
        if (this.unsubMeta) {
            try { this.unsubMeta(); } catch { /* ignore */ }
            this.unsubMeta = null;
        }
    }

    _examsColRef() {
        return this.fbSdk.fsMod.collection(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_EXAMS);
    }

    _fpsColRef() {
        return this.fbSdk.fsMod.collection(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS);
    }

    _metaDocRef(vaultKey) {
        return this.fbSdk.fsMod.doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_VAULT_META, vaultKey);
    }

    async connectFirebase(configObj, appId = "thptqg-vatly-2026-studio", saveToLocalStorage = true) {
        this._detachListeners();
        this.firebaseConfig = configObj;
        this.firebaseAppId = String(appId || "thptqg-vatly-2026-studio").trim() || "thptqg-vatly-2026-studio";

        if (saveToLocalStorage) {
            try {
                localStorage.setItem(
                    STORAGE_KEYS.FIREBASE_CONFIG,
                    JSON.stringify({ config: configObj, appId: this.firebaseAppId })
                );
            } catch {
                // ignore
            }
        }

        this.storageStatus = "cloud_connecting";
        this.cloudErrorMsg = "";
        this.onChange();

        try {
            const { appMod, authMod, fsMod } = await this._ensureFirebaseSdk();
            const instanceName = `vatly2026_${configObj.projectId}_${Date.now()}`;
            this.fbApp = appMod.initializeApp(configObj, instanceName);
            this.auth = authMod.getAuth(this.fbApp);
            this.db = fsMod.getFirestore(this.fbApp);

            const authReady = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("Quá thời gian chờ xác thực Firebase Auth (15s).")), 15000);
                const unsub = authMod.onAuthStateChanged(
                    this.auth,
                    (user) => {
                        if (user) {
                            clearTimeout(timer);
                            unsub();
                            resolve(user);
                        }
                    },
                    (err) => {
                        clearTimeout(timer);
                        unsub();
                        reject(err);
                    }
                );
            });

            if (typeof globalThis.__initial_auth_token !== "undefined" && globalThis.__initial_auth_token) {
                await authMod.signInWithCustomToken(this.auth, globalThis.__initial_auth_token);
            } else {
                await authMod.signInAnonymously(this.auth);
            }

            this.authUser = await authReady;
            this.onLog(`[Firebase Cloud] Đã kết nối project "${configObj.projectId}" thành công.`, "success");
            await this.syncWithCloud(false, true);
            this._attachRealtimeListeners();
            return true;
        } catch (err) {
            this.storageStatus = "cloud_error";
            this.cloudErrorMsg = err.message;
            this.onCloudError(`Không thể kết nối Firebase Cloud (${err.message}). Dữ liệu vẫn an toàn trong IndexedDB cục bộ.`);
            this.onChange();
            return false;
        }
    }

    disconnectFirebase() {
        this._detachListeners();
        this.firebaseConfig = null;
        this.db = null;
        this.auth = null;
        this.authUser = null;
        this.cloudErrorMsg = "";
        this.storageStatus = "local";
        try {
            localStorage.removeItem(STORAGE_KEYS.FIREBASE_CONFIG);
        } catch {
            // ignore
        }
        this.onLog("[Lưu trữ] Đã chuyển về chế độ Lưu cục bộ vĩnh viễn (IndexedDB).", "info");
        this.onToast("Đã ngắt Firebase Cloud. Toàn bộ đề thi vẫn được lưu vĩnh viễn trên trình duyệt này.", "info");
        this.onChange();
    }

    async syncWithCloud(showSuccessToast = false, pushLocalMissing = false) {
        if (!this.db || !this.authUser || !this.fbSdk) {
            if (showSuccessToast) {
                this.onToast("Đang ở chế độ Lưu cục bộ (IndexedDB) — dữ liệu tự động lưu ngay trên trình duyệt.", "info");
            }
            return;
        }

        const { getDocs, getDoc, setDoc, doc } = this.fbSdk.fsMod;
        try {
            this.storageStatus = "cloud_connecting";
            this.onChange();

            const localExamsBefore = new Map(this.vault.exams);
            const localFpsBefore = new Map(this.vault.fingerprintDocs);

            const [examSnap, fpSnap, metaSnap] = await Promise.all([
                getDocs(this._examsColRef()),
                getDocs(this._fpsColRef()),
                getDoc(this._metaDocRef(this.activeVaultKey))
            ]);

            const cloudExamIds = new Set();
            examSnap.forEach((d) => {
                const data = d.data();
                if (data && data.vaultKey === this.activeVaultKey) {
                    const examObj = { ...data, docId: d.id, examId: data.examId || d.id };
                    cloudExamIds.add(examObj.examId);
                    this.vault.exams.set(examObj.examId, examObj);
                    this.idbPut("exams", examObj);
                }
            });

            const cloudFpIds = new Set();
            fpSnap.forEach((d) => {
                const data = d.data();
                if (data && data.vaultKey === this.activeVaultKey) {
                    const fpObj = { ...data, docId: d.id };
                    cloudFpIds.add(d.id);
                    this.vault.fingerprintDocs.set(d.id, fpObj);
                    this.idbPut("fingerprints", fpObj);
                }
            });

            if (pushLocalMissing) {
                for (const [eid, ex] of localExamsBefore.entries()) {
                    if (!cloudExamIds.has(eid)) {
                        const dId = ex.docId || `${this.activeVaultKey}__${eid}`;
                        await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_EXAMS, dId), sanitizeForFirestore(ex));
                    }
                }
                for (const [fid, fp] of localFpsBefore.entries()) {
                    if (!cloudFpIds.has(fid)) {
                        await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS, fid), sanitizeForFirestore(fp));
                    }
                }
            }

            if (metaSnap.exists()) {
                const m = metaSnap.data();
                this.vault.totalDuplicatesBlocked = Math.max(this.vault.totalDuplicatesBlocked, Number(m.totalDuplicatesBlocked || 0));
                this.vault.totalCurriculumRejected = Math.max(this.vault.totalCurriculumRejected, Number(m.totalCurriculumRejected || 0));
                this.vault.totalMissingFigureRejected = Math.max(this.vault.totalMissingFigureRejected, Number(m.totalMissingFigureRejected || 0));
            }

            this.rebuildInMemoryIndexes();
            this.storageStatus = "cloud_connected";
            this.cloudErrorMsg = "";
            this.onChange();

            const count = this.vault.exams.size;
            this.onLog(`[Firebase Cloud] Đã đồng bộ Kho "${this.activeVaultKey}": ${count} đề, ${this.vault.hashes.size} câu khóa SHA-256.`, "success");
            if (showSuccessToast) {
                this.onToast(`☁️ Đã đồng bộ xong Kho ${this.activeVaultKey} (${count} đề, ${this.vault.hashes.size} câu khóa)!`, "success");
            }
        } catch (err) {
            this.storageStatus = "cloud_error";
            this.cloudErrorMsg = err.message;
            this.onCloudError(`Không thể đồng bộ Firebase Cloud (${err.message}).`);
            this.onChange();
        }
    }

    _attachRealtimeListeners() {
        this._detachListeners();
        if (!this.db || !this.authUser || !this.fbSdk) return;
        const { onSnapshot } = this.fbSdk.fsMod;

        this.unsubExams = onSnapshot(
            this._examsColRef(),
            (snap) => {
                this.vault.exams.clear();
                snap.forEach((d) => {
                    const data = d.data();
                    if (data && data.vaultKey === this.activeVaultKey) {
                        const examObj = { ...data, docId: d.id, examId: data.examId || d.id };
                        this.vault.exams.set(examObj.examId, examObj);
                        this.idbPut("exams", examObj);
                    }
                });
                this.rebuildInMemoryIndexes();
                this.storageStatus = "cloud_connected";
                this.cloudErrorMsg = "";
                this.onChange();
            },
            (err) => {
                this.storageStatus = "cloud_error";
                this.cloudErrorMsg = err.message;
                this.onCloudError(`Lỗi đồng bộ đề thi real-time: ${err.message}`);
                this.onChange();
            }
        );

        this.unsubFingerprints = onSnapshot(
            this._fpsColRef(),
            (snap) => {
                this.vault.fingerprintDocs.clear();
                snap.forEach((d) => {
                    const data = d.data();
                    if (data && data.vaultKey === this.activeVaultKey) {
                        const fpObj = { ...data, docId: d.id };
                        this.vault.fingerprintDocs.set(d.id, fpObj);
                        this.idbPut("fingerprints", fpObj);
                    }
                });
                this.rebuildInMemoryIndexes();
                this.onChange();
            },
            (err) => {
                this.onCloudError(`Lỗi đồng bộ dấu vân tay: ${err.message}`);
            }
        );

        this.unsubMeta = onSnapshot(
            this._metaDocRef(this.activeVaultKey),
            (docSnap) => {
                if (docSnap.exists()) {
                    const m = docSnap.data();
                    this.vault.totalDuplicatesBlocked = Math.max(this.vault.totalDuplicatesBlocked, Number(m.totalDuplicatesBlocked || 0));
                    this.vault.totalCurriculumRejected = Math.max(this.vault.totalCurriculumRejected, Number(m.totalCurriculumRejected || 0));
                    this.vault.totalMissingFigureRejected = Math.max(this.vault.totalMissingFigureRejected, Number(m.totalMissingFigureRejected || 0));
                    this.onChange();
                }
            },
            () => {}
        );
    }

    async boot() {
        try {
            this.idb = await this._openIdb();
            this.idbReady = true;
            const savedKey = await this.idbGet("meta", "active_vault_key");
            if (savedKey && savedKey.value) {
                this.activeVaultKey = sanitizeVaultKey(savedKey.value, DEFAULT_VAULT_KEY);
            }
            await this.loadLocalForActiveVault();
            this.onLog(
                `[IndexedDB] Đã tải Kho "${this.activeVaultKey}": ${this.vault.exams.size} đề, ${this.vault.hashes.size} câu khóa chống trùng lặp.`,
                "success"
            );
        } catch (err) {
            this.idbReady = false;
            this.idbError = err.message;
            this.onLog(`[IndexedDB] Cảnh báo: ${err.message}`, "warn");
        }

        const savedFb = this.loadSavedFirebaseConfig();
        if (savedFb) {
            await this.connectFirebase(savedFb.config, savedFb.appId, false);
        } else {
            this.storageStatus = "local";
            this.onChange();
        }
    }

    async saveExamAndFingerprints(examDoc, fpDoc, preferredPriority = "vn_priority") {
        const examDocId = `${this.activeVaultKey}__${examDoc.examId}`;
        const fpDocId = `${this.activeVaultKey}__fp_${examDoc.examId}`;

        const cleanExam = sanitizeForFirestore({ ...examDoc, docId: examDocId, vaultKey: this.activeVaultKey });
        const cleanFp = sanitizeForFirestore({ ...fpDoc, docId: fpDocId, vaultKey: this.activeVaultKey });

        this.vault.exams.set(cleanExam.examId, cleanExam);
        this.vault.fingerprintDocs.set(fpDocId, cleanFp);
        this.vault.totalDuplicatesBlocked += Number(cleanFp.duplicatesBlocked || 0);
        this.vault.totalCurriculumRejected += Number(cleanFp.curriculumRejected || 0);
        this.vault.totalMissingFigureRejected += Number(cleanFp.missingFigureRejected || 0);
        this.rebuildInMemoryIndexes();

        await this.idbPut("exams", cleanExam);
        await this.idbPut("fingerprints", cleanFp);
        await this.idbPut("meta", {
            key: `vault_stats:${this.activeVaultKey}`,
            value: {
                totalDuplicatesBlocked: this.vault.totalDuplicatesBlocked,
                totalCurriculumRejected: this.vault.totalCurriculumRejected,
                totalMissingFigureRejected: this.vault.totalMissingFigureRejected,
                lastUpdatedAt: Date.now()
            }
        });
        this.onChange();

        if (this.db && this.authUser && this.fbSdk) {
            const { setDoc, doc } = this.fbSdk.fsMod;
            try {
                await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_EXAMS, examDocId), cleanExam);
                await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS, fpDocId), cleanFp);
                await setDoc(
                    this._metaDocRef(this.activeVaultKey),
                    sanitizeForFirestore({
                        vaultKey: this.activeVaultKey,
                        lastUpdatedAt: Date.now(),
                        totalDuplicatesBlocked: this.vault.totalDuplicatesBlocked,
                        totalCurriculumRejected: this.vault.totalCurriculumRejected,
                        totalMissingFigureRejected: this.vault.totalMissingFigureRejected,
                        preferredPriority
                    })
                );
                this.storageStatus = "cloud_connected";
                this.cloudErrorMsg = "";
                this.onChange();
                this.onLog(`[Firebase Cloud] Đã đồng bộ đề ${cleanExam.examCode} lên Cloud thành công.`, "success");
                this.onToast("☁️ Đã lưu vĩnh viễn vào trình duyệt & đồng bộ lên Firebase Cloud!", "success");
                return true;
            } catch (err) {
                this.storageStatus = "cloud_error";
                this.cloudErrorMsg = err.message;
                this.onCloudError(`Đã lưu an toàn trong trình duyệt, nhưng ghi Firebase Cloud lỗi: ${err.message}`);
                this.onChange();
                return false;
            }
        }

        this.onToast("💾 Đã lưu vĩnh viễn vào bộ nhớ trình duyệt (IndexedDB)!", "success");
        return true;
    }

    async deleteSingleExam(examId) {
        const examObj = this.vault.exams.get(examId);
        if (!examObj) return false;
        const examDocId = examObj.docId || `${this.activeVaultKey}__${examId}`;
        const fpDocId = `${this.activeVaultKey}__fp_${examId}`;

        if (this.db && this.authUser && this.fbSdk) {
            const { deleteDoc, doc } = this.fbSdk.fsMod;
            await Promise.all([
                deleteDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_EXAMS, examDocId)),
                deleteDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS, fpDocId))
            ]);
        }

        await this.idbDelete("exams", examDocId);
        await this.idbDelete("fingerprints", fpDocId);

        this.vault.exams.delete(examId);
        this.vault.fingerprintDocs.delete(fpDocId);
        this.rebuildInMemoryIndexes();
        this.onChange();

        this.onToast(`Đã xóa Mã đề ${examObj.examCode}.`, "info");
        this.onLog(`[Kho] Đã xóa Mã đề ${examObj.examCode}.`, "warn");
        return true;
    }

    async clearEntireActiveVault(preferredPriority = "vn_priority") {
        const examsToDelete = Array.from(this.vault.exams.values());
        const fpsToDelete = Array.from(this.vault.fingerprintDocs.values());

        if (this.db && this.authUser && this.fbSdk) {
            const { deleteDoc, setDoc, doc } = this.fbSdk.fsMod;
            const ops = [];
            for (const ex of examsToDelete) {
                const dId = ex.docId || `${this.activeVaultKey}__${ex.examId}`;
                ops.push(deleteDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_EXAMS, dId)));
            }
            for (const fp of fpsToDelete) {
                const fId = fp.docId || `${this.activeVaultKey}__fp_${fp.examId}`;
                ops.push(deleteDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS, fId)));
            }
            ops.push(
                setDoc(this._metaDocRef(this.activeVaultKey), {
                    vaultKey: this.activeVaultKey,
                    lastUpdatedAt: Date.now(),
                    totalDuplicatesBlocked: 0,
                    totalCurriculumRejected: 0,
                    preferredPriority
                })
            );
            await Promise.all(ops);
        }

        for (const ex of examsToDelete) {
            await this.idbDelete("exams", ex.docId || `${this.activeVaultKey}__${ex.examId}`);
        }
        for (const fp of fpsToDelete) {
            await this.idbDelete("fingerprints", fp.docId || `${this.activeVaultKey}__fp_${fp.examId}`);
        }
        await this.idbDelete("meta", `vault_stats:${this.activeVaultKey}`);

        this.resetVaultMemory();
        this.onChange();
        this.onToast(`Đã dọn sạch toàn bộ Kho "${this.activeVaultKey}".`, "info");
        this.onLog(`[Kho] Đã dọn sạch ${examsToDelete.length} đề và ${fpsToDelete.length} gói dấu vân tay.`, "warn");
    }

    async switchActiveVaultKey(rawKey) {
        const cleanKey = sanitizeVaultKey(rawKey, DEFAULT_VAULT_KEY);
        this.activeVaultKey = cleanKey;
        await this.idbPut("meta", { key: "active_vault_key", value: cleanKey });

        this.resetVaultMemory();
        await this.loadLocalForActiveVault();

        if (this.db && this.authUser) {
            await this.syncWithCloud(true, false);
            this._attachRealtimeListeners();
        } else {
            this.onToast(`Đã chuyển sang Kho "${cleanKey}" (${this.vault.exams.size} đề).`, "info");
        }
        return cleanKey;
    }

    buildExportPayload() {
        return {
            schemaVersion: "thptqg2026-vatly-vault-v3",
            subject: "vatly-2026",
            exportedAt: new Date().toISOString(),
            vaultKey: this.activeVaultKey,
            exams: Array.from(this.vault.exams.values()),
            fingerprintDocs: Array.from(this.vault.fingerprintDocs.values()),
            meta: {
                totalDuplicatesBlocked: this.vault.totalDuplicatesBlocked,
                totalCurriculumRejected: this.vault.totalCurriculumRejected
            }
        };
    }

    async importFromJsonText(rawText) {
        const data = JSON.parse(rawText);
        if (!data || typeof data !== "object") {
            throw new Error("Tệp JSON không hợp lệ.");
        }

        let importedExams = 0;
        let importedFps = 0;

        const examsList = Array.isArray(data.exams) ? data.exams : [];
        for (const ex of examsList) {
            if (!ex || (!ex.examId && !ex.id)) continue;
            const eid = ex.examId || ex.id;
            const docId = `${this.activeVaultKey}__${eid}`;
            const cleanEx = sanitizeForFirestore({ ...ex, examId: eid, docId, vaultKey: this.activeVaultKey });
            this.vault.exams.set(eid, cleanEx);
            await this.idbPut("exams", cleanEx);
            if (this.db && this.authUser && this.fbSdk) {
                const { setDoc, doc } = this.fbSdk.fsMod;
                await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_EXAMS, docId), cleanEx);
            }
            importedExams++;
        }

        if (Array.isArray(data.fingerprintDocs)) {
            for (const fp of data.fingerprintDocs) {
                if (!fp) continue;
                const eid = fp.examId || `imp_${csprngHex(4)}`;
                const fpDocId = `${this.activeVaultKey}__fp_${eid}`;
                const cleanFp = sanitizeForFirestore({ ...fp, examId: eid, docId: fpDocId, vaultKey: this.activeVaultKey });
                this.vault.fingerprintDocs.set(fpDocId, cleanFp);
                await this.idbPut("fingerprints", cleanFp);
                if (this.db && this.authUser && this.fbSdk) {
                    const { setDoc, doc } = this.fbSdk.fsMod;
                    await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS, fpDocId), cleanFp);
                }
                importedFps++;
            }
        } else if (Array.isArray(data.questionHashes) || Array.isArray(data.sourceIds)) {
            const eid = `legacy_${Date.now()}`;
            const fpDocId = `${this.activeVaultKey}__fp_${eid}`;
            const sids = Array.isArray(data.sourceIds) ? data.sourceIds : [];
            const normTexts = Array.isArray(data.shingleItems)
                ? data.shingleItems.map((x) => String(x.preview || ""))
                : [];
            const cleanFp = sanitizeForFirestore({
                docId: fpDocId,
                vaultKey: this.activeVaultKey,
                examId: eid,
                createdAt: Date.now(),
                sourceIds: sids,
                vnSourceIds: sids.filter(isVietnameseSourceId),
                intlSourceIds: sids.filter((s) => !isVietnameseSourceId(s)),
                hashes: Array.isArray(data.questionHashes) ? data.questionHashes : [],
                normalizedTexts: normTexts,
                duplicatesBlocked: 0,
                curriculumRejected: 0
            });
            this.vault.fingerprintDocs.set(fpDocId, cleanFp);
            await this.idbPut("fingerprints", cleanFp);
            if (this.db && this.authUser && this.fbSdk) {
                const { setDoc, doc } = this.fbSdk.fsMod;
                await setDoc(doc(this.db, "artifacts", this.firebaseAppId, "public", "data", COL_FINGERPRINTS, fpDocId), cleanFp);
            }
            importedFps++;
        }

        this.rebuildInMemoryIndexes();
        this.onChange();
        return { importedExams, importedFps };
    }
}
