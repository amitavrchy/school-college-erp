'use client';
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { post } from '@/lib/api';
import { mapRows, parseCsv } from '@/lib/csv';
/** Column names accepted in the spreadsheet (English and common Bangla headings). */
const ALIASES: Record<string, string[]> = {
  fullName: ['name', 'full name', 'student name', 'নাম', 'শিক্ষার্থীর নাম'],
  fullNameBn: ['name bn', 'bangla name', 'নাম (বাংলা)'],
  studentCode: ['student id', 'id', 'student code', 'code', 'আইডি'],
  rollNumber: ['roll', 'roll no', 'roll number', 'রোল'],
  gender: ['gender', 'sex', 'লিঙ্গ'],
  dob: ['dob', 'date of birth', 'birth date', 'জন্ম তারিখ'],
  bloodGroup: ['blood group', 'blood', 'রক্তের গ্রুপ'],
  fatherName: ['father', 'father name', "father's name", 'পিতার নাম'],
  motherName: ['mother', 'mother name', "mother's name", 'মাতার নাম'],
  guardianName: ['guardian', 'guardian name', 'অভিভাবকের নাম'],
  guardianPhone: ['guardian phone', 'phone', 'mobile', 'guardian mobile', 'মোবাইল'],
  birthRegNo: ['birth registration', 'birth reg no', 'birth certificate', 'জন্ম নিবন্ধন'],
  religion: ['religion', 'ধর্ম'],
  presentAddress: ['address', 'present address', 'বর্তমান ঠিকানা'],
  permanentAddress: ['permanent address', 'স্থায়ী ঠিকানা'],
};
const TEMPLATE =
  'Student ID,Name,Roll,Gender,Date of birth,Father name,Mother name,Guardian phone,Birth registration,Religion,Address\n' +
  'DHM-2027-0001,Rahim Uddin,1,Male,2014-03-21,Abdul Karim,Rahima Begum,01712345678,20141234567890123,Islam,Mirpur 10 Dhaka\n';
export function StudentImport({
  sections,
  onClose,
  onDone,
}: {
  sections: { id: string; name: string; schoolClass: { name: string } }[];
  onClose: () => void;
  onDone: (created: number) => void;
}) {
  const [sectionId, setSectionId] = useState(''),
    [records, setRecords] = useState<Record<string, string>[]>([]),
    [mapped, setMapped] = useState<string[]>([]),
    [unknown, setUnknown] = useState<string[]>([]),
    [results, setResults] = useState<{ row: number; ok: boolean; error?: string }[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function read(file: File) {
    setError('');
    setResults(null);
    if (!/\.csv$/i.test(file.name)) {
      setError('Save the spreadsheet as CSV (File → Save as → CSV UTF-8) and choose that file.');
      return;
    }
    const parsed = mapRows(parseCsv(await file.text()), ALIASES);
    if (!parsed.mapped.includes('fullName') || !parsed.mapped.includes('studentCode')) {
      setError(
        'The file needs at least "Name" and "Student ID" columns. Download the template to see the layout.',
      );
      return;
    }
    if (parsed.records.length > 500) {
      setError('Import up to 500 students at a time. Split the file and import each part.');
      return;
    }
    setRecords(parsed.records);
    setMapped(parsed.mapped);
    setUnknown(parsed.unknown);
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const rows = records.map((r) => ({
        ...r,
        ...(r.gender
          ? { gender: r.gender[0].toUpperCase() + r.gender.slice(1).toLowerCase() }
          : {}),
      }));
      const result = await post('students/import', { sectionId, rows });
      setResults(result.results);
      onDone(result.created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const failed = results?.filter((r) => !r.ok) || [];
  return (
    <Modal title="Import students from a spreadsheet" onClose={onClose}>
      <div className="form-grid">
        <p>
          Each row becomes a student in the section you choose. Rows with problems are skipped and
          listed below so you can fix and re-import only those.{' '}
          <a
            className="text-green"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`}
            download="student-import-template.csv"
          >
            Download template
          </a>
        </p>
        <label>
          Class & section
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
            <option value="">Select a section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.schoolClass.name} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
          />
        </label>
        {records.length > 0 && !results && (
          <div className="info-banner">
            {records.length} rows ready. Columns used: {mapped.join(', ')}.
            {unknown.length > 0 && ` Ignored: ${unknown.join(', ')}.`}
          </div>
        )}
        {results && (
          <div className={failed.length ? 'error-banner' : 'info-banner'} role="status">
            {results.length - failed.length} imported, {failed.length} skipped.
            {failed.length > 0 && (
              <ul>
                {failed.slice(0, 50).map((r) => (
                  <li key={r.row}>
                    Row {r.row + 1}: {r.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button
              type="button"
              busy={busy}
              disabled={!sectionId || !records.length}
              onClick={submit}
            >
              <Upload size={16} />
              Import {records.length || ''} students
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
