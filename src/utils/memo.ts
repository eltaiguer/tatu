export function memoizeByReference<TInput extends object, TResult>(
  fn: (input: TInput) => TResult
): (input: TInput) => TResult {
  const cache = new WeakMap<TInput, TResult>()
  return (input: TInput) => {
    const cached = cache.get(input)
    if (cached !== undefined) return cached
    const result = fn(input)
    cache.set(input, result)
    return result
  }
}
