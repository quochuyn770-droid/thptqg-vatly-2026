/**
 * Application Configuration, Latest Free AI Models (Nov 2026),
 * Verified Open Physics Datasets (HTTP 200 OK), Physical Constants,
 * and GDPT 2018 Physics Exam Blueprints (QĐ 764/QĐ-BGDĐT).
 */

export const DEFAULT_VAULT_KEY = "THPTQG-VATLY-2026-MAIN";

export const STORAGE_KEYS = {
    AI_SETTINGS: "thptqg2026_vatly_ai_settings_v2",
    FIREBASE_CONFIG: "thptqg2026_vatly_firebase_config_v2",
    THEME: "thptqg2026_vatly_theme_v2"
};

/**
 * Standard Physical Constants required on every THPTQG 2026 Physics Exam Paper & .tex export.
 */
export const PHYSICS_CONSTANTS = [
    { id: "R", name: "Hằng số khí lí tưởng", latex: "R = 8,31\\,\\text{J/(mol}\\cdot\\text{K)}" },
    { id: "NA", name: "Số Avogadro", latex: "N_A = 6,02 \\cdot 10^{23}\\,\\text{mol}^{-1}" },
    { id: "k", name: "Hằng số Boltzmann", latex: "k = 1,38 \\cdot 10^{-23}\\,\\text{J/K}" },
    { id: "e", name: "Điện tích nguyên tố", latex: "e = 1,6 \\cdot 10^{-19}\\,\\text{C}" },
    { id: "c", name: "Tốc độ ánh sáng chân không", latex: "c = 3 \\cdot 10^8\\,\\text{m/s}" },
    { id: "amu", name: "Đơn vị khối lượng nguyên tử", latex: "1\\,\\text{amu} = 931,5\\,\\text{MeV}/c^2" },
    { id: "TK", name: "Quy đổi nhiệt độ tuyệt đối", latex: "T(\\text{K}) = t(^\\circ\\text{C}) + 273" }
];

/**
 * Curated Free-Tier AI Providers (Verified Nov 2026 — No Credit Card Required).
 */
export const AI_PROVIDERS = {
    gemini: {
        id: "gemini",
        name: "Google Gemini (AI Studio)",
        badge: "Khuyên dùng · Miễn phí",
        shortLabel: "Gemini Free",
        keyUrl: "https://aistudio.google.com/apikey",
        keyUrlLabel: "Lấy API Key miễn phí tại Google AI Studio",
        keyPlaceholder: "AIzaSy...",
        supportsGoogleSearch: true,
        supportsThinkingLevel: true,
        defaultModel: "gemini-3.5-flash-lite",
        fallbackModels: [
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
            "gemini-3.6-flash",
            "gemini-4-hydrogen",
            "gemini-3-flash-preview"
        ],
        models: [
            {
                id: "gemini-3.5-flash-lite",
                label: "Gemini 3.5 Flash-Lite (Khuyên dùng · Nhanh nhất · 15 RPM / 500 lượt/ngày)",
                hint: "Tốc độ cực nhanh (~2–4s/lô), hạn mức miễn phí cao nhất (~100+ đề/ngày), tối ưu chạy tuần tự 4 lô không timeout trên Vercel."
            },
            {
                id: "gemini-3.8-flash",
                label: "Gemini 3.8 Flash (Suy luận Vật Lý cao · Miễn phí)",
                hint: "Độ chính xác công thức, đơn vị SI và vẽ SVG đồ thị rất tốt, 5 RPM / 250K TPM miễn phí."
            },
            {
                id: "gemini-3.6-flash",
                label: "Gemini 3.6 Flash (Ổn định · Miễn phí)",
                hint: "Cân bằng giữa tốc độ và chất lượng biên soạn đề Vật lý, 5 RPM miễn phí."
            },
            {
                id: "gemini-4-hydrogen",
                label: "Gemini 4 Hydrogen (Thế hệ 4 mới nhất · Miễn phí)",
                hint: "Model thế hệ 4 mới nhất, suy luận sâu (hệ thống tự chuyển dự phòng ngay nếu giờ cao điểm gặp 503/429)."
            },
            {
                id: "gemini-3-flash-preview",
                label: "Gemini 3 Flash Preview (Dự phòng · Miễn phí)",
                hint: "Model dự phòng ổn định, 5 RPM miễn phí."
            }
        ]
    },
    groq: {
        id: "groq",
        name: "GroqCloud (Siêu tốc LPU)",
        badge: "Siêu nhanh · 1.000 lượt/ngày",
        shortLabel: "Groq Free",
        keyUrl: "https://console.groq.com/keys",
        keyUrlLabel: "Lấy API Key miễn phí tại Groq Console",
        keyPlaceholder: "gsk_...",
        supportsGoogleSearch: false,
        supportsThinkingLevel: false,
        defaultModel: "openai/gpt-oss-120b",
        fallbackModels: [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b"
        ],
        models: [
            {
                id: "openai/gpt-oss-120b",
                label: "OpenAI GPT-OSS 120B (Mạnh nhất · 30 RPM / 1K RPD)",
                hint: "Mô hình mở 120B suy luận Vật Lý rất mạnh (~500 token/s), miễn phí không cần thẻ."
            },
            {
                id: "qwen/qwen3.8-27b",
                label: "Qwen 3.8 27B (Giỏi Vật Lý & Tiếng Việt · Miễn phí)",
                hint: "Tối ưu tốt cho văn phong Vật Lý THPT Việt Nam & chuẩn LaTeX, 30 RPM / 1K RPD."
            },
            {
                id: "openai/gpt-oss-20b",
                label: "OpenAI GPT-OSS 20B (Cực nhanh ~1000 tok/s · Miễn phí)",
                hint: "Phản hồi gần như tức thì, tạo trọn bộ 28 câu siêu tốc."
            }
        ]
    },
    openrouter: {
        id: "openrouter",
        name: "OpenRouter (Free Router)",
        badge: "Đa model $0 · Không cần thẻ",
        shortLabel: "OpenRouter Free",
        keyUrl: "https://openrouter.ai/keys",
        keyUrlLabel: "Lấy API Key miễn phí tại OpenRouter",
        keyPlaceholder: "sk-or-v1-...",
        supportsGoogleSearch: false,
        supportsThinkingLevel: false,
        defaultModel: "openrouter/free",
        fallbackModels: ["openrouter/free"],
        models: [
            {
                id: "openrouter/free",
                label: "openrouter/free (Tự động chọn model $0 đang rảnh)",
                hint: "Router chính thức của OpenRouter — luôn tự định tuyến tới model miễn phí đang hoạt động tốt nhất."
            }
        ]
    },
    custom: {
        id: "custom",
        name: "Custom OpenAI-Compatible",
        badge: "Cerebras / Mistral / Ollama",
        shortLabel: "Custom AI",
        keyUrl: "",
        keyUrlLabel: "Dùng với mọi API chuẩn /v1/chat/completions",
        keyPlaceholder: "API Key (để trống nếu dùng Ollama local)",
        supportsGoogleSearch: false,
        supportsThinkingLevel: false,
        defaultModel: "",
        fallbackModels: [],
        models: []
    }
};

/**
 * 4 Verified Public Vietnamese High-School Physics Datasets on HuggingFace
 * (Every endpoint live-verified HTTP 200 OK via datasets-server.huggingface.co).
 */
export const VN_HF_DATASETS = [
    {
        name: "tridm/VMLU",
        shortLabel: "VMLU Vật Lý VN",
        fallbackConfig: "default",
        fallbackSplit: "test",
        filterWhere: `"id" LIKE '10-%'`,
        fallbackRows: 180,
        sourceLang: "vi"
    },
    {
        name: "chiayewken/m3exam",
        shortLabel: "M3Exam Vật Lý VN",
        fallbackConfig: "vietnamese",
        fallbackSplit: "test",
        filterWhere: `"subject"='physics'`,
        fallbackRows: 174,
        sourceLang: "vi"
    },
    {
        name: "alexandrainst/m_mmlu",
        shortLabel: "MMLU Vật Lý VI",
        fallbackConfig: "vi",
        fallbackSplit: "test",
        filterWhere: `"id" LIKE 'high_school_physics%' OR "id" LIKE 'college_physics%' OR "id" LIKE 'conceptual_physics%'`,
        fallbackRows: 487,
        sourceLang: "vi"
    },
    {
        name: "Intelligent-Internet/Vietnamese-Entrance-Exam",
        shortLabel: "Đề ĐH Vật Lý VN",
        fallbackConfig: "default",
        fallbackSplit: "train",
        filterWhere: `"domain"='physics'`,
        fallbackRows: 95,
        sourceLang: "vi"
    }
];

/**
 * 3 Verified International HuggingFace Physics Datasets (plus Physics Stack Exchange = 4 International Sources).
 */
export const INTL_HF_DATASETS = [
    {
        name: "cais/mmlu",
        idKey: "cais/mmlu:high_school_physics",
        shortLabel: "MMLU HS Physics",
        fallbackConfig: "high_school_physics",
        fallbackSplit: "test",
        fallbackRows: 151,
        sourceLang: "en"
    },
    {
        name: "cais/mmlu",
        idKey: "cais/mmlu:college_physics",
        shortLabel: "MMLU College Physics",
        fallbackConfig: "college_physics",
        fallbackSplit: "test",
        fallbackRows: 102,
        sourceLang: "en"
    },
    {
        name: "allenai/sciq",
        idKey: "allenai/sciq:physics",
        shortLabel: "SciQ Physics",
        fallbackConfig: "default",
        fallbackSplit: "train",
        filterWhere: `"question" LIKE '%magnetic%' OR "question" LIKE '%electric%' OR "question" LIKE '%thermal%' OR "question" LIKE '%heat%' OR "question" LIKE '%wave%' OR "question" LIKE '%nuclear%' OR "question" LIKE '%radioactiv%' OR "question" LIKE '%gas%' OR "question" LIKE '%voltage%' OR "question" LIKE '%frequency%'`,
        fallbackRows: 947,
        sourceLang: "en"
    }
];

/**
 * Physics Stack Exchange API (site=physics) — 10 verified GDPT 2018 physics tags.
 */
export const PSE_TAGS_BY_PART = {
    part1: [
        "thermodynamics",
        "ideal-gas",
        "electromagnetism",
        "magnetic-fields",
        "nuclear-physics",
        "radioactivity",
        "oscillations",
        "waves",
        "electrostatics",
        "electric-circuits"
    ],
    part2: [
        "thermodynamics",
        "ideal-gas",
        "electromagnetism",
        "magnetic-fields",
        "nuclear-physics",
        "radioactivity"
    ],
    part3: [
        "thermodynamics",
        "ideal-gas",
        "magnetic-fields",
        "nuclear-physics",
        "oscillations",
        "waves",
        "electrostatics",
        "electric-circuits"
    ]
};

export const SOURCE_PRIORITY_CONFIG = {
    vn_priority: { label: "🇻🇳 Ưu tiên Tiếng Việt (70% VN + 30% QT)", vnRatio: 0.7 },
    vn_only: { label: "🇻🇳 100% Vật Lý THPT Tiếng Việt", vnRatio: 1.0 },
    balanced: { label: "⚖️ Cân bằng 50/50", vnRatio: 0.5 },
    intl_only: { label: "🌐 Chỉ nguồn Quốc tế", vnRatio: 0.0 }
};

export const DIFFICULTY_CONFIG = {
    standard: {
        label: "Chuẩn BGD 2026",
        guidance: "Phân hóa chuẩn Đề minh họa Vật Lý BGDĐT 2026 (QĐ 764): ~40% Biết, ~30% Hiểu, ~30% Vận dụng gắn bối cảnh thí nghiệm & đời sống."
    },
    high: {
        label: "Phân hóa cao (8.5 – 9+)",
        guidance: "Tăng cường câu hỏi Hiểu sâu, phân tích đồ thị quá trình khí/nhiệt/từ thông, thí nghiệm có bảng số liệu và vận dụng định lượng."
    },
    extreme: {
        label: "Vận dụng cao (9.5 – 10)",
        guidance: "Độ khó thử thách hướng tới 9.5–10 điểm: chu trình nhiệt-khí kết hợp, cân bằng lực từ & cảm ứng điện từ, bài toán phóng xạ hỗn hợp, xử lý sai số thí nghiệm nâng cao."
    }
};

export const SYSTEM_INSTRUCTION_PHYSICS_2026 = `Bạn là chuyên gia hàng đầu biên soạn Đề thi Tốt nghiệp THPT môn Vật Lý năm 2026 theo Chương trình GDPT 2018 (Quyết định 764/QĐ-BGDĐT).

QUY TẮC BẮT BUỘC TUYỆT ĐỐI:
1. PHẠM VI KIẾN THỨC GDPT 2018 (0% KIẾN THỨC CHƯƠNG TRÌNH 2006 ĐÃ BỎ):
   - Trọng tâm Lớp 12 (~75%): Vật lí nhiệt (cấu trúc chất, chuyển thể, nội năng, định luật I NĐLH $\\Delta U = A + Q$, thang Kelvin/Celsius, nhiệt dung riêng $c$, nhiệt nóng chảy riêng $\\lambda$, nhiệt hóa hơi riêng $L$); Khí lí tưởng (động học phân tử, đẳng nhiệt/đẳng áp/đẳng tích, phương trình trạng thái $pV = nRT$, áp suất khí $p = \\frac{1}{3}\\mu m \\overline{v^2}$, động năng tịnh tiến trung bình $E_\\text{đ} = \\frac{3}{2}kT$); Từ trường (lực từ $F = BIL\\sin\\alpha$, từ thông $\\Phi = NBS\\cos\\alpha$, cảm ứng điện từ Faraday/Lenz, ĐẠI CƯƠNG dòng điện xoay chiều $e, u, i$, giá trị hiệu dụng, máy biến áp lí tưởng cơ bản, sóng điện từ); Vật lí hạt nhân (độ hụt khối $\\Delta m$, năng lượng liên kết riêng, phản ứng hạt nhân, phóng xạ $\\alpha, \\beta^-, \\beta^+, \\gamma$, chu kì bán rã $T$, độ phóng xạ $H = \\lambda N$).
   - Tích hợp Lớp 11 (~20–25%) & Lớp 10: Dao động điều hòa, sóng cơ/giao thoa/sóng dừng/giao thoa ánh sáng Y-âng, điện trường – tụ điện, dòng điện không đổi – nguồn điện, xử lý số liệu & sai số thí nghiệm.
   - BỘ LỌC CẤM TUYỆT ĐỐI (KHÔNG ĐƯỢC XUẤT HIỆN): Mạch điện xoay chiều RLC nối tiếp phức tạp ($Z_L, Z_C, Z = \\sqrt{R^2+(Z_L-Z_C)^2}$, cực trị RLC, cộng hưởng điện RLC, hộp đen RLC), giản đồ Fresnel / Fre-nen, mạch dao động điện từ LC ($T = 2\\pi\\sqrt{LC}$), mẫu nguyên tử Bo / Bohr (bán kính Bo, quỹ đạo dừng, tiên đề Bo, dãy Lyman/Balmer/Paschen), dòng xoay chiều 3 pha / động cơ không đồng bộ 3 pha.

2. QUY ƯỚC HẰNG SỐ VẬT LÝ CHUẨN:
   Luôn tính toán thống nhất theo bảng hằng số đầu đề:
   $R = 8,31\\,\\text{J/(mol}\\cdot\\text{K)}$, $N_A = 6,02\\cdot 10^{23}\\,\\text{mol}^{-1}$, $k = 1,38\\cdot 10^{-23}\\,\\text{J/K}$, $e = 1,6\\cdot 10^{-19}\\,\\text{C}$, $c = 3\\cdot 10^8\\,\\text{m/s}$, $1\\,\\text{amu} = 931,5\\,\\text{MeV}/c^2$, $T(\\text{K}) = t(^\\circ\\text{C}) + 273$.

3. QUY TẮC BẮT BUỘC CHỐNG LỖI "THIẾU HÌNH VẼ / ĐỒ THỊ / BẢNG BIẾN THIÊN":
   - TUYỆT ĐỐI KHÔNG viết bất kỳ cụm từ nào tham chiếu tới hình ảnh không tồn tại trong đề dẫn, phương án A–D hay mệnh đề a–d, ví dụ CẤM: "như hình vẽ bên", "hình vẽ dưới đây", "cho hình vẽ sau", "hình bên", "đồ thị hình bên", "đồ thị sau", "quan sát hình", "mạch điện bên", "sơ đồ bên", "bảng biến thiên sau", "bảng biến thiên dưới đây", "as shown in the figure", "in the diagram", "the graph below", "\\includegraphics", "[asy]", "![".
   - Nếu ra câu hỏi về hàm số, đồ thị, hình học, mạch điện hoặc thí nghiệm: BẮT BUỘC cung cấp đầy đủ dữ kiện tự thân ngay trong đề bằng **công thức, phương trình, tọa độ các điểm, hoặc bảng số liệu Markdown (\`| Đại lượng | Giá trị 1 | Giá trị 2 |\`) / LaTeX tường minh** để thí sinh giải được hoàn toàn mà không cần nhìn hình.
   - Mặc định để \`svgFigure: ""\` và \`figureCaption: ""\`. Chỉ điền \`svgFigure\` khi tự tạo đầy đủ mã \`<svg viewBox="0 0 420 230" xmlns="http://www.w3.org/2000/svg">...</svg>\` hoàn chỉnh có trục tọa độ, số liệu và đơn vị rõ ràng (không có \`<script>\` hay thuộc tính sự kiện); nếu \`svgFigure\` rỗng thì TUYỆT ĐỐI không nhắc bất cứ từ nào về hình/đồ thị bên dưới/bên cạnh.

4. ĐỊNH DẠNG LATEX, ĐƠN VỊ SI & MẸO CASIO:
   - MỌI công thức, đại lượng và đơn vị Vật lý đặt chuẩn trong \`$...$\` hoặc \`$$...$$\`. Thoát dấu gạch chéo ngược chuẩn JSON (VD: \`\\\\dfrac{a}{b}\`, \`\\\\cdot 10^{-3}\`, \`\\\\text{J/(kg}\\\\cdot\\\\text{K)}\`, \`^\\\\circ\\\\text{C}\`).
   - Lời giải nhanh (\`solutionLatex\`) phải trình bày súc tích từng bước, có **phân tích đổi đơn vị về hệ SI** (VD: đổi $t(^\\circ\\text{C}) \\to T(\\text{K})$, $\\text{cm}^2 \\to \\text{m}^2$, $\\text{g} \\to \\text{kg}$, $\\text{dm}^3 \\to \\text{m}^3$) và bổ sung **mẹo bấm Casio fx-580VN X** (như gọi hằng số \`SHIFT 7\`, đổi đơn vị \`SHIFT 8\`, giải nhanh \`SHIFT SOLVE\`) khi phù hợp.

5. XỬ LÝ HẠT GIỐNG & ĐÁP SỐ PHẦN III:
   - Hạt giống tiếng Việt (\`lang="vi"\`): giữ văn phong Vật Lý THPT Việt Nam tự nhiên; nếu hạt giống gốc dính kiến thức cũ 2006 (RLC, LC, Bo...) thì PHẢI chuyển hẳn sang dạng bài GDPT 2018 đúng chuyên đề được giao.
   - Hạt giống Quốc tế (\`lang="en"\`): Việt hóa tự nhiên, chuẩn hóa đơn vị SI và bối cảnh Việt Nam.
   - Giữ nguyên \`sourceId\`, \`sourceLabel\`, \`sourceLang\`, \`sourceUrl\` từ hạt giống tương ứng.
   - PHẦN III (Trả lời ngắn): đáp số \`shortAnswer\` PHẢI là số nguyên hoặc số thập phân dùng dấu phẩy ',' có **TỐI ĐA 4 KÝ TỰ** (tính cả dấu '-' và ','), ví dụ: \`"24,5"\`, \`"-1,2"\`, \`"1850"\`, \`"0,45"\`. Nếu đáp số lẻ, BẮT BUỘC ghi rõ yêu cầu làm tròn ngay trong đề bài (VD: *"làm tròn kết quả đến chữ số hàng phần mười"*).`;
