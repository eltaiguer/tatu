---
name: change-ai-prompt-or-model
description: Checklist for changing Tatu's Claude integration. Use when editing a prompt, swapping or adding a model ID, changing what is sent to Claude, or how its response is parsed — for AI categorization or AI Insights.
---

# Change an AI prompt or model

Every Claude call runs in the browser with the user's own key (BYO,
`dangerouslyAllowBrowser`) — there is no backend, and each call costs the user
money. Every call goes through `createClaudeClient`
(`src/services/ai/claude-client.ts`): it owns the SDK, sends `{ model, system,
user, maxTokens, effort, cacheSystem? }` and returns the answer's text, or
throws an `AiError` (`src/services/ai/ai-error.ts`) whose `kind` decides the
Spanish message, whether a batch loop goes on (`retryable`) and whether Sentry
hears of it (`isUnexpectedAiError`: only `bad_response` and non-`AiError`s).
Two features use it:

| Feature                    | Prompt + call                                                                                                     | Parsing / guardrails                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Categorization at import   | `buildSystemPrompt` / `buildUserMessage` in `transaction-ai.ts`                                                   | `validateCategory`, `applyAiEnrichment`, `parseBatchResponse` |
| Insights                   | `insight-prompt.ts`, `generateInsights` in `insight-generator.ts`                                                 | `parseInsightsResponse`, `sanitizeInsight`                    |
| Dev panel pattern analysis | `analyzeTransactionPatterns` in `prompt-analysis.ts`                                                              | —                                                             |
| Dev panel evaluation (Jev) | `classifyWithJev` in `jev-classifier.ts` (TypeSafe Jev via OpenRouter, category only, `JEV_MODEL` in `models.ts`) | answers validated against the offered category ids            |

For SDK, model and parameter facts, load the `claude-api` skill if available;
don't work from memory.

## Rules

- **Model IDs live in `src/services/ai/models.ts` only** (`INSIGHTS_MODEL`,
  `CATEGORIZATION_MODELS`, `DEFAULT_CATEGORIZATION_MODEL`). Import them; never
  inline a model string in code. Exception: the `ai_model` column default in
  `supabase/schema.sql` mirrors `DEFAULT_CATEGORIZATION_MODEL`, so changing the
  default is also a schema change (`add-supabase-column` skill). Users keep
  whatever ID is stored in `user_preferences`, so a removed ID needs a
  fallback for existing rows.
- **The model narrates, never computes** (ADR-0001,
  `docs/decisions/0001-ai-spending-insights.md`). Every number in
  `InsightInput` is pre-computed and converted by `buildInsightInput`
  (`insight-data.ts`). `sanitizeInsight` drops any amount, category or
  merchant not present in that input. Ask the model to pick and explain, never
  to add, average or convert; a new number goes into `InsightInput`, computed
  in code under the `money-math` skill.
- **Parse defensively.** Responses are free text parsed as JSON by
  `parseModelJson` (fences stripped; a parse failure is a `bad_response`);
  the client detects `max_tokens` truncation and refusals. An invalid category or field is
  dropped, not trusted. AI categorization is best-effort: a failure keeps the
  rule-based result and surfaces `aiError`.
- **The insights cache doesn't see prompt or model changes.** `ai_insights`
  holds one row per user; `hashInsightInput` (`insight-cache.ts`) hashes only
  the `InsightInput`, so `isStale` flips on data changes alone. After a prompt
  or model change, cached insights stay until the user regenerates. Changing
  the `InsightInput` shape does mark every cache row stale.

## Steps

1. **Red.** A failing test for the behavior, with a fake Claude client
   (`fakeClaudeClient` in `src/test/fake-claude-client.ts`) passed as the
   caller's last argument — never `vi.mock('@anthropic-ai/sdk')` (see
   `insight-generator.test.ts`, `transaction-ai.test.ts`): what the request
   carries (model, system prompt fragment, input, effort) and how a response —
   including a malformed or hallucinated one — is parsed. How the SDK is
   called and its errors classified is `claude-client.test.ts`.
2. **Green.** Change the prompt, parsing or model constant.
3. **Real call.** Tests can't judge prompt quality. Try it in the running app
   (`run` skill, your own key in Configuración) or the AI dev panels in
   Configuración, and note what you saw in the PR.
4. **Docs.** A changed decision (model choice, what's sent, caching) goes in an
   ADR in `docs/decisions/`, or amends ADR-0001/0002.
