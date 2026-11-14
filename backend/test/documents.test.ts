import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { finish, letterhead, newDocument, scriptRuns, write } from '../src/pdf';
process.env.DATABASE_URL ||= 'postgresql://unit:unit@localhost:5432/unit';
process.env.JWT_ACCESS_SECRET ||= 'a-unit-test-secret-with-more-than-32-characters';
test('mixed Bangla and English text is split into script runs', () => {
  assert.deepEqual(scriptRuns('Class ষষ্ঠ শ্রেণি 6'), [
    { text: 'Class ', bengali: false },
    { text: 'ষষ্ঠ শ্রেণি ', bengali: true },
    { text: '6', bengali: false },
  ]);
});
test('documents embed the Bangla font and render institution branding', async () => {
  const doc = newDocument();
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c) => chunks.push(c));
  doc.pipe(out);
  letterhead(
    doc,
    {
      name: 'Test School',
      nameBn: 'পরীক্ষা বিদ্যালয়',
      campus: 'Main',
      address: 'ঢাকা',
      phone: null,
      email: null,
      eiin: '123456',
      logo: null,
      footer: null,
      principalName: null,
      accent: '#22644f',
    },
    'Money Receipt · টাকা প্রাপ্তির রসিদ',
  );
  write(doc, 'Amount ৳২৫০০', { align: 'center' });
  finish(doc, 'ধন্যবাদ');
  await new Promise((r) => out.on('end', r));
  const pdf = Buffer.concat(chunks);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.toString('latin1'), /NotoSansBengali-Regular/);
  assert.match(pdf.toString('latin1'), /NotoSansBengali-Bold/);
});
test('late fines follow the school policy and respect the cap', async () => {
  const { fineFor } = await import('../src/settings');
  const base = { lateFinePerDayMinor: 1000, lateFineFlatMinor: 20000, lateFineCapMinor: 5000 };
  assert.equal(fineFor({ ...base, lateFineMode: 'NONE' }, 10), 0);
  assert.equal(fineFor({ ...base, lateFineMode: 'PER_DAY' }, 0), 0);
  assert.equal(fineFor({ ...base, lateFineMode: 'PER_DAY' }, 3), 3000);
  assert.equal(fineFor({ ...base, lateFineMode: 'PER_DAY' }, 30), 5000);
  assert.equal(fineFor({ ...base, lateFineMode: 'FLAT', lateFineCapMinor: 50000 }, 1), 20000);
});
