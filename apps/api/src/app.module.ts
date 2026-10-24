import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuditService } from "./common/audit.js";
import { AuthGuard, TokenService } from "./common/auth.js";
import { ErrorFilter } from "./common/errors.js";
import { IdempotencyService } from "./common/idempotency.js";
import { ResponseContractInterceptor } from "./common/route.js";
import { VerdictService } from "./common/verdicts.js";
import { InfraModule } from "./infra.js";
import { BankController, BankService } from "./modules/bank.js";
import { CampaignService, CampaignsController } from "./modules/campaigns.js";
import { CasesController } from "./modules/cases.js";
import { CoreController } from "./modules/core.controller.js";
import { EntitiesController } from "./modules/entities.js";
import { GraphActions } from "./modules/graph-actions.js";
import { ReportsController, ReportsService } from "./modules/reports.js";
import { SmeController, SupplierCheckService } from "./modules/sme/sme.js";
import { MoneyTrailController, MoneyTrailService } from "./modules/money-trail.js";
import { PublicCheckService, PublicController } from "./modules/public.js";
import { WebController } from "./modules/web.js";
import { MlClient } from "./common/ml.js";

@Module({
  imports: [InfraModule],
  controllers: [
    CoreController,
    ReportsController,
    BankController,
    CasesController,
    EntitiesController,
    SmeController,
    WebController,
    CampaignsController,
    PublicController,
    MoneyTrailController,
  ],
  providers: [
    TokenService,
    MlClient,
    AuditService,
    IdempotencyService,
    VerdictService,
    GraphActions,
    ReportsService,
    BankService,
    SupplierCheckService,
    CampaignService,
    PublicCheckService,
    MoneyTrailService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseContractInterceptor },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
