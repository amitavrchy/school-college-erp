import type { PrismaClient } from '@prisma/client';
export async function removeTestTenant(db:PrismaClient,organizationId:string){
 const org=await db.organization.findUnique({where:{id:organizationId}});if(!org||!org.slug?.startsWith('test-'))throw new Error('Refusing to clean a non-test organization');
 const members=await db.organizationMember.findMany({where:{organizationId},select:{userId:true}});
 const campuses=await db.campus.findMany({where:{orgId:organizationId},select:{id:true}});const ids=campuses.map(c=>c.id);
 await db.$transaction(async tx=>{
  await tx.ticketComment.deleteMany({where:{ticket:{organizationId}}});await tx.supportTicket.deleteMany({where:{organizationId}});
  await tx.homeworkSubmission.deleteMany({where:{homework:{section:{schoolClass:{campusId:{in:ids}}}}}});await tx.homework.deleteMany({where:{section:{schoolClass:{campusId:{in:ids}}}}});
  await tx.transportTrip.deleteMany({where:{assignment:{route:{campusId:{in:ids}}}}});await tx.studentTransport.deleteMany({where:{route:{campusId:{in:ids}}}});await tx.transportStop.deleteMany({where:{route:{campusId:{in:ids}}}});await tx.transportRoute.deleteMany({where:{campusId:{in:ids}}});
  await tx.libraryLoan.deleteMany({where:{book:{campusId:{in:ids}}}});await tx.libraryReservation.deleteMany({where:{book:{campusId:{in:ids}}}});await tx.libraryBook.deleteMany({where:{campusId:{in:ids}}});
  await tx.paymentAllocation.deleteMany({where:{payment:{student:{campusId:{in:ids}}}}});await tx.payment.deleteMany({where:{student:{campusId:{in:ids}}}});await tx.waiver.deleteMany({where:{student:{campusId:{in:ids}}}});await tx.invoiceLine.deleteMany({where:{invoice:{student:{campusId:{in:ids}}}}});await tx.invoice.deleteMany({where:{student:{campusId:{in:ids}}}});
  await tx.examMark.deleteMany({where:{enrollment:{student:{campusId:{in:ids}}}}});await tx.examTerm.deleteMany({where:{session:{campusId:{in:ids}}}});await tx.attendanceRecord.deleteMany({where:{enrollment:{student:{campusId:{in:ids}}}}});await tx.leaveRequest.deleteMany({where:{student:{campusId:{in:ids}}}});await tx.guardianStudent.deleteMany({where:{student:{campusId:{in:ids}}}});await tx.enrollment.deleteMany({where:{student:{campusId:{in:ids}}}});await tx.student.deleteMany({where:{campusId:{in:ids}}});
  await tx.admissionDocument.deleteMany({where:{application:{session:{campusId:{in:ids}}}}});await tx.seatOffer.deleteMany({where:{section:{schoolClass:{campusId:{in:ids}}}}});await tx.admissionApplication.deleteMany({where:{session:{campusId:{in:ids}}}});
  await tx.timetableSlot.deleteMany({where:{section:{schoolClass:{campusId:{in:ids}}}}});await tx.sectionSubjectTeacher.deleteMany({where:{section:{schoolClass:{campusId:{in:ids}}}}});await tx.section.deleteMany({where:{schoolClass:{campusId:{in:ids}}}});
  await tx.feeHead.deleteMany({where:{structure:{session:{campusId:{in:ids}}}}});await tx.feeStructure.deleteMany({where:{session:{campusId:{in:ids}}}});await tx.schoolClass.deleteMany({where:{campusId:{in:ids}}});await tx.subject.deleteMany({where:{campusId:{in:ids}}});await tx.gradeScale.deleteMany({where:{campusId:{in:ids}}});await tx.holiday.deleteMany({where:{campusId:{in:ids}}});await tx.academicSession.deleteMany({where:{campusId:{in:ids}}});
  await tx.smsMessage.deleteMany({where:{campusId:{in:ids}}});await tx.notice.deleteMany({where:{campusId:{in:ids}}});await tx.auditLog.deleteMany({where:{campusId:{in:ids}}});await tx.userCampusRole.deleteMany({where:{campusId:{in:ids}}});await tx.campus.deleteMany({where:{orgId:organizationId}});
  await tx.subscriptionPayment.deleteMany({where:{organizationId}});await tx.subscriptionEvent.deleteMany({where:{organizationId}});await tx.subscription.deleteMany({where:{organizationId}});await tx.organizationMember.deleteMany({where:{organizationId}});await tx.organization.delete({where:{id:organizationId}});
  await tx.user.deleteMany({where:{id:{in:members.map(m=>m.userId)},memberships:{none:{}},platformAdmin:false}});
 },{timeout:20000});
}
