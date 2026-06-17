// Render the structured resume into a PDF matching the user's base format.
import PDFDocument from "pdfkit";

const MARGINS = { top: 30, bottom: 26, left: 48, right: 48 };

// Build the resume layout into an existing PDFDocument (does not end the doc).
// `scale` (<=1) shrinks fonts + spacing so a longer resume still fits one page.
function renderResume(doc, r, scale = 1) {
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const BLACK = "#000000";

  // sizes tuned to fill one full page; multiplied by scale when content is long
  const B = { name: 15.5, contact: 8.9, hdr: 9.9, comp: 9.1, title: 8.6, body: 8.5, lead: 9.6 };
  const S = Object.fromEntries(Object.entries(B).map(([k, v]) => [k, v * scale]));

  const moveY = dy => { doc.y += dy * scale; };
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
    moveY(2.5);
    doc.font("Times-Bold").fontSize(S.hdr).fillColor(BLACK).text(title.toUpperCase(), L, doc.y, { width: W });
    const y = doc.y + 1.5 * scale;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(BLACK).stroke();
    doc.y = y + 3 * scale;
  }

  // two text columns on one baseline (left + right-aligned right)
  function splitRow(leftText, rightText, font, size) {
    const y = doc.y;
    doc.font(font).fontSize(size).fillColor(BLACK);
    doc.text(rightText, L, y, { width: W, align: "right" });   // right first (sets line height)
    doc.text(leftText, L, y, { width: W * 0.72, align: "left", lineBreak: false });
    doc.y = y + size * 1.16;
  }

  const GX = 12; // hanging-indent: x offset of bullet text from left margin
  function bullet(text) {
    const y = doc.y;
    doc.font("Times-Roman").fontSize(S.body).fillColor(BLACK);
    doc.text("•", L + 2, y, { lineBreak: false });
    doc.text(text, L + GX, y, { width: W - GX, align: "justify", lineGap: 0.5, paragraphGap: 1.2 });
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
    moveY(1);
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
}

// Count how many pages the resume needs at a given scale (renders to a throwaway doc).
function pageCountAt(r, scale) {
  const doc = new PDFDocument({ size: "LETTER", margins: MARGINS, bufferPages: true });
  doc.on("data", () => {});           // drain so it doesn't block
  doc.on("error", () => {});
  renderResume(doc, r, scale);
  const n = doc.bufferedPageRange().count;
  doc.end();
  return n;
}

// Largest scale (<=1) that keeps the resume on a single page.
function fitScale(r) {
  for (const s of [1, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8]) {
    try { if (pageCountAt(r, s) <= 1) return s; } catch { /* */ }
  }
  return 0.8;
}

export function streamStructuredResumePdf(res, r, downloadName) {
  const scale = fitScale(r);
  const doc = new PDFDocument({ size: "LETTER", margins: MARGINS });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  doc.pipe(res);
  renderResume(doc, r, scale);
  doc.end();
}

// Same resume layout, collected into a Buffer (for bundling into the Apply Kit zip).
export function resumePdfBuffer(r) {
  const scale = fitScale(r);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: MARGINS });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderResume(doc, r, scale);
    doc.end();
  });
}

// Render a simple, clean business-letter cover letter.
function renderCoverLetter(doc, { name, contact, company, title, body, date }) {
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const BLACK = "#000000";

  doc.font("Times-Bold").fontSize(15).fillColor(BLACK).text(name || "Candidate", L, doc.y, { width: W, align: "left" });
  if (contact) doc.font("Times-Roman").fontSize(9.5).fillColor("#333").text(contact, L, doc.y + 1, { width: W });
  doc.moveDown(0.8);
  doc.font("Times-Roman").fontSize(10).fillColor(BLACK).text(date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), L, doc.y, { width: W });
  doc.moveDown(0.4);
  if (company || title) {
    doc.font("Times-Roman").fontSize(10.5).fillColor(BLACK).text(`Re: ${title || "Application"}${company ? " — " + company : ""}`, L, doc.y, { width: W });
    doc.moveDown(0.6);
  }
  doc.font("Times-Roman").fontSize(11).fillColor(BLACK).text(body || "", L, doc.y, { width: W, align: "left", lineGap: 2.5, paragraphGap: 6 });
  doc.end();
}

export function coverLetterPdfBuffer(opts) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 56, bottom: 56, left: 64, right: 64 } });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderCoverLetter(doc, opts);
  });
}
