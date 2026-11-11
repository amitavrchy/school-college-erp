'use client';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const campus = typeof window !== 'undefined' ? localStorage.getItem('campus-id') : null;
  const response = await fetch(`/api/${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(campus ? { 'x-campus-id': campus } : {}), ...options.headers } });
  if (!response.ok) {
    let message = 'Unable to complete this request';
    try { const result = await response.json(); message = result.message || message; } catch { /* HTTP fallback */ }
    throw new ApiError(response.status, Array.isArray(message) ? message.join(', ') : message);
  }
  return response.json();
}
export const post = <T = any>(path: string, body?: unknown, method = 'POST') => api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const bdt = (minor: number) => new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(minor / 100);
export const number = (n: number) => new Intl.NumberFormat('en-BD').format(n);
export const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
export const displayDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date(value));
export function csvDownload(name: string, rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] || {});
  const safe = (v: unknown) => { const str = String(v ?? ''); return `"${(/^[=+@-]/.test(str) ? "'" : '') + str.replaceAll('"','""')}"`; };
  const text = '\ufeff' + [keys.map(safe).join(','), ...rows.map(r => keys.map(k => safe(r[k])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(url);
}
export async function pdfDownload(path: string, name: string) {
  const response = await fetch(`/api/${path}`, { credentials: 'include', headers: { 'x-campus-id': localStorage.getItem('campus-id') || '' } });
  if (!response.ok) throw new Error('Unable to download document');
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
