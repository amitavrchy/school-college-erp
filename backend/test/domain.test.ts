import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateFifo, lateFine, outstanding } from '../src/domain/fees';
import { grade, gpa, weightedGpa } from '../src/domain/grading';
import { ADMISSION_FLOW, EXAM_FLOW, canTransition, meritScore, smsSegments } from '../src/domain/workflow';
test('FIFO allocates partial payment to oldest invoice and never overpays',()=>{
  const invoices=[{id:'new',dueDate:new Date('2026-11-10'),totalMinor:300000,paidMinor:0,fineMinor:0,waivedMinor:0},{id:'old',dueDate:new Date('2026-10-10'),totalMinor:300000,paidMinor:100000,fineMinor:10000,waivedMinor:5000}];
  assert.deepEqual(allocateFifo(invoices,250000),{allocations:[{invoiceId:'old',amountMinor:205000},{invoiceId:'new',amountMinor:45000}],unallocated:0});
  assert.equal(allocateFifo(invoices,600000).unallocated,95000);
  assert.throws(()=>allocateFifo(invoices,0)); assert.throws(()=>allocateFifo(invoices,1.1));
});
test('late fines use Bangladesh calendar boundaries and obey the cap',()=>{
  assert.equal(lateFine(new Date('2026-10-31T00:00:00Z'),new Date('2026-10-31T18:01:00Z'),1000,50000),1000);
  assert.equal(lateFine(new Date('2026-01-01'),new Date('2026-11-11'),1000,50000),50000);
  assert.equal(lateFine(new Date('2026-11-12'),new Date('2026-11-11'),1000,50000),0);
  assert.equal(outstanding({totalMinor:100,paidMinor:90,fineMinor:10,waivedMinor:30}),0);
});
test('NCTB grade boundaries, normalization and compulsory failures',()=>{
  for(const [mark,letter] of [[100,'A+'],[80,'A+'],[79.99,'A'],[70,'A'],[60,'A-'],[50,'B'],[40,'C'],[33,'D'],[32.99,'F']] as const) assert.equal(grade(mark).letter,letter);
  assert.equal(grade(40,50).point,5); assert.equal(grade(100,100,true).point,0);
  assert.deepEqual(gpa([{marks:80,maxMarks:100},{marks:70,maxMarks:100}]),{gpa:4.5,percentage:75,failed:false});
  assert.equal(gpa([{marks:100,maxMarks:100},{marks:32,maxMarks:100}]).gpa,0);
  assert.throws(()=>grade(101)); assert.throws(()=>grade(1,0));
  assert.equal(weightedGpa([{gpa:4,weightBps:4000},{gpa:5,weightBps:6000}]),4.6);
});
test('workflow rejects skipped approvals and reopening published results',()=>{
  assert.equal(canTransition(ADMISSION_FLOW,'SUBMITTED','ENROLLED'),false);
  assert.equal(canTransition(ADMISSION_FLOW,'MERIT_LISTED','OFFERED'),true);
  assert.equal(canTransition(EXAM_FLOW,'ENTRY_OPEN','PUBLISHED'),false);
  assert.equal(canTransition(EXAM_FLOW,'PUBLISHED','ENTRY_OPEN'),false);
  assert.equal(meritScore(80,5),84);
});
test('Bangla SMS uses UCS-2 multipart limits',()=>{
  assert.deepEqual(smsSegments('ক'.repeat(70)),{encoding:'UCS-2',segments:1});
  assert.equal(smsSegments('ক'.repeat(71)).segments,2);
  assert.equal(smsSegments('a'.repeat(160)).segments,1);
  assert.equal(smsSegments('a'.repeat(161)).segments,2);
});
