/**
 * The text of a Claude response, or a Spanish error that names what went
 * wrong. The 5.5 models think by default, so the first content block can be
 * a `thinking` block (with empty text) before the answer: read the first
 * *text* block, never `content[0]`. Their safety classifiers can also
 * decline a request (HTTP 200, `stop_reason: "refusal"`, no text), and a
 * thinking-heavy turn can hit `max_tokens` before any text — each of those
 * gets its own message, since "unexpected block type" would point at the
 * wrong cause.
 */
export interface ClaudeResponseLike {
  content: Array<{ type: string; text?: string }>
  stop_reason?: string | null
  stop_details?: { category?: string | null } | null
}

export function firstTextBlock(response: ClaudeResponseLike): string {
  if (response.stop_reason === 'refusal') {
    const category = response.stop_details?.category
    throw new Error(
      `El modelo rechazó la solicitud${category ? ` (${category})` : ''}.`
    )
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      'La respuesta del modelo quedó truncada (límite de tokens alcanzado).'
    )
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || typeof block.text !== 'string') {
    throw new Error('Respuesta inesperada del modelo (sin bloque de texto).')
  }
  return block.text
}
