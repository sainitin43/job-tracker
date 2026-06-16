// Render the structured resume into a PDF matching the user's base format.
import PDFDocument from "pdfkit";

export function streamStructuredResumePdf(res, r, downloadName) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 30, bottom: 24, left: 46, right: 46 } });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  doc.pipe(res);

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const BLACK = "#000000";

  // sizes tuned to fill one full page with this resume's volume
  const S = { name: 15, contact: 8.6, hdr: 9.4, comp: 8.6, title: 8.2, body: 8.0, lead: 9.2 };

  const moveY = dy => { doc.y += dy; };

  function header() {
    doc.font("Times-Bold").fontSize(S.name).fillColor(BLACK).text(r.name, L, doc.y, { width: W, align: "center" });
    doc.font("Times-Roman").fontSize(S.contact).text(r.contact, L, doc.y + 1, { width: W, align: "center" });
    moveY(4);
  }

  function section(title) {
    moveY(3);
    doc.font("Times-Bold").fontSize(S.hdr).fillColor(BLACK).text(title.toUpperCase(), L, doc.y, { width: W });
    const y = doc.y + 1.5;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(BLACK).stroke();
    doc.y = y + 2.6;
  }

  // two text columns on one baseline (left + right-aligned right)
  function splitRow(leftText, rightText, font, size) {
    const y = doc.y;
    doc.font(font).fontSize(size).fillColor(BLACK);
    doc.text(rightText, L, y, { width: W, align: "right" });   // right first (sets line height)
    doc.text(leftText, L, y, { width: W * 0.72, align: "left", lineBreak: false });
    doc.y = y + size * 1.16;
  }

  function bullet(text) {
    doc.font("Times-Roman").fontSize(S.body).fillColor(BLACK);
    doc.text("•  " + text, L, doc.y, { width: W, align: "justify", lineGap: 0.2, indent: 8, paragraphGap: 0.6 });
  }

  function labeled(label, value) {
    const y = doc.y;
    doc.font("Times-Bold").fontSize(S.body).fillColor(BLACK).text(label + ":  ", L, y, { continued: true });
    doc.font("Times-Roman").fontSize(S.body).text(value, { width: W, lineGap: 0.4, paragraphGap: 1.4 });
  }

  header();

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
    doc.font("Times-Bold").fontSize(S.body).fillColor(BLACK).text("•  " + p.title + ": ", L, doc.y, { continued: true, indent: 8 });
    doc.font("Times-Roman").fontSize(S.body).text(p.text, { width: W, lineGap: 0.2, paragraphGap: 0.6 });
  });

  section("Skills");
  r.skills.forEach(s => labeled(s.label, s.value));

  section("Certifications");
  bullet(r.certifications);

  section("Education");
  splitRow(r.education.left, r.education.right, "Times-Bold", S.comp);

  doc.end();
}
