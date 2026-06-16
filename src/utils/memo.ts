export function memoizeByReference<TInput extends object, TResult>(
  fn: (input: TInput) => TResult
): (input: TInput) => TResult {
  const cache = new WeakMap<TInput, TResult>()
  return (input: TInput) => {
    if (cache.has(input)) return cache.get(input) as TResult
    const result = fn(input)
    cache.set(input, result)
    return result
  }
}
