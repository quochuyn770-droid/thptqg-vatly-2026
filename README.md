# THPTQG 2026 Vật Lý — Source Harvester & LaTeX Exam Studio

Website độc lập **Kéo Nguồn Thực Tế & Tạo Đề Thi THPTQG Môn Vật Lý 2026** chuẩn **Chương trình GDPT 2018 (Quyết định 764/QĐ-BGDĐT)**, chạy trực tiếp trên mọi trình duyệt (điện thoại & máy tính), hỗ trợ triển khai miễn phí trên **Vercel**, **Netlify** hoặc **Node.js ≥ 20** (0 dependency ngoài).

## Tính năng nổi bật

1. **Ma trận đề thi chuẩn 28 câu (50 phút · 10 điểm — QĐ 764/QĐ-BGDĐT):**
   - **PHẦN I (4,5 điểm):** 18 câu trắc nghiệm 4 chọn 1 (0,25 đ/câu).
   - **PHẦN II (4,0 điểm):** 4 câu Đúng/Sai (16 mệnh đề a, b, c, d), mỗi câu gồm đề dẫn thí nghiệm / bảng số liệu / đồ thị SVG phủ 4 chương trọng tâm Lớp 12.
   - **PHẦN III (1,5 điểm):** 6 câu trả lời ngắn (0,25 đ/câu), đáp số tối đa **4 ký tự** (tính cả dấu `-` và dấu phẩy `,`), ghi rõ quy tắc làm tròn khi số lẻ.
2. **Phạm vi kiến thức GDPT 2018 & Bộ lọc cấm 0% chương trình 2006:**
   - **Trọng tâm Lớp 12 (~75%):** Vật lí nhiệt, Khí lí tưởng, Từ trường – Cảm ứng điện từ – Đại cương dòng điện xoay chiều – Sóng điện từ, Vật lí hạt nhân & Phóng xạ.
   - **Tích hợp Lớp 11 (~20–25%) & Lớp 10:** Dao động điều hòa, Sóng cơ & Giao thoa/Sóng dừng, Điện trường – Tụ điện, Dòng điện không đổi & Nguồn điện, Xử lý số liệu & Sai số thí nghiệm.
   - **Bộ lọc cấm 3 tầng (Prompt + Harvester + Hậu kiểm định):** Chặn tuyệt đối mạch RLC nối tiếp phức tạp ($Z_L, Z_C, Z$, cực trị RLC), giản đồ Fresnel, mạch dao động LC, mẫu nguyên tử Bo, dòng 3 pha 2006.
3. **Bảng Hằng số Vật lý chuẩn & Chống lỗi "thiếu hình vẽ" + Đồ thị SVG nội tuyến:**
   - Gắn sẵn khung Hằng số chuẩn đầu đề thi, bản In/PDF và file `.tex`: $R = 8,31\,\text{J/(mol}\cdot\text{K)}$, $N_A = 6,02 \cdot 10^{23}\,\text{mol}^{-1}$, $k = 1,38 \cdot 10^{-23}\,\text{J/K}$, $e = 1,6 \cdot 10^{-19}\,\text{C}$, $c = 3 \cdot 10^8\,\text{m/s}$, $1\,\text{amu} = 931,5\,\text{MeV}/c^2$, $T(\text{K}) = t(^\circ\text{C}) + 273$.
   - Tự động chặn câu hỏi nhắc *"như hình vẽ bên"* / *"quan sát đồ thị sau"* khi không có đồ thị SVG nội tuyến (đã lọc XSS) hoặc bảng số liệu tường minh.
4. **8 nguồn Vật lý mở đã kiểm chứng `200 OK` qua proxy `/api/harvest` phía server (chống CORS):**
   - **4 kho Vật Lý THPT Tiếng Việt (HuggingFace):** `tridm/VMLU` (`10-%`), `chiayewken/m3exam` (`vietnamese/physics`), `alexandrainst/m_mmlu` (`vi` physics), `Intelligent-Internet/Vietnamese-Entrance-Exam` (`physics`).
   - **4 kho Quốc tế:** Physics Stack Exchange (`site=physics`, 10 tags GDPT 2018), `cais/mmlu` (`high_school_physics` & `college_physics`), `allenai/sciq` (lọc chủ đề Vật lý).
5. **Chia 4 lô gọi AI tuần tự (không timeout Vercel) + Nút Copy chia nhỏ cho điện thoại:**
   - Lô 1: Phần I (1–9) → Lô 2: Phần I (10–18) → Lô 3: Phần II (1–4) → Lô 4: Phần III (1–6).
   - Nút Copy có icon 2 tờ giấy chồng lên nhau + bộ đếm ký tự: Phần I (1–9), Phần I (10–18), Phần I (1–18), Phần II (1–4), Phần III (1–6), Đáp án & Gợi ý giải nhanh (có đổi đơn vị SI & mẹo bấm Casio fx-580VN X).
6. **AI Miễn Phí (Gemini / GroqCloud / OpenRouter / Custom), Lưu bền vững bằng IndexedDB + Xuất/Nhập `.json`, 128-bit CSPRNG & Chống trùng lặp 3 lớp (Source ID + SHA-256 + 3-Gram Jaccard).**

---

## Triển khai miễn phí

### 1. Deploy lên Vercel (Khuyên dùng)
1. Import repository `quochuyn770-droid/thptqg-vatly-2026` vào [vercel.com](https://vercel.com) → bấm **Deploy** (`vercel.json` đã cấu hình sẵn `outputDirectory: "public"` và `api/ai.js` 60s, `api/harvest.js` 30s).
2. *(Tùy chọn ẩn API Key)*: Thêm biến môi trường `GEMINI_API_KEY`, `GROQ_API_KEY` hoặc `OPENROUTER_API_KEY` trong **Project Settings → Environment Variables** rồi **Redeploy**.

### 2. Deploy lên Netlify
Import repository vào [app.netlify.com](https://app.netlify.com) (`netlify.toml` đã cấu hình sẵn `publish = "public"` và `/api/* → /.netlify/functions/*`).

### 3. Chạy trên máy cá nhân (Node.js ≥ 20, không cần `npm install`)
```bash
cp .env.example .env    # (Tùy chọn) điền GEMINI_API_KEY / GROQ_API_KEY
npm start               # Mở http://localhost:3000
```

## Kiểm thử tự động

```bash
npm test
```