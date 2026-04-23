import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAlertModule } from './alerts/admin-alert.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MerchantAnalyticsModule } from './analytics/merchant-analytics.module';
import { MerchantsModule } from './merchants/merchants.module';
import { UsersModule } from './users/users.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { PayLinkModule } from './paylink/paylink.module';
import { ReceiveModule } from './receive/receive.module';
import { VirtualAccountModule } from './virtual-account/virtual-account.module';
import { AuditModule } from './audit/audit.module';
import { AppConfigModule as RuntimeConfigModule } from './app-config/app-config.module';
import { MaintenanceModeMiddleware } from './app-config/middleware/maintenance-mode.middleware';
import { AdminModule } from './admin/admin.module';
import { EarningsModule } from './earnings/earnings.module';
import { SmsModule } from './sms/sms.module';
import { OtpModule } from './otp/otp.module';
import { PinModule } from './pin/pin.module';
import { TransfersModule } from './transfers/transfers.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { PasskeyModule } from './passkey/passkey.module';
import { SecurityModule } from './security/security.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PushModule } from './push/push.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { KycModule } from './kyc/kyc.module';
import { ReportsModule } from './reports/reports.module';
import { ApiVersionModule } from './api-version/api-version.module';
import { DeprecationHeadersInterceptor } from './api-version/deprecation-headers.interceptor';
import { SandboxModule } from './sandbox/sandbox.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AlertModule } from './alert/alert.module';
import { GroupsModule } from './groups/groups.module';
import { PaymentsModule } from './payments/payments.module';
import { QueueModule } from './queues/queue.module';
import { SettlementsModule } from './settlements/settlements.module';
import { StellarModule } from './stellar/stellar.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string | undefined>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME', 'cheesepay'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    HealthModule,
    MerchantAnalyticsModule,
    AdminAlertModule,
    AuthModule,
    MerchantsModule,
    UsersModule,
    PinModule,
    TransfersModule,
    WithdrawalsModule,
    SecurityModule,
    BankAccountsModule,
    VirtualAccountModule,
    PayLinkModule,
    ReceiveModule,

    AuditModule,

    // Runtime feature flags + maintenance mode.
    RuntimeConfigModule,

    AdminModule,

    // SMS — OTP + transaction alerts via Termii + BullMQ.
    SmsModule,
    OtpModule,

    // Push — Firebase Cloud Messaging device token management.
    PushModule,

    // Earnings — yield dashboard, APY display, projections.
    EarningsModule,

    // Passkey/WebAuthn authentication.
    PasskeyModule,

    // Transactions — activity history with cursor-based pagination.
    TransactionsModule,

    // Waitlist — viral pre-launch signups with referral points.
    WaitlistModule,

    // KYC — document submission and admin review for tier upgrades.
    KycModule,

    // Reports — async CSV data exports via BullMQ + R2.
    ReportsModule,

    SandboxModule,
    MaintenanceModule,
    AlertModule,
    GroupsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DeprecationHeadersInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    PaymentsModule,
    StellarModule,
    SettlementsModule,
    WebhooksModule,
    WaitlistModule,
    QueueModule,
  ],
})
export class AppModule {}
