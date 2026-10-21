// Outside services the bot uses directly: the internal ML gateway (reading screenshots, classifying
// story-only messages) and object storage for evidence. Everything else goes through the API.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import type { Media } from "./channel.js";

export interface ScreenshotReading {
  text: string;
  scam_type: string;
  language: string;
  urgency: boolean;
  impersonating: string | null;
  summary: { en: string; ms: string };
  needs_review: boolean;
}

export interface TextClassification {
  scam_type: string;
  impersonating: string | null;
  summary: { en: string; ms: string };
  needs_review: boolean;
}

export interface Ml {
  screenshot(media: Media): Promise<ScreenshotReading>;
  classify(text: string): Promise<TextClassification>;
}

export interface EvidenceStore {
  /** Stores the original file (hashed at upload for integrity); returns its s3:// URI. */
  put(media: Media, channel: string): Promise<{ storageUri: string; sha256: string }>;
}

export function mlClient(baseUrl: string, key: string): Ml {
  const post = async <T>(
    path: string,
    body: string | FormData,
    json: boolean,
    timeoutMs: number,
  ): Promise<T> => {
    const res = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { "x-internal-key": key, ...(json ? { "content-type": "application/json" } : {}) },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ML gateway ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    screenshot: (m) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(m.data)], { type: m.mime }), "screenshot");
      return post("/v1/screenshot", form, false, 30_000);
    },
    classify: (text) => post("/v1/classify", JSON.stringify({ text }), true, 20_000),
  };
}

export function s3Evidence(opts: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): EvidenceStore {
  const s3 = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: true,
    credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
  });
  return {
    async put(m, channel) {
      const sha256 = createHash("sha256").update(m.data).digest("hex");
      const ext = m.mime === "image/png" ? "png" : m.mime === "application/pdf" ? "pdf" : "jpg";
      const key = `${channel}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: m.data,
          ContentType: m.mime,
          Metadata: { sha256 },
        }),
      );
      return { storageUri: `s3://${opts.bucket}/${key}`, sha256 };
    },
  };
}
