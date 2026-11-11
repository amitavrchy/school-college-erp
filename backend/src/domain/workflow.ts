export const ADMISSION_FLOW: Record<string, string[]> = {
  SUBMITTED: ['UNDER_REVIEW','REJECTED'], UNDER_REVIEW: ['TEST_SCHEDULED','MERIT_LISTED','REJECTED'],
  TEST_SCHEDULED: ['MERIT_LISTED','REJECTED'], MERIT_LISTED: ['OFFERED','WAITLISTED','REJECTED'],
  WAITLISTED: ['OFFERED','REJECTED'], OFFERED: ['ACCEPTED','EXPIRED','REJECTED'], ACCEPTED: ['ENROLLED'],
};
export const EXAM_FLOW: Record<string, string[]> = { SETUP: ['ENTRY_OPEN'], ENTRY_OPEN: ['ENTRY_LOCKED'], ENTRY_LOCKED: ['MODERATION','ENTRY_OPEN'], MODERATION: ['PUBLISHED','ENTRY_OPEN'], PUBLISHED: [] };
export function canTransition(flow: Record<string,string[]>, from: string, to: string) { return flow[from]?.includes(to) ?? false; }
export function meritScore(test: number, previousGpa: number) { return test * 0.8 + previousGpa / 5 * 100 * 0.2; }
export function smsSegments(text: string) { const unicode = /[^\x00-\x7F]/.test(text); const length = text.length; return { encoding: unicode ? 'UCS-2' : 'GSM-7', segments: Math.max(1, Math.ceil(length / (length <= (unicode ? 70 : 160) ? (unicode ? 70 : 160) : (unicode ? 67 : 153)))) }; }
