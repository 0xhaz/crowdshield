// Telegram channel adapter (grammY, long polling). Sessions and rate limits live in Redis;
// the conversation itself is in flow.ts, shared with future channels (WhatsApp).
import type { ApiClient } from "@crowdshield/contracts";
import { Bot, type Context, GrammyError, HttpError, InlineKeyboard } from "grammy";
import type { Redis } from "ioredis";
import type { InEvent, Lang, Media, OutMessage } from "./channel.js";
import { type Deps, handle, newSession, type Session } from "./flow.js";
import type { EvidenceStore, Ml } from "./services.js";

const SESSION_TTL_S = 24 * 3600;
const RATE_PER_MIN = 30;
const MAX_FILE = 8 * 1024 * 1024;

const langOf = (ctx: Context): Lang =>
  /^(ms|id)/.test(ctx.from?.language_code ?? "") ? "ms" : "en";

function fileLoader(ctx: Context, token: string, mimeHint: string): () => Promise<Media> {
  return async () => {
    const file = await ctx.getFile(); // for photos, Telegram returns the largest size
    if (!file.file_path || (file.file_size ?? 0) > MAX_FILE) {
      throw new Error("file too large or unavailable");
    }
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const mime = /\.png$/i.test(file.file_path)
      ? "image/png"
      : /\.webp$/i.test(file.file_path)
        ? "image/webp"
        : mimeHint;
    return { data: Buffer.from(await res.arrayBuffer()), mime };
  };
}

function toEvent(ctx: Context, token: string): InEvent | null {
  if (ctx.callbackQuery?.data) return { kind: "button", data: ctx.callbackQuery.data };
  const msg = ctx.message;
  if (!msg) return null;
  if (msg.photo) return { kind: "photo", load: fileLoader(ctx, token, "image/jpeg") };
  if (msg.document) {
    const mime = msg.document.mime_type ?? "application/octet-stream";
    return {
      kind: "document",
      fileName: msg.document.file_name,
      mime,
      load: fileLoader(ctx, token, mime),
    };
  }
  // forwarded messages and captions are checked like typed text
  const text = msg.text ?? msg.caption;
  if (!text) return null;
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (cmd) return { kind: "command", name: cmd[1]!.toLowerCase(), arg: cmd[2]!.trim() };
  return { kind: "text", text };
}

async function send(ctx: Context, out: OutMessage) {
  let keyboard: InlineKeyboard | undefined;
  if (out.buttons?.length) {
    keyboard = new InlineKeyboard();
    for (const row of out.buttons) {
      for (const b of row) {
        if (b.url) keyboard.url(b.label, b.url);
        else keyboard.text(b.label, b.data!);
      }
      keyboard.row();
    }
  }
  await ctx.reply(out.html, {
    parse_mode: "HTML",
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true }, // never preview a suspicious link
  });
}

export function createTelegramBot(
  token: string,
  api: ApiClient,
  redis: Redis,
  extra: { ml?: Ml; evidence?: EvidenceStore } = {},
) {
  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    // Private chats only: reports and verdicts are personal
    if (ctx.chat?.type !== "private" || !ctx.from) return;
    const minute = Math.floor(Date.now() / 60_000);
    const key = `bot:rl:tg:${ctx.from.id}:${minute}`;
    const n = await redis
      .multi()
      .incr(key)
      .expire(key, 70)
      .exec()
      .then(
        (r) => Number(r?.[0]?.[1] ?? 0),
        () => 0,
      );
    if (n > RATE_PER_MIN) {
      if (n === RATE_PER_MIN + 1)
        await ctx.reply(
          langOf(ctx) === "ms"
            ? "Anda menghantar mesej terlalu cepat. Sila tunggu seminit."
            : "You're sending messages very fast. Please wait a minute.",
        );
      return;
    }
    await next();
  });

  bot.on(["message", "callback_query:data"], async (ctx) => {
    const ev = toEvent(ctx, token);
    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
    if (!ev) return;
    const key = `bot:sess:tg:${ctx.chat!.id}`;
    const raw = await redis.get(key).catch(() => null);
    const session: Session = raw ? (JSON.parse(raw) as Session) : newSession(langOf(ctx));
    if (ev.kind !== "button") await ctx.replyWithChatAction("typing").catch(() => undefined);

    const followUps: (() => Promise<OutMessage[]>)[] = [];
    const deps: Deps = {
      api,
      userId: String(ctx.from!.id),
      channel: "telegram",
      ...extra,
      defer: (task) => followUps.push(task),
    };
    const out = await handle(ev, session, deps);
    await redis.set(key, JSON.stringify(session), "EX", SESSION_TTL_S).catch(() => undefined);
    for (const m of out) await send(ctx, m);

    // Follow-ups (web checks) arrive as extra messages; a failed one is skipped
    for (const task of followUps) {
      await ctx.replyWithChatAction("typing").catch(() => undefined);
      const more = await task().catch((e: Error) => {
        console.warn(`[bot] follow-up failed: ${e.message}`);
        return [];
      });
      for (const m of more) await send(ctx, m);
    }
  });

  bot.catch((err) => {
    const e = err.error;
    const what =
      e instanceof GrammyError
        ? `Telegram: ${e.description}`
        : e instanceof HttpError
          ? `network: ${e.message}`
          : String(e);
    console.error(`[bot] update ${err.ctx.update.update_id} failed: ${what}`);
  });

  return bot;
}

export async function setCommands(bot: Bot) {
  await bot.api.setMyCommands([
    { command: "report", description: "Report a scam" },
    { command: "invest", description: "Check an investment platform" },
    { command: "lang", description: "Bahasa Melayu / English" },
    { command: "help", description: "How to use" },
    { command: "cancel", description: "Stop the current step" },
  ]);
  await bot.api.setMyCommands(
    [
      { command: "report", description: "Lapor scam" },
      { command: "invest", description: "Semak platform pelaburan" },
      { command: "lang", description: "Bahasa Melayu / English" },
      { command: "help", description: "Cara guna" },
      { command: "cancel", description: "Hentikan langkah semasa" },
    ],
    { language_code: "ms" },
  );
  await bot.api.setMyDescription(
    "Semak dulu: check phone numbers, bank accounts, links and screenshots against scam reports in Malaysia. Report a scam and get ready for NSRC 997.",
  );
  await bot.api.setMyDescription(
    "Semak dulu: semak nombor telefon, akaun bank, pautan dan tangkapan skrin dengan laporan scam di Malaysia. Lapor scam dan bersedia untuk NSRC 997.",
    { language_code: "ms" },
  );
}
