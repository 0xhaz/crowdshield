// Live web intelligence (techstacks_7 §4) through the ML gateway. Results are leads with citations:
// shown to users, never written into the graph as evidence until the lead weight is agreed (§7.8).
import type { IdentifierInput, InvestmentCheckInput, UrlCheckInput } from "@crowdshield/contracts";
import { normalise } from "@crowdshield/normalise";
import { Controller } from "@nestjs/common";
import type { z } from "zod";
import { AuditService } from "../common/audit.js";
import { CurrentPrincipal, type Principal } from "../common/auth.js";
import { MlClient } from "../common/ml.js";
import { Body, Route } from "../common/route.js";

type Leads = { query: string; leads: { relevant: boolean }[]; cached: boolean; fetchedAt: string };
const withCount = (l: Leads) => ({ ...l, relevantCount: l.leads.filter((x) => x.relevant).length });

@Controller()
export class WebController {
  constructor(
    private readonly ml: MlClient,
    private readonly audit: AuditService,
  ) {}

  @Route("webLeads")
  async leads(@Body() input: z.output<typeof IdentifierInput>, @CurrentPrincipal() p: Principal) {
    const id = normalise(input.type, input.value, input); // only the canonical identifier leaves the API
    const out = withCount(
      await this.ml.post<Leads>("/v1/web/identifier", { type: input.type, value: id.value }),
    );
    await this.audit.log(p, "web_leads", null, {
      type: input.type,
      relevant: out.relevantCount,
      cached: out.cached,
    });
    return out;
  }

  @Route("urlCheck")
  async urlCheck(@Body() input: z.output<typeof UrlCheckInput>, @CurrentPrincipal() p: Principal) {
    const url = normalise("url", input.url).value;
    const out = await this.ml.post<Record<string, unknown>>("/v1/web/url", { url }, 30_000);
    await this.audit.log(p, "url_check", null, {
      suspicious: (out.pageCheck as { suspicious?: boolean } | null)?.suspicious ?? null,
    });
    return out;
  }

  @Route("investmentCheck")
  async investment(
    @Body() input: z.output<typeof InvestmentCheckInput>,
    @CurrentPrincipal() p: Principal,
  ) {
    const out = withCount(
      await this.ml.post<Leads>("/v1/web/investment", { name: input.name.trim() }),
    );
    await this.audit.log(p, "investment_check", null, { relevant: out.relevantCount });
    return out;
  }
}
