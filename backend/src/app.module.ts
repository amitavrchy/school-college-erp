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
import { Billing } from './modules/billing';
import { UploadsController } from './modules/uploads';
import { Saas } from './saas/service';
import { SaasController, PlatformController } from './saas/controllers';
import { LibraryController } from './modules/library';
import { TransportController } from './modules/transport';
import { HomeworkController } from './modules/homework';
import { SupportController } from './modules/support';
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: '8h', issuer: 'campus-one', audience: 'campus-one' },
      verifyOptions: { issuer: 'campus-one', audience: 'campus-one' },
    }),
  ],
  controllers: [
    AuthController,
    CampusesController,
    AcademicsController,
    StudentsController,
    UsersController,
    AdmissionsController,
    AttendanceController,
    FeesController,
    PaymentsController,
    ExamsController,
    DocumentsController,
    NoticesController,
    ReportsController,
    LifecycleController,
    UploadsController,
    SaasController, PlatformController,
    LibraryController, TransportController, HomeworkController, SupportController,
  ],
  providers: [
    Db,
    Saas,
    Audit,
    Scope,
    Realtime,
    Jobs,
    Billing,
    PaymentService,
    ExamsController,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
