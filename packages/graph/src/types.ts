import type { Db } from "@crowdshield/db";

/** A Drizzle database or transaction: everything here works inside either. */
export type DbOrTx = Pick<
  Db,
  "select" | "selectDistinct" | "insert" | "update" | "delete" | "execute"
>;

export interface Secrets {
  /** HMAC pepper for entity.lookup_hash (IDENTIFIER_HMAC_PEPPER). */
  pepper: string;
  /** Key for pgp_sym_encrypt(value_enc) (IDENTIFIER_ENC_KEY). Stand-in for KMS envelope encryption. */
  encKey: string;
}
