import { POLICY_VERSION } from "@crowdshield/contracts";
import { auditLog } from "@crowdshield/db";
import type { DbOrTx } from "@crowdshield/graph";
import { Injectable } from "@nestjs/common";
import { type Db, InjectDb } from "../infra.js";
import { actorId, type Principal } from "./auth.js";

/** audit_log writer. Detail must never contain raw identifiers or reporter identities. */
@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Db) {}

  async log(
    p: Principal | undefined,
    action: string,
    entityId: number | null,
    detail: Record<string, unknown> = {},
    tx: DbOrTx = this.db,
  ) {
    await tx.insert(auditLog).values({
      actor: actorId(p),
      orgId: p?.kind === "user" || p?.kind === "partner" ? p.orgId : null,
      action,
      entityId,
      detail: {
        ...detail,
        via: p?.kind === "service" ? p.name : (p?.kind ?? "anonymous"),
      },
      policyVersion: POLICY_VERSION,
    });
  }
}
