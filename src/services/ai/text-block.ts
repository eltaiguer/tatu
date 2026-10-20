/**
 * The text of a Claude response. The 5.5 models think by default, so the
 * first content block can be a `thinking` block (with empty text) before the
 * answer: read the first *text* block, never `content[0]`.
 */
export function firstTextBlock(
  content: Array<{ type: string; text?: string }>
): string {
  const block = content.find((b) => b.type === 'text')
  if (!block || typeof block.text !== 'string') {
    throw new Error(
      `Respuesta inesperada del modelo (tipo: ${content[0]?.type ?? 'vacío'})`
    )
  }
  return block.text
}
