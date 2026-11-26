import { PHYSICS_CONSTANTS } from "./config.js";

/**
 * LaTeX Serializers for Mobile-Safe Split Copy Buttons (Part I 1-9, 10-18, 1-18; Part II 1-4; Part III 1-6; Answers)
 * + Standard Physical Constants Box + Complete Compilable .tex Document Export.
 */

export function buildConstantsLatex() {
    const items = PHYSICS_CONSTANTS.map((c) => `$${c.latex}$`);
    const row1 = items.slice(0, 4).join("; \\quad ");
    const row2 = items.slice(4).join("; \\quad ");
    return [
        "% BẢNG HẰNG SỐ VẬT LÝ CHUẨN THPTQG 2026",
        "\\noindent\\fbox{\\begin{minipage}{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule\\relax}",
        "\\textbf{Cho biết các hằng số vật lí:}\\\\",
        `${row1};\\\\`,
        `${row2}.`,
        "\\end{minipage}}"
    ].join("\n");
}

function buildSvgTexNote(q) {
    if (!q || !q.svgFigure) return "";
    const caption = q.figureCaption ? String(q.figureCaption).trim() : "Đồ thị / sơ đồ minh họa SVG (hiển thị trực tiếp trên giao diện web)";
    return `\n\\textit{[Hình minh họa: ${caption}]}`;
}

export function formatSinglePart1Latex(q) {
    return [
        `\\textbf{Câu ${q.number}.} ${q.stemLatex}${buildSvgTexNote(q)}`,
        `\\textbf{A.} ${q.optionA}`,
        `\\textbf{B.} ${q.optionB}`,
        `\\textbf{C.} ${q.optionC}`,
        `\\textbf{D.} ${q.optionD}`
    ].join("\n");
}

export function formatSinglePart2Latex(q) {
    const stLines = (q.statements || []).map((st) => `${st.label}) ${st.statementLatex}`);
    return [
        `\\textbf{Câu ${q.number}.} ${q.stemLatex}${buildSvgTexNote(q)}`,
        ...stLines
    ].join("\n");
}

export function formatSinglePart3Latex(q) {
    return `\\textbf{Câu ${q.number}.} ${q.stemLatex}${buildSvgTexNote(q)}`;
}

export function buildPart1LatexSlice(exam, startIdx, endIdx, subtitle) {
    const header = `% PHẦN I: TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN (${subtitle}) - MÃ ĐỀ ${exam.examCode}\n\\section*{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (${subtitle})}`;
    const body = (exam.part1 || []).slice(startIdx, endIdx).map(formatSinglePart1Latex).join("\n\n");
    return `${header}\n\n${body}`;
}

export function buildPart2Latex(exam) {
    const header = `% PHẦN II: TRẮC NGHIỆM ĐÚNG SAI (CÂU 1-4) - MÃ ĐỀ ${exam.examCode}\n\\section*{PHẦN II. Câu trắc nghiệm đúng sai}`;
    const body = (exam.part2 || []).map(formatSinglePart2Latex).join("\n\n");
    return `${header}\n\n${body}`;
}

export function buildPart3Latex(exam) {
    const header = `% PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (CÂU 1-6) - MÃ ĐỀ ${exam.examCode}\n\\section*{PHẦN III. Câu trắc nghiệm trả lời ngắn}`;
    const body = (exam.part3 || []).map(formatSinglePart3Latex).join("\n\n");
    return `${header}\n\n${body}`;
}

export function buildAnswersLatex(exam) {
    const p1Key = (exam.part1 || []).map((q) => `${q.number}.${q.correctOption}`).join(" | ");
    const p2Key = (exam.part2 || []).map((q) => {
        const code = (q.statements || []).map((s) => `${s.label}-${s.isTrue ? "Đ" : "S"}`).join(", ");
        return `Câu ${q.number}: ${code}`;
    }).join(" ; ");
    const p3Key = (exam.part3 || []).map((q) => `Câu ${q.number}: ${q.shortAnswer}`).join(" | ");

    const p1Sol = (exam.part1 || []).map((q) => `\\textbf{Câu ${q.number} (${q.correctOption}).} ${q.solutionLatex}`).join("\n");
    const p2Sol = (exam.part2 || []).map((q) => {
        const code = (q.statements || []).map((s) => `${s.label}-${s.isTrue ? "Đ" : "S"}`).join(", ");
        return `\\textbf{Câu ${q.number} (${code}).} ${q.solutionLatex}`;
    }).join("\n");
    const p3Sol = (exam.part3 || []).map((q) => `\\textbf{Câu ${q.number} (Đáp số: ${q.shortAnswer}).} ${q.solutionLatex}`).join("\n");

    return [
        `% BẢNG ĐÁP ÁN & GỢI Ý GIẢI NHANH (SI + CASIO fx-580VN X) - MÃ ĐỀ ${exam.examCode}`,
        `\\section*{BẢNG ĐÁP ÁN NHANH}`,
        `\\textbf{Phần I (18 câu):} ${p1Key}`,
        `\\textbf{Phần II (4 câu):} ${p2Key}`,
        `\\textbf{Phần III (6 câu):} ${p3Key}`,
        "",
        `\\section*{HƯỚNG DẪN GIẢI NHANH (ĐƠN VỊ SI \\& MẸO CASIO fx-580VN X)}`,
        `\\subsection*{Phần I}`,
        p1Sol,
        "",
        `\\subsection*{Phần II}`,
        p2Sol,
        "",
        `\\subsection*{Phần III}`,
        p3Sol
    ].join("\n");
}

export function buildFullTexDocument(exam) {
    return [
        "\\documentclass[12pt,a4paper]{article}",
        "\\usepackage[utf8]{vietnam}",
        "\\usepackage{amsmath,amssymb,amsfonts,array,booktabs}",
        "\\usepackage[margin=2cm]{geometry}",
        "\\begin{document}",
        "\\begin{center}",
        `\\textbf{\\large ĐỀ THI MINH HỌA TỐT NGHIỆP THPT NĂM 2026 — MÔN VẬT LÍ}\\\\`,
        `\\textit{Chương trình GDPT 2018 (QĐ 764/QĐ-BGDĐT) · Thời gian làm bài: 50 phút · 28 câu · Mã đề: ${exam.examCode}}`,
        "\\end{center}",
        "",
        buildConstantsLatex(),
        "",
        buildPart1LatexSlice(exam, 0, 18, "Câu 1–18"),
        "",
        buildPart2Latex(exam),
        "",
        buildPart3Latex(exam),
        "",
        "\\newpage",
        buildAnswersLatex(exam),
        "\\end{document}"
    ].join("\n");
}
