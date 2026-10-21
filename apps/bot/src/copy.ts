// Bot copy in BM and EN. Plain, short sentences; one action per message; victims never blamed.
import type { Lang } from "./channel.js";

type T = Record<Lang, string>;
export const tr = (t: T, lang: Lang) => t[lang];

export const COPY = {
  welcome: {
    en: "🛡️ <b>CrowdShield · Semak dulu</b>\n\nForward me a phone number, bank account, link or a suspicious message and I'll check it against scam reports.\n\nSent money to a scammer? Tap <b>Report a scam</b>: I'll help you report it and prepare your NSRC 997 call.",
    ms: "🛡️ <b>CrowdShield · Semak dulu</b>\n\nHantar nombor telefon, akaun bank, pautan atau mesej yang mencurigakan dan saya akan semak dengan laporan scam.\n\nSudah pindah wang kepada penipu? Tekan <b>Lapor scam</b>: saya akan bantu anda melapor dan sediakan panggilan NSRC 997.",
  },
  help: {
    en: "Send me any number, account (e.g. <code>Maybank 5123 4567 8812</code>), link, message or screenshot.\n\n/report: report a scam\n/invest: check an investment platform\n/lang: Bahasa Melayu / English\n/cancel: stop what we're doing",
    ms: "Hantar nombor, akaun (cth. <code>Maybank 5123 4567 8812</code>), pautan, mesej atau tangkapan skrin.\n\n/report: lapor scam\n/invest: semak platform pelaburan\n/lang: Bahasa Melayu / English\n/cancel: berhenti",
  },
  nothingFound: {
    en: "I couldn't find a phone number, bank account or link in that. Send one, e.g. <code>011-2345 6789</code>, <code>Maybank 5123 4567 8812</code> or a link.",
    ms: "Saya tidak menemui nombor telefon, akaun bank atau pautan. Hantar satu, cth. <code>011-2345 6789</code>, <code>Maybank 5123 4567 8812</code> atau pautan.",
  },
  photoLater: {
    en: "📷 Reading screenshots is coming soon. For now, please type or paste the number, account or link from it.",
    ms: "📷 Membaca tangkapan skrin akan datang tidak lama lagi. Buat masa ini, sila taip atau tampal nombor, akaun atau pautan daripadanya.",
  },
  checkFailed: {
    en: "Sorry, I couldn't check that right now. Please try again in a minute.",
    ms: "Maaf, saya tidak dapat menyemak sekarang. Sila cuba lagi sebentar lagi.",
  },
  rateLimited: {
    en: "You're sending messages very fast. Please wait a minute.",
    ms: "Anda menghantar mesej terlalu cepat. Sila tunggu seminit.",
  },
  cancelled: {
    en: "OK, stopped. Send me anything to check.",
    ms: "Baik, dihentikan. Hantar apa-apa untuk disemak.",
  },
  langSet: { en: "Language: English", ms: "Bahasa: Bahasa Melayu" },
  btnReport: { en: "🚩 Report this", ms: "🚩 Lapor ini" },
  btnReportScam: { en: "🚩 Report a scam", ms: "🚩 Lapor scam" },
  btn997: { en: "📞 Call 997", ms: "📞 Hubungi 997" },
  btnWhy: { en: "❓ Why this result?", ms: "❓ Kenapa keputusan ini?" },
  call997: {
    en: "📞 <b>Call NSRC 997 now</b> if you have transferred money. NSRC answers 24/7, and the faster you call, the more can be frozen.\n\nTap <b>Report a scam</b> first and I'll prepare a call sheet so the call is quicker.",
    ms: "📞 <b>Hubungi NSRC 997 sekarang</b> jika anda telah memindahkan wang. NSRC beroperasi 24/7, dan lebih cepat anda menelefon, lebih banyak boleh dibekukan.\n\nTekan <b>Lapor scam</b> dahulu dan saya akan sediakan helaian panggilan supaya panggilan lebih cepat.",
  },
  whyTitle: { en: "<b>Why this result</b>", ms: "<b>Kenapa keputusan ini</b>" },
  whyNone: {
    en: "We have no reports about this yet. Scammers change numbers often, so stay careful: police and BNM never ask you to transfer money.",
    ms: "Belum ada laporan mengenai ini. Penipu kerap menukar nombor, jadi kekal berhati-hati: polis dan BNM tidak pernah meminta anda memindahkan wang.",
  },
  whyPrivacy: {
    en: "Reporters are never identified.",
    ms: "Identiti pelapor tidak pernah didedahkan.",
  },
  confidence: { en: "Confidence", ms: "Keyakinan" },
  lastReported: { en: "last reported", ms: "laporan terakhir" },
  campaign: { en: "Campaign", ms: "Kempen" },
  whatToDo: { en: "What to do", ms: "Apa perlu dibuat" },

  reading: { en: "📷 Reading your screenshot…", ms: "📷 Membaca tangkapan skrin anda…" },
  readFailed: {
    en: "Sorry, I couldn't read that screenshot. Please type or paste the number, account or link from it.",
    ms: "Maaf, saya tidak dapat membaca tangkapan skrin itu. Sila taip atau tampal nombor, akaun atau pautan daripadanya.",
  },
  iRead: { en: "📷 <b>What I see</b>", ms: "📷 <b>Apa yang saya lihat</b>" },
  looksLike: { en: "Looks like", ms: "Kelihatan seperti" },
  noIdsInShot: {
    en: "I didn't find a phone number, account or link in it. If you have one, send it to me.",
    ms: "Saya tidak menemui nombor telefon, akaun atau pautan di dalamnya. Jika ada, hantarkan kepada saya.",
  },
  notAScam: {
    en: "This doesn't look like a known scam pattern, but stay careful. Send me any number, account or link in it to check.",
    ms: "Ini tidak kelihatan seperti corak scam yang diketahui, tetapi kekal berhati-hati. Hantar nombor, akaun atau pautan di dalamnya untuk disemak.",
  },
  webTitle: { en: "🌐 <b>Web check</b>", ms: "🌐 <b>Semakan web</b>" },
  webFound: {
    en: "found {n} mention(s) online. These are leads, not confirmation:",
    ms: "menemui {n} sebutan dalam talian. Ini petunjuk, bukan pengesahan:",
  },
  linkTitle: {
    en: "🔗 <b>Link check</b> (we opened it safely, so you don't have to)",
    ms: "🔗 <b>Semakan pautan</b> (kami membukanya dengan selamat untuk anda)",
  },
  linkFake: {
    en: "⚠️ Looks like a fake {who} page.",
    ms: "⚠️ Kelihatan seperti halaman {who} palsu.",
  },
  linkAsksLogin: {
    en: "It asks for a login, OTP or card details.",
    ms: "Ia meminta log masuk, OTP atau butiran kad.",
  },
  linkApk: {
    en: "It offers an app (APK) download. Don't install it.",
    ms: "Ia menawarkan muat turun aplikasi (APK). Jangan pasang.",
  },
  linkDontOpen: { en: "Don't open it.", ms: "Jangan buka." },
  linkOk: {
    en: "No obvious warning signs on the page. Still, never enter a password or OTP from a link someone sent you.",
    ms: "Tiada tanda amaran yang jelas pada halaman. Namun, jangan sekali-kali masukkan kata laluan atau OTP daripada pautan yang dihantar orang.",
  },
  linkUnreachable: {
    en: "The page couldn't be opened (it may be down or blocking checks). Don't enter passwords or OTPs from links.",
    ms: "Halaman tidak dapat dibuka (mungkin ditutup atau menyekat semakan). Jangan masukkan kata laluan atau OTP daripada pautan.",
  },
  investAsk: {
    en: "Send /invest followed by the platform or company name, e.g. <code>/invest Qorvanta</code>",
    ms: "Hantar /invest diikuti nama platform atau syarikat, cth. <code>/invest Qorvanta</code>",
  },
  investTitle: { en: "📈 <b>Investment check</b>", ms: "📈 <b>Semakan pelaburan</b>" },
  investFound: {
    en: "found on regulator lists or in the news. Do not invest before checking these:",
    ms: "ditemui dalam senarai pengawal selia atau berita. Jangan melabur sebelum menyemak ini:",
  },
  investNone: {
    en: "nothing found on the SC / BNM alert lists or in the news. That isn't approval: check that the company is licensed on sc.com.my before investing.",
    ms: "tiada dalam senarai amaran SC / BNM atau berita. Ini bukan kelulusan: pastikan syarikat berlesen di sc.com.my sebelum melabur.",
  },
  evidenceKept: {
    en: "🗂️ Screenshot kept as evidence for your report.",
    ms: "🗂️ Tangkapan skrin disimpan sebagai bukti untuk laporan anda.",
  },

  // ---------- report flow ----------
  askScamType: {
    en: "🚩 <b>Report a scam</b>\n\nWhat kind of scam was it?",
    ms: "🚩 <b>Lapor scam</b>\n\nApakah jenis scam ini?",
  },
  askIdentifiers: {
    en: "Send me the scammer's phone number, account or link (you can send several). Tap <b>Done</b> when finished.",
    ms: "Hantar nombor telefon, akaun atau pautan penipu (boleh hantar beberapa). Tekan <b>Selesai</b> apabila selesai.",
  },
  added: { en: "Added", ms: "Ditambah" },
  needOne: {
    en: "Please send at least one number, account or link first.",
    ms: "Sila hantar sekurang-kurangnya satu nombor, akaun atau pautan dahulu.",
  },
  askLost: { en: "Did you lose money?", ms: "Adakah anda kehilangan wang?" },
  askAmount: {
    en: "How much did you lose in total? (RM, e.g. <code>12000</code>)",
    ms: "Berapa jumlah kerugian anda? (RM, cth. <code>12000</code>)",
  },
  badAmount: {
    en: "Please send just the amount, e.g. <code>12000</code>.",
    ms: "Sila hantar jumlah sahaja, cth. <code>12000</code>.",
  },
  askPayee: {
    en: "Which account did you transfer to? Send the bank and account number (e.g. <code>CIMB 8001 2345 6677</code>), or tap Skip.",
    ms: "Ke akaun mana anda pindahkan wang? Hantar nama bank dan nombor akaun (cth. <code>CIMB 8001 2345 6677</code>), atau tekan Langkau.",
  },
  askWhen: { en: "When did you transfer the money?", ms: "Bila anda memindahkan wang?" },
  askTxnRef: {
    en: "Do you have the transaction reference number from your bank app? Send it, or tap Skip. (NSRC uses it to trace the money.)",
    ms: "Adakah anda mempunyai nombor rujukan transaksi daripada aplikasi bank? Hantar, atau tekan Langkau. (NSRC menggunakannya untuk mengesan wang.)",
  },
  askState: { en: "Which state are you in?", ms: "Anda berada di negeri mana?" },
  askConsent: {
    en: "Can we share this report with NSRC / PDRM to help trace the money and warn others? Your name is never shared publicly.",
    ms: "Bolehkah kami kongsi laporan ini dengan NSRC / PDRM untuk membantu mengesan wang dan memberi amaran kepada orang lain? Nama anda tidak akan didedahkan kepada umum.",
  },
  submitting: { en: "Sending your report…", ms: "Menghantar laporan anda…" },
  thanksNearMiss: {
    en: "✅ <b>Thank you.</b> Your report helps warn the next person who gets the same call or message.",
    ms: "✅ <b>Terima kasih.</b> Laporan anda membantu memberi amaran kepada orang seterusnya yang menerima panggilan atau mesej yang sama.",
  },
  thanksLoss: {
    en: "✅ <b>Report received.</b> This is not your fault: these scams are run by organised syndicates.\n\n<b>Next: call 997 now</b> and read from the sheet below.",
    ms: "✅ <b>Laporan diterima.</b> Ini bukan salah anda: scam ini dijalankan oleh sindiket teratur.\n\n<b>Seterusnya: hubungi 997 sekarang</b> dan baca daripada helaian di bawah.",
  },
  duplicate: {
    en: "You already reported this; I've kept your earlier report.",
    ms: "Anda sudah melaporkan ini; laporan terdahulu anda disimpan.",
  },
  askNsrc: {
    en: "After the call, send me the <b>NSRC reference number</b> (or police report number) they give you. It makes your report stronger.",
    ms: "Selepas panggilan, hantar <b>nombor rujukan NSRC</b> (atau nombor laporan polis) yang diberi. Ia mengukuhkan laporan anda.",
  },
  nsrcSaved: {
    en: "✅ Saved. Thank you, and take care.",
    ms: "✅ Disimpan. Terima kasih, dan jaga diri.",
  },
  reportFailed: {
    en: "Sorry, I couldn't send the report. Please try again with /report.",
    ms: "Maaf, laporan tidak dapat dihantar. Sila cuba lagi dengan /report.",
  },
  yes: { en: "Yes", ms: "Ya" },
  no: { en: "No", ms: "Tidak" },
  skip: { en: "Skip", ms: "Langkau" },
  done: { en: "✅ Done", ms: "✅ Selesai" },
  shareYes: { en: "Yes, share", ms: "Ya, kongsi" },
  shareNo: { en: "No", ms: "Tidak" },
  whenHour: { en: "Within the last hour", ms: "Dalam sejam lalu" },
  whenToday: { en: "Earlier today", ms: "Awal hari ini" },
  whenYesterday: { en: "Yesterday", ms: "Semalam" },
  whenEarlier: { en: "Before that", ms: "Sebelum itu" },
} as const satisfies Record<string, T>;

export const REPORT_SCAM_TYPES = [
  ["macau_impersonation", { en: "👮 Fake police / BNM / bank", ms: "👮 Polis / BNM / bank palsu" }],
  ["investment", { en: "📈 Investment", ms: "📈 Pelaburan" }],
  ["parcel", { en: "📦 Parcel / courier", ms: "📦 Bungkusan / kurier" }],
  ["job_task", { en: "💼 Part-time job", ms: "💼 Kerja sambilan" }],
  ["love_romance", { en: "💔 Love scam", ms: "💔 Scam cinta" }],
  ["ecommerce", { en: "🛒 Online shopping", ms: "🛒 Belian dalam talian" }],
  ["loan", { en: "💸 Loan", ms: "💸 Pinjaman" }],
  [
    "phishing_link",
    { en: "🔗 Link asking for login / OTP", ms: "🔗 Pautan minta log masuk / OTP" },
  ],
  ["other", { en: "Other", ms: "Lain-lain" }],
] as const;

export const STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Putrajaya",
  "Labuan",
] as const;
