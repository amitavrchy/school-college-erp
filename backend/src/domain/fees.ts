export interface Outstanding {
  id: string;
  dueDate: Date;
  totalMinor: number;
  paidMinor: number;
  fineMinor: number;
  waivedMinor: number;
}
export const outstanding = (i: Omit<Outstanding, 'id' | 'dueDate'>) =>
  Math.max(0, i.totalMinor + i.fineMinor - i.waivedMinor - i.paidMinor);
export function allocateFifo(invoices: Outstanding[], amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('Payment must be a positive integer amount');
  const ordered = [...invoices].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id),
  );
  const allocations: { invoiceId: string; amountMinor: number }[] = [];
  let remaining = amount;
  for (const invoice of ordered) {
    const used = Math.min(outstanding(invoice), remaining);
    if (used) allocations.push({ invoiceId: invoice.id, amountMinor: used });
    remaining -= used;
  }
  return { allocations, unallocated: remaining };
}
export function lateFine(dueDate: Date, now: Date, perDay: number, cap: number) {
  if (![perDay, cap].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error('Invalid fine configuration');
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(d);
  const days = Math.max(
    0,
    Math.floor((Date.parse(key(now)) - Date.parse(key(dueDate))) / 86_400_000),
  );
  return Math.min(days * perDay, cap);
}
