// Render the structured resume into a PDF matching the user's base format.
import PDFDocument from "pdfkit";

export function streamStructuredResumePdf(res, r, downloadName) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 24, bottom: 18, left: 44, right: 44 } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const BLACK = "#000000";

  // sizes tuned to fill one full page with this resume's volume
  const S = { name: 14.5, contact: 8.4, hdr: 9.2, comp: 8.4, title: 7.9, body: 7.7, lead: 8.8 };

  const moveY = dy => { doc.y += dy; };

  const LINK = "#0b3d8c";
  function header() {
    doc.font("Times-Bold").fontSize(S.name).fillColor(BLACK).text(r.name, L, doc.y, { width: W, align: "center" });

    // Contact line — manually centered so links render with friendly labels and no overlap
    doc.font("Times-Roman").fontSize(S.contact);
    const segs = (r.contact || "").split("|").map(s => s.trim()).filter(Boolean).map(p => {
      if (/@/.test(p) && !/linkedin|github|https?:/i.test(p)) return { label: p, link: "mailto:" + p };
      if (/linkedin/i.test(p)) return { label: "LinkedIn", link: p.startsWith("http") ? p : "https://" + p };
      if (/github/i.test(p)) return { label: "GitHub", link: p.startsWith("http") ? p : "https://" + p };
      if (/https?:|\.com\//i.test(p)) return { label: p.replace(/^https?:\/\//, ""), link: p.startsWith("http") ? p : "https://" + p };
      return { label: p, link: null };
    });

    const sep = "   |   ";
    const sepW = doc.widthOfString(sep);
    const total = segs.reduce((a, s, i) => a + doc.widthOfString(s.label) + (i < segs.length - 1 ? sepW : 0), 0);
    const y = doc.y + 2;
    const h = doc.currentLineHeight();
    let x = L + Math.max(0, (W - total) / 2);

    segs.forEach((s, i) => {
      const w = doc.widthOfString(s.label);
      if (s.link) {
        doc.fillColor(LINK).text(s.label, x, y, { lineBreak: false });
        doc.moveTo(x, y + h - 1.5).lineTo(x + w, y + h - 1.5).lineWidth(0.5).strokeColor(LINK).stroke();
        doc.link(x, y, w, h, s.link);
      } else {
        doc.fillColor(BLACK).text(s.label, x, y, { lineBreak: false });
      }
      x += w;
      if (i < segs.length - 1) {
        doc.fillColor(BLACK).text(sep, x, y, { lineBreak: false });
        x += sepW;
      }
    });
    doc.fillColor(BLACK).strokeColor(BLACK);
    doc.y = y + h;
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
    doc.y = y + size * 1.07;
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
    if (idx > 0) moveY(1);
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
  const edu = Array.isArray(r.education) ? r.education : [r.education];
  edu.forEach(ed => splitRow(ed.left, ed.right, "Times-Bold", S.comp));

  doc.end();
}
