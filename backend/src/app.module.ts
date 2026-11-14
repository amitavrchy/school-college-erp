import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { config } from './config';
import { Db } from './db';
import { Audit } from './audit';
import { Notifier } from './notify';
import { Push } from './push';
import { OneTimeCodes } from './auth/otp';
import { Jobs } from './jobs';
import { Realtime, RealtimeGateway } from './realtime';
import { Settings, SettingsController } from './settings';
import { AccessGuard } from './auth/access';
import { Scope } from './auth/scope';
import { AuthController } from './auth/auth.controller';
import { MobileController } from './auth/mobile.controller';
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
import { HealthController } from './health';
import { Websites } from './websites/service';
import { WebsiteResults } from './websites/results';
import { WebsiteController, PublicWebsitesController } from './websites/controllers';
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
    MobileController,
    HealthController,
    WebsiteController,
    PublicWebsitesController,
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
    SaasController,
    PlatformController,
    LibraryController,
    TransportController,
    HomeworkController,
    SupportController,
    SettingsController,
  ],
  providers: [
    Db,
    Websites,
    WebsiteResults,
    Saas,
    Audit,
    Notifier,
    Push,
    OneTimeCodes,
    MobileController,
    Scope,
    Realtime,
    RealtimeGateway,
    Settings,
    Jobs,
    Billing,
    PaymentService,
    ExamsController,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
