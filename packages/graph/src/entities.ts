import { entity } from "@crowdshield/db";
import { identify, type IdentifierType, type NormaliseOptions } from "@crowdshield/normalise";
import { sql } from "drizzle-orm";
import type { DbOrTx, Secrets } from "./types.js";

export interface UpsertedEntity {
  id: number;
  type: IdentifierType;
  masked: string;
  lookupHash: Buffer;
}

/**
 * Normalises, hashes and upserts an identifier. The raw value is only stored encrypted
 * (pgp_sym_encrypt); everything else uses the hash or the masked form.
 */
export async function upsertEntity(
  db: DbOrTx,
  secrets: Secrets,
  type: IdentifierType,
  raw: string,
  options: NormaliseOptions & {
    protected?: boolean;
    attrs?: Record<string, unknown>;
    seenAt?: Date;
  } = {},
): Promise<UpsertedEntity> {
  const id = identify(type, raw, secrets.pepper, options);
  const seenAt = options.seenAt ?? new Date();
  const [row] = await db
    .insert(entity)
    .values({
      type,
      lookupHash: id.lookupHash,
      valueEnc: sql`pgp_sym_encrypt(${id.value}, ${secrets.encKey})`,
      // official numbers are public and users need them to call back: shown in full
      displayMasked: options.protected ? id.value : id.masked,
      attrs: { ...id.attrs, ...options.attrs },
      protected: options.protected ?? false,
      firstSeen: seenAt,
      lastSeen: seenAt,
    })
    .onConflictDoUpdate({
      target: [entity.type, entity.lookupHash],
      set: {
        firstSeen: sql`least(${entity.firstSeen}, excluded.first_seen)`,
        lastSeen: sql`greatest(${entity.lastSeen}, excluded.last_seen)`,
        attrs: sql`${entity.attrs} || excluded.attrs`,
        protected: sql`${entity.protected} OR excluded.protected`,
        displayMasked: sql`CASE WHEN excluded.protected THEN excluded.display_masked ELSE ${entity.displayMasked} END`,
      },
    })
    .returning({ id: entity.id });
  return { id: row!.id, type, masked: id.masked, lookupHash: id.lookupHash };
}

/** Finds an entity by identifier without creating it (the lookup path). */
export async function findEntity(
  db: DbOrTx,
  secrets: Secrets,
  type: IdentifierType,
  raw: string,
  options: NormaliseOptions = {},
) {
  const id = identify(type, raw, secrets.pepper, options);
  const [row] = await db
    .select({
      id: entity.id,
      masked: entity.displayMasked,
      protected: entity.protected,
      status: entity.status,
    })
    .from(entity)
    .where(sql`${entity.type} = ${type} AND ${entity.lookupHash} = ${id.lookupHash}`);
  return { identifier: id, entity: row ?? null };
}
