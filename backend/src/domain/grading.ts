export interface Grade { minMarks: number; maxMarks: number; letter: string; point: number; }
export const NCTB: Grade[] = [
  { minMarks: 80, maxMarks: 100, letter: 'A+', point: 5 },
  { minMarks: 70, maxMarks: 80, letter: 'A', point: 4 },
  { minMarks: 60, maxMarks: 70, letter: 'A-', point: 3.5 },
  { minMarks: 50, maxMarks: 60, letter: 'B', point: 3 },
  { minMarks: 40, maxMarks: 50, letter: 'C', point: 2 },
  { minMarks: 33, maxMarks: 40, letter: 'D', point: 1 },
  { minMarks: 0, maxMarks: 33, letter: 'F', point: 0 },
];
export function grade(marks: number, maxMarks = 100, absent = false, scale = NCTB): Grade {
  if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0 || marks < 0 || marks > maxMarks) throw new Error('Invalid marks');
  const percentage = absent ? 0 : marks * 100 / maxMarks;
  const result = [...scale].sort((a,b) => b.minMarks - a.minMarks).find(g => percentage >= g.minMarks && percentage <= g.maxMarks);
  if (!result) throw new Error('Grade scale does not cover these marks');
  return result;
}
export function gpa(marks: { marks: number; maxMarks: number; absent?: boolean; compulsory?: boolean }[], scale = NCTB) {
  if (!marks.length) return { gpa: 0, percentage: 0, failed: false };
  const grades = marks.map(m => grade(m.marks, m.maxMarks, m.absent, scale));
  const failed = marks.some((m, i) => m.compulsory !== false && grades[i].point === 0);
  return { failed, gpa: failed ? 0 : Math.round(grades.reduce((n,g) => n + g.point,0) / marks.length * 100) / 100,
    percentage: Math.round(marks.reduce((n,m) => n + (m.absent ? 0 : m.marks), 0) / marks.reduce((n,m) => n + m.maxMarks, 0) * 10000) / 100 };
}
export function weightedGpa(terms: { gpa: number; weightBps: number }[]) {
  const sum = terms.reduce((s,t) => s + t.weightBps, 0);
  if (!sum || terms.some(t => t.weightBps < 0 || t.gpa < 0 || t.gpa > 5)) throw new Error('Invalid term weights');
  return Math.round(terms.reduce((s,t) => s + t.gpa * t.weightBps, 0) / sum * 100) / 100;
}
