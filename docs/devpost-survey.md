# Devpost: Nemotron on Nebius questions

Answers for the sponsor questions on the submission form. Figures come from `docs/model-eval.md` and `docs/model-choices.md`. The three 1–10 scores are suggestions; adjust them to your own view.

---

## Which model(s) did you use, and why did you choose that size/variant?

- **Nemotron 3 Ultra 550B (reasoning off)** classifies forwarded scam messages, judges web search results and reads link pages. We chose it by measurement: on our 41-message test set (Malay, English, mixed Malay-English, Chinese; 12 scam types plus normal messages) it scored 100% at 1.1 s median, both the most accurate and the fastest of the four we tested.
- **Nemotron 3 Ultra (reasoning on)** writes the fraud team's case brief and NSRC/PDRM referral note, and labels newly detected scam campaigns. These tasks need multi-step reasoning over timelines and money trails.
- **Nemotron 3.5 Super VL** reads scam screenshots and invoice PDFs. It's the vision model, and it keeps phone and account digits exact.
- **Nemotron 3 Super 120B** filters the weekly scam news: a batch job, not latency-sensitive.
- **Nemotron 3.5 Lightning and Nemotron 3 Nano 30B** (93% each) are configured fallbacks if cost becomes the constraint.
- **Qwen3-Embedding-8B** (1024 dimensions) embeds scam scripts for campaign matching.

## How would you rate Nemotron's output quality for your use case? (1–10)

**Suggested: 8/10.**

Worked well:
- **Classification:** 100% with clear type definitions, across Malay, English, mixed Malay-English and Chinese.
- **Instruction following:** strict JSON-schema decoding always produced valid output.
- **Vision:** reading screenshots and invoices exactly.
- **Reasoning:** case briefs cited the right evidence for every point and caught details like RM 3,000 missing from a money trail.

Fell short:
- **Malay wording:** small slips in formal Malay ("penyeludupan wang" for money laundering, misspellings).
- **Reading context:** it took an "official number" flag to mean "not used by scammers", and once recommended the wrong agency.
- **Runaway output:** at temperature 0, long JSON outputs sometimes ran into blank lines until the token limit.

All were fixed with clearer inputs, prompt rules and a small temperature, but they needed careful review.

## Did you fine-tune, prompt-engineer, or use Nemotron out of the box? What was your approach?

Prompt engineering with structured output; no fine-tuning.

- **Strict JSON-schema decoding** for every task, so outputs always parse and enums stay valid.
- **Measured before choosing.** A 41-message test set, run across four models with reasoning on and off. The biggest gain came from the prompt, not the model: defining all 12 scam types took Super from 68% to 100%.
- **Reasoning only where it helps.** It's off for classification and on for the case brief and campaign labels, controlled per request with `chat_template_kwargs.enable_thinking`.
- **Privacy:** IC, phone and account numbers are redacted before any text model sees them.
- **Safe decisions:** models read and draft; risk scores come from a deterministic evidence graph, never from a model.
- **Grounded briefs:** every point cites the case items it rests on. Unknowns go to a "gaps" list, and internal ids are stripped from the text.

## How did Nemotron's performance compare to other models you've used for similar tasks?

Our comparison was across the Nemotron family on the same test set, same prompt and same schema:

| Model | Accuracy | Median time |
|---|---|---|
| Ultra 550B | 100% | 1.1 s |
| Super 120B | 100% | 2.3 s |
| Nano 30B | 93% | 1.2 s |
| Lightning | 93% | 5.8 s |

The surprise was that the biggest model was also the fastest on Token Factory. Turning reasoning on didn't improve classification: Super was 2.5× slower for the same accuracy, and Ultra slipped to 98%. Relaxing strict enums produced invalid output in 40 of 41 cases.

For scam classification and reading Malaysian documents, Nemotron was accurate enough that the prompt mattered more than the model choice.

*(If you have your own experience with other model families on similar tasks, add a sentence here.)*

## Which Nebius platform capabilities were most valuable to your project and how?

We used **Nebius Token Factory** as a serverless, OpenAI-compatible API. We didn't provision GPU instances; our app runs on a small Docker host and calls Token Factory for all inference.

Most valuable:
- **Every Nemotron size behind one endpoint**, so switching model per task is one line of config. Our router picks Ultra, Super VL or Super per task, with Lightning and Nano as fallbacks.
- **Strict JSON-schema structured output** for every task.
- **Per-request reasoning control** (`chat_template_kwargs.enable_thinking`), with reasoning-token counts returned in the usage data. That let us show users an "AI trace" with model, prompt version, time and tokens.
- **Vision input** for screenshots and invoice pages.
- **An embeddings endpoint** with configurable dimensions, used for campaign matching in pgvector.
- **Low latency**, about 1 s for Ultra classification, so the bot answers interactively.

## How likely are you to recommend running Nemotron on Nebius to other developers? (1–10)

**Suggested: 9/10.**

- **Fast start:** an OpenAI-compatible API meant no new SDK, and every Nemotron size, plus vision, embeddings and strict structured output, worked from day one.
- **Real choices:** being able to evaluate four model sizes in an afternoon and route per task based on the results is what made our model choices measured rather than guessed.
- **Caveat:** one point off because long structured outputs needed tuning (a token budget large enough for reasoning, a small temperature to avoid runaway output).

## How would you rate your experience running Nemotron inference on Nebius compared to previous cloud or local development environments? (1–10)

**Suggested: 8/10.**

- **No infrastructure:** no GPUs to provision, no model weights to download, no serving stack. We could run a 550B model at about 1 s latency, which wouldn't be practical locally.
- **Easy switching:** moving between Ultra, Super, Nano and Lightning was a config change.
- **What would make it a 10:**
  - documented behaviour when reasoning tokens use up `max_tokens`;
  - guidance on structured output at temperature 0;
  - a Malaysian or Southeast Asian region for data residency, which our bank use case needs.

## What additional features or improvements would have made the Nemotron on Nebius experience more effective for your project?

- **A speech model on Token Factory.** Many scams arrive as WhatsApp voice notes, and we couldn't check them.
- **A data-residency option in Southeast Asia,** or clear documentation of data retention, for regulated users like banks.
- **Separate budgets for reasoning and answer tokens,** so long reasoning can't truncate the JSON answer.
- **A guard against runaway whitespace** in strict JSON decoding.
- **A batch API** for nightly jobs (news, campaign labelling, re-scoring).
- **A Nemotron embedding and reranker model on Token Factory,** so the whole pipeline could stay on Nemotron.

## What do you most hope to see from the Nemotron team next?

- **Stronger Southeast Asian language support,** especially formal Malay and code-switched Malay-English, the way people really write in Malaysia.
- **A Nemotron speech model** for transcribing scam voice notes and calls.
- **Smaller vision variants** with the same digit-exact reading, for cheaper screenshot checks at scale.
- **Published guidance** on reasoning budgets and structured output, drawn from the kinds of issues we hit.

## Which AI tools have you leveraged while working on this project?

**To build it:**
- **Claude Code (Anthropic)** as a pair-programming agent across the project: planning from our design documents, writing and refactoring the TypeScript and Python code, tests (unit, API end-to-end, browser), the model evaluation harness, debugging, Docker and AWS deployment, and the documentation, diagrams, pitch deck and this write-up. We reviewed and directed every change.

**Inside the product:**
- **NVIDIA Nemotron on Nebius Token Factory:**
  - Nemotron 3 Ultra classifies messages, judges web results, writes case briefs and labels campaigns.
  - Nemotron 3.5 Super VL reads screenshots and invoices.
  - Nemotron 3 Super filters the scam news.
  - Lightning and Nano are configured fallbacks.
- **Qwen3-Embedding-8B** (on Token Factory) for scam-script similarity in pgvector.
- **Tavily** for live web search, page extraction and news.
