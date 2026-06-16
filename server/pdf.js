// Render a plain-text resume into a clean, ATS-friendly PDF (serif, sectioned).
import PDFDocument from "pdfkit";

const HEADERS = new Set([
  "SUMMARY", "PROFESSIONAL SUMMARY", "OBJECTIVE", "PROFILE",
  "EXPERIENCE", "PROFESSIONAL EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT HISTORY",
  "SKILLS", "CORE SKILLS", "TECHNICAL SKILLS", "KEY SKILLS",
  "ATS KEYWORDS", "PROJECTS", "CERTIFICATIONS", "CERTIFICATION",
  "EDUCATION", "ACHIEVEMENTS", "TARGET ROLE", "TARGET"
]);

function isHeader(line) {
  const t = line.trim().replace(/:$/, "");
  if (HEADERS.has(t.toUpperCase())) return true;
  // a short ALL-CAPS line with no lowercase letters
  if (t.length >= 3 && t.length <= 44 && /[A-Z]/.test(t) && !/[a-z]/.test(t) && !/^[-•*]/.test(t)) return true;
  return false;
}

export function streamResumePdf(res, text, downloadName) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 46, bottom: 40, left: 54, right: 54 } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const lines = (text || "").replace(/\r/g, "").split("\n");

  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  // Name
  if (i < lines.length) {
    doc.font("Times-Bold").fontSize(17).fillColor("#111111").text(lines[i].trim(), { align: "center" });
    i++;
  }
  // Contact line (centered) if it looks like contact info
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /[|@]|\(?\d{3}\)?[ -.]?\d{3}/.test(lines[i])) {
    doc.font("Times-Roman").fontSize(9).fillColor("#333333").text(lines[i].trim(), { align: "center" });
    i++;
  }
  // Optional "Target:" line centered italic
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^target\b/i.test(lines[i].trim())) {
    doc.font("Times-Italic").fontSize(9).fillColor("#444444").text(lines[i].trim(), { align: "center" });
    i++;
  }
  doc.moveDown(0.4);
  doc.fillColor("#111111");

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { doc.moveDown(0.28); continue; }

    if (isHeader(line)) {
      doc.moveDown(0.22);
      doc.font("Times-Bold").fontSize(10.5).fillColor("#0b3d5c").text(line.replace(/:$/, "").toUpperCase());
      const y = doc.y + 1.5;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor("#0b3d5c").stroke();
      doc.strokeColor("#111111").fillColor("#111111");
      doc.moveDown(0.45);
      continue;
    }

    if (/^[-•*]\s+/.test(line)) {
      const t = line.replace(/^[-•*]\s+/, "");
      doc.font("Times-Roman").fontSize(9).fillColor("#111111")
        .text("•  " + t, { align: "justify", indent: 6, paragraphGap: 1.5 });
    } else {
      // sub-headers like "Company — Role | Dates": render slightly bold if it has a separator
      const looksLikeRole = /[—|]|\b(20\d\d|19\d\d)\b/.test(line) && line.length < 110;
      doc.font(looksLikeRole ? "Times-Bold" : "Times-Roman").fontSize(9).fillColor("#111111")
        .text(line, { align: "left", paragraphGap: 1.5 });
    }
  }
  doc.end();
}
