// Render the structured resume into a PDF matching the user's base format.
import PDFDocument from "pdfkit";

export function streamStructuredResumePdf(res, r, downloadName) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 22, bottom: 16, left: 42, right: 42 } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const BLACK = "#000000";

  // sizes tuned to fill one full page with this resume's volume
  const S = { name: 13.5, contact: 8, hdr: 8.7, comp: 7.9, title: 7.5, body: 7.2, lead: 8.2 };

  const moveY = dy => { doc.y += dy; };

  const LINK = "#0b3d8c";
  function header() {
    doc.font("Times-Bold").fontSize(S.name).fillColor(BLACK).text(r.name, L, doc.y, { width: W, align: "center" });

    // Contact line centered, with email (mailto) and LinkedIn/URLs (https) as clickable links
    doc.font("Times-Roman").fontSize(S.contact);
    const parts = (r.contact || "").split("|").map(s => s.trim()).filter(Boolean);
    const y = doc.y + 1;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const cls = /@/.test(part) && !/linkedin|https?:/i.test(part) ? "email"
        : /linkedin|github|https?:|\.com\//i.test(part) ? "link" : "plain";
      const url = cls === "email" ? "mailto:" + part : cls === "link" ? (part.startsWith("http") ? part : "https://" + part) : null;
      const opt = { continued: true, underline: cls !== "plain", link: url };
      doc.fillColor(cls === "plain" ? BLACK : LINK);
      if (i === 0) doc.text(part, L, y, { width: W, align: "center", ...opt });
      else doc.text(part, opt);
      if (!isLast) doc.fillColor(BLACK).text("  |  ", { continued: true, underline: false, link: null });
    });
    doc.text("", { continued: false }); // flush + center the line
    doc.fillColor(BLACK);
    moveY(4);
  }

  function section(title) {
    moveY(1.5);
    doc.font("Times-Bold").fontSize(S.hdr).fillColor(BLACK).text(title.toUpperCase(), L, doc.y, { width: W });
    const y = doc.y + 1.5;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(BLACK).stroke();
    doc.y = y + 1.8;
  }

  // two text columns on one baseline (left + right-aligned right)
  function splitRow(leftText, rightText, font, size) {
    const y = doc.y;
    doc.font(font).fontSize(size).fillColor(BLACK);
    doc.text(rightText, L, y, { width: W, align: "right" });   // right first (sets line height)
    doc.text(leftText, L, y, { width: W * 0.72, align: "left", lineBreak: false });
    doc.y = y + size * 1.05;
  }

  const GX = 12; // hanging-indent: x offset of bullet text from left margin
  function bullet(text) {
    const y = doc.y;
    doc.font("Times-Roman").fontSize(S.body).fillColor(BLACK);
    doc.text("•", L + 2, y, { lineBreak: false });
    doc.text(text, L + GX, y, { width: W - GX, align: "justify", lineGap: 0.1, paragraphGap: 0.4 });
  }

  function labeled(label, value) {
    const y = doc.y;
    doc.font("Times-Bold").fontSize(S.body).fillColor(BLACK).text(label + ":  ", L, y, { continued: true });
    doc.font("Times-Roman").fontSize(S.body).text(value, { width: W, lineGap: 0.4, paragraphGap: 1.4 });
  }

  header();

  if (r.summary) {
    section("Professional Summary");
    doc.font("Times-Roman").fontSize(S.body).fillColor(BLACK).text(r.summary, L, doc.y, { width: W, align: "justify", lineGap: 0.2, paragraphGap: 0.6 });
  }

  section("Professional Experience");
  r.experience.forEach((e, idx) => {
    if (idx > 0) moveY(0.5);
    splitRow(e.company, e.location, "Times-Bold", S.comp);
    splitRow(e.title, e.dates, "Times-Italic", S.title);
    moveY(0.3);
    e.bullets.forEach(bullet);
  });

  section("Projects");
  r.projects.forEach(p => {
    const y = doc.y;
    doc.font("Times-Roman").fontSize(S.body).fillColor(BLACK).text("•", L + 2, y, { lineBreak: false });
    doc.font("Times-Bold").fontSize(S.body).text(p.title + ": ", L + GX, y, { width: W - GX, continued: true });
    doc.font("Times-Roman").fontSize(S.body).text(p.text, { align: "justify", lineGap: 0.2, paragraphGap: 0.6 });
  });

  section("Skills");
  r.skills.forEach(s => labeled(s.label, s.value));

  section("Certifications");
  bullet(r.certifications);

  section("Education");
  splitRow(r.education.left, r.education.right, "Times-Bold", S.comp);

  doc.end();
}
