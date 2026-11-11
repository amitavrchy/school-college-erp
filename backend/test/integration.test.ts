import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
const base = process.env.API_URL || 'http://localhost:4000/api';
const prefix = `verify-${Date.now()}`;
test('database and HTTP acceptance scenarios', { skip: !process.env.DATABASE_URL, timeout: 120_000 }, async t => {
  const db = new PrismaClient();
  const org = await db.organization.create({ data: { name: prefix } });
  const a = await db.campus.create({ data: { orgId: org.id, name: `${prefix}-A`, code:'A' } });
  const b = await db.campus.create({ data: { orgId: org.id, name: `${prefix}-B`, code:'B' } });
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka'}).format(new Date());
  const year = day.slice(0,4);
  const sessions = await Promise.all([a,b].map(c=>db.academicSession.create({data:{campusId:c.id,name:'Acceptance session',startsOn:new Date(`${year}-01-01`),endsOn:new Date(`${year}-12-31`),status:'ACTIVE'}})));
  const classes = await Promise.all([a,b].map(c=>db.schoolClass.create({data:{campusId:c.id,name:'Class 6',numericLevel:6}})));
  const sections = await Promise.all([a,b].map((c,i)=>db.section.create({data:{classId:classes[i].id,sessionId:sessions[i].id,name:'A',capacity:2,...(i===0?{classTeacherId:'teacher'}:{})}})));
  for(const campus of [a,b]) await db.userCampusRole.create({data:{userId:'admin',campusId:campus.id,role:'SUPER_ADMIN'}});
  for(const [userId,role] of [['teacher','CLASS_TEACHER'],['guardian','GUARDIAN'],['accounts','ACCOUNTS'],['principal','PRINCIPAL']]) await db.userCampusRole.create({data:{userId,campusId:a.id,role}});
  const students=await Promise.all([a,b].map((c,i)=>db.student.create({data:{campusId:c.id,studentCode:`${prefix}-${i}`,fullName:`Acceptance student ${i}`,enrollments:{create:{sessionId:sessions[i].id,sectionId:sections[i].id}}},include:{enrollments:true}})));
  await db.guardianStudent.create({data:{guardianUserId:'guardian',studentId:students[0].id,isPrimary:true}});
  const invoices=await Promise.all([10000,20000].map((n,i)=>db.invoice.create({data:{studentId:students[0].id,sessionId:sessions[0].id,dueDate:new Date(`${year}-${i===0?'01':'02'}-10`),totalMinor:n,lines:{create:{feeHeadName:'Tuition',amountMinor:n}}}})));
  const cookies:Record<string,string>={};
  async function request(user:string,campusId:string,path:string,body?:unknown,method=body===undefined?'GET':'POST') {
    if(!cookies[user]){const r=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${user}@campusone.edu.bd`,password:process.env.SEED_PASSWORD||'CampusOne!2026'})});assert.equal(r.status,201,await r.text());cookies[user]=r.headers.get('set-cookie')!.split(';')[0];}
    const res=await fetch(`${base}/${path}`,{method,headers:{Cookie:cookies[user],'x-campus-id':campusId,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await res.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}return {status:res.status,data};
  }
  t.after(async()=>{
    const campusIds=[a.id,b.id];const all=await db.student.findMany({where:{campusId:{in:campusIds}},select:{id:true}});const studentIds=all.map(s=>s.id);const ss=sessions.map(s=>s.id);
    await db.paymentAllocation.deleteMany({where:{payment:{studentId:{in:studentIds}}}});await db.payment.deleteMany({where:{studentId:{in:studentIds}}});await db.waiver.deleteMany({where:{studentId:{in:studentIds}}});await db.invoiceLine.deleteMany({where:{invoice:{studentId:{in:studentIds}}}});await db.invoice.deleteMany({where:{studentId:{in:studentIds}}});
    await db.examMark.deleteMany({where:{enrollment:{studentId:{in:studentIds}}}});await db.examTerm.deleteMany({where:{sessionId:{in:ss}}});await db.attendanceRecord.deleteMany({where:{enrollment:{studentId:{in:studentIds}}}});await db.leaveRequest.deleteMany({where:{studentId:{in:studentIds}}});await db.guardianStudent.deleteMany({where:{studentId:{in:studentIds}}});await db.enrollment.deleteMany({where:{studentId:{in:studentIds}}});await db.student.deleteMany({where:{id:{in:studentIds}}});
    await db.seatOffer.deleteMany({where:{sectionId:{in:sections.map(s=>s.id)}}});await db.admissionApplication.deleteMany({where:{sessionId:{in:ss}}});await db.section.deleteMany({where:{sessionId:{in:ss}}});await db.subject.deleteMany({where:{campusId:{in:campusIds}}});await db.schoolClass.deleteMany({where:{campusId:{in:campusIds}}});await db.academicSession.deleteMany({where:{id:{in:ss}}});await db.userCampusRole.deleteMany({where:{campusId:{in:campusIds}}});await db.auditLog.deleteMany({where:{campusId:{in:campusIds}}});await db.campus.deleteMany({where:{id:{in:campusIds}}});await db.organization.delete({where:{id:org.id}});await db.$disconnect();
  });
  await t.test('teacher cannot mark another campus or impersonate campus membership',async()=>{
    const response=await request('teacher',a.id,'attendance/bulk',{sectionId:sections[1].id,date:day,records:[{enrollmentId:students[1].enrollments[0].id,status:'ABSENT'}]});assert.equal(response.status,404);
    assert.equal((await request('teacher',b.id,'students')).status,403);
  });
  await t.test('guardian sees only linked students and published results',async()=>{
    const list=await request('guardian',a.id,'students');assert.equal(list.data.total,1);assert.equal((await request('guardian',a.id,`students/${students[1].id}`)).status,404);
    const subject=await db.subject.create({data:{campusId:a.id,name:'Mathematics',code:'MAT'}});
    for(const status of ['ENTRY_OPEN','PUBLISHED']){const term=await db.examTerm.create({data:{sessionId:sessions[0].id,name:status,status,marks:{create:{enrollmentId:students[0].enrollments[0].id,subjectId:subject.id,marksObtained:80,maxMarks:100}}}});}
    const results=await request('guardian',a.id,`exams/results/${students[0].id}`);assert.equal(results.data[0].terms.length,1);assert.equal(results.data[0].terms[0].term.status,'PUBLISHED');
    const pdf=await fetch(`${base}/students/${students[0].id}/report-card`,{headers:{Cookie:cookies.guardian,'x-campus-id':a.id}});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type')||'',/application\/pdf/);assert.equal((await pdf.text()).slice(0,4),'%PDF');
  });
  await t.test('idempotent concurrent partial payment allocates oldest invoice first',async()=>{
    const body={studentId:students[0].id,provider:'MANUAL',amountMinor:12000,idempotencyKey:randomUUID()};const responses=await Promise.all([request('accounts',a.id,'payments/intent',body),request('accounts',a.id,'payments/intent',body)]);
    assert.ok(responses.every(r=>r.status===201),JSON.stringify(responses));assert.equal(responses[0].data.id,responses[1].data.id);
    const updated=await db.invoice.findMany({where:{id:{in:invoices.map(i=>i.id)}},orderBy:{dueDate:'asc'}});assert.equal(updated[0].paidMinor,10000);assert.equal(updated[1].paidMinor,2000);assert.equal(await db.payment.count({where:{idempotencyKey:body.idempotencyKey}}),1);
    assert.equal((await request('accounts',a.id,'payments/intent',{...body,amountMinor:1})).status,409);
    assert.equal((await request('guardian',a.id,'payments/intent',{...body,idempotencyKey:randomUUID()})).status,403);
  });
  await t.test('high waiver cannot bypass Principal approval or dual control',async()=>{
    const invoice=await db.invoice.create({data:{studentId:students[0].id,sessionId:sessions[0].id,dueDate:new Date(day),totalMinor:300000,lines:{create:{feeHeadName:'Tuition',amountMinor:300000}}}});
    const waiver=await request('accounts',a.id,'fees/waivers',{invoiceId:invoice.id,feeHeadName:'Tuition',amountMinor:110000,reason:'Acceptance scholarship'});assert.equal(waiver.status,201);
    assert.equal((await request('admin',a.id,`fees/waivers/${waiver.data.id}/approve`,{})).status,403);
    assert.equal((await request('accounts',a.id,`fees/waivers/${waiver.data.id}/approve`,{})).status,403);
    assert.equal((await request('principal',a.id,`fees/waivers/${waiver.data.id}/approve`,{})).status,201);
  });
  await t.test('concurrent offer acceptance fills exactly remaining capacity',async()=>{
    const offers=[];for(let i=0;i<5;i++){const app=await db.admissionApplication.create({data:{sessionId:sessions[0].id,applyingClassId:classes[0].id,applicantName:`${prefix}-applicant-${i}`,guardianPhone:'01712345678',status:'OFFERED',offerExpiresAt:new Date(Date.now()+3600000),offer:{create:{sectionId:sections[0].id}}},include:{offer:true}});offers.push(app.offer!);}
    const responses=await Promise.all(offers.map(async offer=>{const r=await fetch(`${base}/admissions/offers/${offer.id}/accept`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:offer.acceptanceToken})});return r.status;}));assert.equal(responses.filter(s=>s===201).length,1,JSON.stringify(responses));assert.equal(await db.enrollment.count({where:{sectionId:sections[0].id,status:'ACTIVE'}}),2);
  });
});
