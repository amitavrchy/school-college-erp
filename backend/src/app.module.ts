import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { config } from './config';
import { Db } from './db';
import { Audit } from './audit';
import { Jobs } from './jobs';
import { Realtime } from './realtime';
import { AccessGuard } from './auth/access';
import { Scope } from './auth/scope';
import { AuthController } from './auth/auth.controller';
import { CampusesController } from './modules/campuses';
import { AcademicsController } from './modules/academics';
import { StudentsController } from './modules/students';
import { UsersController } from './modules/users';
import { AdmissionsController } from './modules/admissions';
import { AttendanceController } from './modules/attendance';
import { FeesController } from './modules/fees';
import { PaymentService } from './modules/payment.service';
import { PaymentsController } from './modules/payments';
import { ExamsController } from './modules/exams';
import { DocumentsController } from './modules/documents';
import { NoticesController } from './modules/notices';
import { ReportsController } from './modules/reports';
import { LifecycleController } from './modules/lifecycle';
@Module({
  imports: [JwtModule.register({ global: true, secret: config.JWT_ACCESS_SECRET, signOptions: { expiresIn: '8h', issuer: 'campus-one', audience: 'campus-one' }, verifyOptions: { issuer: 'campus-one', audience: 'campus-one' } })],
  controllers: [AuthController, CampusesController, AcademicsController, StudentsController, UsersController, AdmissionsController, AttendanceController, FeesController, PaymentsController, ExamsController, DocumentsController, NoticesController, ReportsController, LifecycleController],
  providers: [Db, Audit, Scope, Realtime, Jobs, PaymentService, ExamsController, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
