import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';
/** Noto Sans Bengali (SIL OFL 1.1, assets/fonts/OFL.txt); Latin text uses built-in Helvetica. */
const FONT_DIR = resolve(process.cwd(), 'assets/fonts');
const BN = resolve(FONT_DIR, 'NotoSansBengali-Regular.ttf');
const BN_BOLD = resolve(FONT_DIR, 'NotoSansBengali-Bold.ttf');
const BENGALI = /[ঀ-৿]/;
export interface Branding {
  name: string;
  nameBn: string | null;
  campus: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  eiin: string | null;
  logo: Buffer | null;
  footer: string | null;
  principalName: string | null;
  accent: string;
}
/** Splits text into runs of Bengali and non-Bengali characters; spaces stay with the run. */
export function scriptRuns(text: string) {
  const runs: { text: string; bengali: boolean }[] = [];
  for (const ch of text) {
    const bengali = BENGALI.test(ch);
    const last = runs[runs.length - 1];
    if (last && (last.bengali === bengali || /\s/.test(ch))) last.text += ch;
    else runs.push({ text: ch, bengali });
  }
  return runs;
}
type Doc = InstanceType<typeof PDFDocument>;
export function newDocument(options: PDFKit.PDFDocumentOptions = {}) {
  const doc = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true, ...options });
  if (existsSync(BN)) doc.registerFont('bn', BN);
  if (existsSync(BN_BOLD)) doc.registerFont('bn-bold', BN_BOLD);
  return doc;
}
/** Writes mixed Bangla/English text, switching fonts per run so both scripts render. */
export function write(
  doc: Doc,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    color?: string;
    x?: number;
    y?: number;
    width?: number;
  } = {},
) {
  const runs = scriptRuns(text || ' ');
  doc.fontSize(opts.size ?? 11).fillColor(opts.color ?? '#172b27');
  const fontFor = (bengali: boolean) =>
    bengali
      ? opts.bold && existsSync(BN_BOLD)
        ? 'bn-bold'
        : existsSync(BN)
          ? 'bn'
          : 'Helvetica'
      : opts.bold
        ? 'Helvetica-Bold'
        : 'Helvetica';
  const x0 = opts.x ?? doc.x;
  const width = opts.width ?? doc.page.width - doc.page.margins.right - x0;
  const widths = runs.map((r) => doc.font(fontFor(r.bengali)).widthOfString(r.text));
  const total = widths.reduce((a, b) => a + b, 0);
  // pdfkit cannot centre a line made of several fonts, so short centred/right lines are placed
  // run by run; anything that wraps falls back to left-aligned flowing text.
  if (opts.align && opts.align !== 'left' && total <= width) {
    const y = opts.y ?? doc.y;
    let cx = x0 + (opts.align === 'center' ? (width - total) / 2 : width - total);
    let height = 0;
    runs.forEach((run, i) => {
      doc.font(fontFor(run.bengali));
      height = Math.max(height, doc.currentLineHeight(true));
      doc.text(run.text, cx, y, { lineBreak: false });
      cx += widths[i];
    });
    doc.x = x0;
    doc.y = y + height;
  } else
    runs.forEach((run, i) => {
      doc.font(fontFor(run.bengali));
      const continued = i < runs.length - 1;
      if (i === 0 && opts.x !== undefined) doc.text(run.text, opts.x, opts.y, { width, continued });
      else doc.text(run.text, { width: i === 0 ? width : undefined, continued });
    });
  doc.font('Helvetica').fillColor('#172b27');
  return doc;
}
export const taka = (minor: number) =>
  `BDT ${(minor / 100).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Institution letterhead: logo, names in both languages, address, contact and EIIN. */
export function letterhead(doc: Doc, b: Branding, title: string) {
  const top = doc.y;
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  let textLeft = left;
  if (b.logo) {
    try {
      doc.image(b.logo, left, top, { fit: [56, 56] });
      textLeft = left + 68;
    } catch {
      /* unreadable logo: print without it */
    }
  }
  const textWidth = width - (textLeft - left);
  write(doc, b.name, { size: 17, bold: true, x: textLeft, y: top, width: textWidth });
  if (b.nameBn) write(doc, b.nameBn, { size: 13, bold: true, width: textWidth });
  const contact = [b.address, b.phone, b.email].filter(Boolean).join('  ·  ');
  if (contact) write(doc, contact, { size: 9, color: '#55615c', width: textWidth });
  const meta = [b.campus, b.eiin ? `EIIN ${b.eiin}` : null].filter(Boolean).join('  ·  ');
  if (meta) write(doc, meta, { size: 9, color: '#55615c', width: textWidth });
  doc.x = left;
  doc.y = Math.max(doc.y, top + 60) + 8;
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .lineWidth(1.2)
    .strokeColor(b.accent || '#22644f')
    .stroke();
  doc.moveDown(0.8);
  write(doc, title, { size: 14, bold: true, align: 'center', x: left, width });
  doc.moveDown(0.6);
}
/** Signature lines at the bottom of the current page. */
export function signatures(doc: Doc, labels: string[]) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const y = doc.page.height - doc.page.margins.bottom - 60;
  const slot = width / labels.length;
  labels.forEach((label, i) => {
    const x = left + i * slot + 10;
    doc
      .moveTo(x, y)
      .lineTo(x + slot - 20, y)
      .lineWidth(0.6)
      .strokeColor('#8a948f')
      .stroke();
    write(doc, label, {
      size: 9,
      color: '#55615c',
      x,
      y: y + 4,
      width: slot - 20,
      align: 'center',
    });
  });
}
/** Footer text and page numbers on every buffered page. */
export function finish(doc: Doc, footer: string | null) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    write(doc, `${footer ? footer + '  ·  ' : ''}Page ${i + 1} of ${range.count}`, {
      size: 8,
      color: '#8a948f',
      x: left,
      y: doc.page.height - 30,
      width,
      align: 'center',
    });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
}
