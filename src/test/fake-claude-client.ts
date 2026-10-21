import type { ClaudeClient, ClaudeRequest } from '../services/ai/claude-client'

/**
 * A `ClaudeClient` for tests: records every request and answers with
 * `reply` (its return value is the answer's text; throw an `AiError`, or any
 * error, to fail that call). `call` counts from 0.
 */
export function fakeClaudeClient(
  reply: (request: ClaudeRequest, call: number) => string | Promise<string>
): ClaudeClient & { requests: ClaudeRequest[] } {
  const requests: ClaudeRequest[] = []
  return {
    requests,
    async complete(request) {
      requests.push(request)
      return reply(request, requests.length - 1)
    },
  }
}
