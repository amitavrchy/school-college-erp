import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { NCTB } from '../src/domain/grading';
import { seedSaas } from './seed-saas';
const db = new PrismaClient();
async function seed() {
  if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)
    throw new Error('Set SEED_PASSWORD to at least 12 characters');
  const passwordHash = await hash(process.env.SEED_PASSWORD, 12);
  const now = new Date(),
    year = Number(
      new Intl.DateTimeFormat('en', { timeZone: 'Asia/Dhaka', year: 'numeric' }).format(now),
    );
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .slice(0, 7);
  await db.organization.upsert({
    where: { id: 'org-scholars' },
    update: {},
    create: { id: 'org-scholars', name: 'Scholars School & College' },
  });
  const people = [
    ['admin', 'Amitav Roy Chowdhury', 'admin@campusone.edu.bd', 'SUPER_ADMIN'],
    ['principal', 'Dr. Farhana Rahman', 'principal@campusone.edu.bd', 'PRINCIPAL'],
    ['accounts', 'Tanvir Ahmed', 'accounts@campusone.edu.bd', 'ACCOUNTS'],
    ['teacher', 'Nusrat Jahan', 'teacher@campusone.edu.bd', 'CLASS_TEACHER'],
    ['teacher2', 'Mahmudul Hasan', 'hasan@campusone.edu.bd', 'TEACHER'],
    ['guardian', 'Ayesha Rahman', 'guardian@campusone.edu.bd', 'GUARDIAN'],
    ['student', 'Arham Rahman', 'student@campusone.edu.bd', 'STUDENT'],
    ['admission', 'Sadia Islam', 'admission@campusone.edu.bd', 'ADMISSION_OFFICER'],
  ];
  for (const [id, fullName, email] of people)
    await db.user.upsert({
      where: { id },
      update: {},
      create: { id, fullName, email, passwordHash, phone: '01712345678' },
    });
  const firstNames = [
    'Arham',
    'Aafiya',
    'Raiyan',
    'Nafisa',
    'Tahsin',
    'Zara',
    'Ayaan',
    'Maliha',
    'Samin',
    'Farhan',
    'Nabila',
    'Ishrat',
    'Rafi',
    'Anika',
    'Sakib',
    'Mehjabin',
    'Adnan',
    'Sumaiya',
    'Fahim',
    'Nusaira',
  ];
  const surnames = [
    'Rahman',
    'Ahmed',
    'Islam',
    'Chowdhury',
    'Hasan',
    'Khan',
    'Hossain',
    'Akter',
    'Siddique',
    'Karim',
  ];
  for (const [campusId, name, code, size] of [
    ['dhanmondi', 'Dhanmondi Campus', 'DHM', 12],
    ['uttara', 'Uttara Campus', 'UTT', 8],
  ] as const) {
    await db.campus.upsert({
      where: { id: campusId },
      update: {},
      create: {
        id: campusId,
        orgId: 'org-scholars',
        name,
        code,
        address:
          campusId === 'dhanmondi'
            ? 'House 24, Road 7, Dhanmondi, Dhaka'
            : 'Sector 7, Uttara, Dhaka',
      },
    });
    for (const [userId, , , role] of people)
      await db.userCampusRole.upsert({
        where: { userId_campusId_role: { userId, campusId, role } },
        update: {},
        create: { userId, campusId, role },
      });
    const sessionId = `${campusId}-${year}`;
    await db.academicSession.upsert({
      where: { id: sessionId },
      update: {},
      create: {
        id: sessionId,
        campusId,
        name: `${year} Academic Year`,
        startsOn: new Date(`${year}-01-01`),
        endsOn: new Date(`${year}-12-31`),
        status: 'ACTIVE',
      },
    });
    for (let i = 0; i < NCTB.length; i++)
      await db.gradeScale.upsert({
        where: { id: `${campusId}-grade-${i}` },
        update: {},
        create: { id: `${campusId}-grade-${i}`, campusId, ...NCTB[i] },
      });
    const subjects = [
      ['BAN', 'Bangla'],
      ['ENG', 'English'],
      ['MAT', 'Mathematics'],
      ['SCI', 'Science'],
      ['ICT', 'Information Technology'],
    ];
    for (const [code, name] of subjects)
      await db.subject.upsert({
        where: { id: `${campusId}-${code}` },
        update: {},
        create: { id: `${campusId}-${code}`, campusId, code, name },
      });
    const mid = `${sessionId}-mid`,
      final = `${sessionId}-final`;
    for (const [id, name, status, weightBps] of [
      [mid, 'Mid-year Examination', 'PUBLISHED', 4000],
      [final, 'Annual Examination', 'ENTRY_OPEN', 6000],
    ] as const)
      await db.examTerm.upsert({
        where: { id },
        update: {},
        create: {
          id,
          sessionId,
          name,
          status,
          weightBps,
          entryDeadline: new Date(`${year}-12-20T18:00:00Z`),
        },
      });
    let index = 0;
    for (let level = 6; level <= 10; level++) {
      const classId = `${campusId}-class-${level}`;
      await db.schoolClass.upsert({
        where: { id: classId },
        update: {},
        create: { id: classId, campusId, name: `Class ${level}`, numericLevel: level },
      });
      const structureId = `${sessionId}-fees-${level}`;
      await db.feeStructure.upsert({
        where: { id: structureId },
        update: {},
        create: {
          id: structureId,
          sessionId,
          classId,
          name: `Class ${level} regular fees`,
          heads: {
            create: [
              { name: 'Tuition', amountMinor: 250000, frequency: 'MONTHLY' },
              { name: 'Lab & resources', amountMinor: 50000, frequency: 'MONTHLY' },
              { name: 'Examination', amountMinor: 80000, frequency: 'QUARTERLY' },
            ],
          },
        },
      });
      for (const sectionName of ['A', 'B']) {
        const sectionId = `${sessionId}-${level}-${sectionName}`;
        await db.section.upsert({
          where: { id: sectionId },
          update: {},
          create: {
            id: sectionId,
            classId,
            sessionId,
            name: sectionName,
            capacity: 40,
            classTeacherId: 'teacher',
            shift: sectionName === 'A' ? 'MORNING' : 'DAY',
          },
        });
        for (const [code] of subjects)
          await db.sectionSubjectTeacher.upsert({
            where: { sectionId_subjectId: { sectionId, subjectId: `${campusId}-${code}` } },
            update: {},
            create: {
              sectionId,
              subjectId: `${campusId}-${code}`,
              teacherId: code === 'MAT' ? 'teacher2' : 'teacher',
            },
          });
        for (let roll = 1; roll <= size; roll++) {
          index++;
          const studentId = `${campusId}-student-${String(index).padStart(3, '0')}`,
            enrollmentId = `${studentId}-${year}`;
          const fullName = `${firstNames[(index - 1) % firstNames.length]} ${surnames[Math.floor((index - 1) / firstNames.length) % surnames.length]}`;
          await db.student.upsert({
            where: { id: studentId },
            update: {},
            create: {
              id: studentId,
              campusId,
              studentCode: `${code}-${year}-${String(index).padStart(3, '0')}`,
              fullName,
              dob: new Date(`${year - level - 5}-04-15`),
              gender: index % 2 ? 'Male' : 'Female',
              bloodGroup: ['A+', 'B+', 'O+', 'AB+'][index % 4],
              ...(index === 1 && campusId === 'dhanmondi' ? { userId: 'student' } : {}),
            },
          });
          await db.enrollment.upsert({
            where: { id: enrollmentId },
            update: {},
            create: { id: enrollmentId, studentId, sectionId, sessionId, rollNumber: String(roll) },
          });
          if (index <= 2)
            await db.guardianStudent.upsert({
              where: { guardianUserId_studentId: { guardianUserId: 'guardian', studentId } },
              update: {},
              create: {
                guardianUserId: 'guardian',
                studentId,
                isPrimary: true,
                relation: 'Mother',
              },
            });
          const invoiceId = `${studentId}-${month}`;
          const paid = index % 3 === 0;
          await db.invoice.upsert({
            where: { id: invoiceId },
            update: {},
            create: {
              id: invoiceId,
              studentId,
              sessionId,
              dueDate: new Date(`${month}-10`),
              totalMinor: 300000,
              paidMinor: paid ? 300000 : 0,
              status: paid ? 'PAID' : 'DUE',
              generationKey: invoiceId,
              lines: {
                create: [
                  { feeHeadName: 'Tuition', amountMinor: 250000 },
                  { feeHeadName: 'Lab & resources', amountMinor: 50000 },
                ],
              },
            },
          });
          if (paid)
            await db.payment.upsert({
              where: { id: `pay-${invoiceId}` },
              update: {},
              create: {
                id: `pay-${invoiceId}`,
                studentId,
                provider: 'MANUAL',
                status: 'SUCCESS',
                amountMinor: 300000,
                idempotencyKey: `seed-${invoiceId}`,
                providerRef: `bank-${invoiceId}`,
                paidAt: new Date(`${month}-${String(1 + (index % 10)).padStart(2, '0')}T06:00:00Z`),
                allocations: { create: { invoiceId, amountMinor: 300000 } },
              },
            });
          for (let d = 0; d < 7; d++) {
            const day = new Date(now.getTime() - d * 86400000);
            const date = new Date(
              new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(day),
            );
            await db.attendanceRecord.upsert({
              where: { enrollmentId_date_period: { enrollmentId, date, period: 0 } },
              update: {},
              create: {
                enrollmentId,
                date,
                period: 0,
                status:
                  (index + d) % 13 === 0 ? 'ABSENT' : (index + d) % 17 === 0 ? 'LATE' : 'PRESENT',
                markedBy: 'teacher',
              },
            });
          }
          for (let s = 0; s < subjects.length; s++)
            await db.examMark.upsert({
              where: {
                termId_enrollmentId_subjectId: {
                  termId: mid,
                  enrollmentId,
                  subjectId: `${campusId}-${subjects[s][0]}`,
                },
              },
              update: {},
              create: {
                termId: mid,
                enrollmentId,
                subjectId: `${campusId}-${subjects[s][0]}`,
                marksObtained: 45 + ((index * 7 + s * 11) % 55),
                maxMarks: 100,
              },
            });
        }
      }
    }
    for (let i = 1; i <= 12; i++)
      await db.admissionApplication.upsert({
        where: { id: `${campusId}-app-${i}` },
        update: {},
        create: {
          id: `${campusId}-app-${i}`,
          sessionId,
          applyingClassId: `${campusId}-class-${6 + (i % 5)}`,
          applicantName: `${firstNames[i % 20]} ${surnames[i % 10]}`,
          guardianPhone: '01812345678',
          testScore: 60 + i * 2,
          previousGpa: 3.5 + i / 10,
          status: ['SUBMITTED', 'UNDER_REVIEW', 'TEST_SCHEDULED', 'MERIT_LISTED', 'WAITLISTED'][
            i % 5
          ],
        },
      });
    for (const [i, title, body] of [
      [
        1,
        'Annual examination preparations',
        'The annual examination begins next month. Please review the timetable and ensure all outstanding fees are cleared.',
      ],
      [
        2,
        'Parent–teacher meeting',
        'Join us on Saturday at 10:00 AM for a conversation about your child’s progress.',
      ],
      [
        3,
        'A campus that grows together',
        'Our science club welcomes new members. Contact your class teacher to join this week.',
      ],
    ] as const)
      await db.notice.upsert({
        where: { id: `${campusId}-notice-${i}` },
        update: {},
        create: {
          id: `${campusId}-notice-${i}`,
          campusId,
          title,
          body,
          bodyBn:
            i === 2
              ? 'অভিভাবক সভায় আপনাকে স্বাগতম। শনিবার সকাল ১০টায় বিদ্যালয়ে উপস্থিত থাকুন।'
              : null,
          audience: {},
          channels: ['IN_APP'],
          status: 'SENT',
        },
      });
    await db.auditLog.upsert({
      where: { id: `${campusId}-setup` },
      update: {},
      create: {
        id: `${campusId}-setup`,
        campusId,
        actorId: 'admin',
        action: 'CAMPUS_READY',
        entity: 'Campus',
        entityId: campusId,
      },
    });
  }
  await seedSaas(db, process.env.SEED_PASSWORD!);
  console.log(
    'Seed complete: 2 campuses, 200 students, sample accounts, fees, results and attendance.',
  );
}
seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
