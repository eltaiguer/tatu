/**
 * Who an expense is for: the household/family (UI "Hogar") or just the user
 * ("Personal"). Independent of the category, which says what it was.
 */
export type Scope = 'household' | 'personal'

/**
 * A row's scope as every surface reads it: 'unassigned' ("Sin definir") is an
 * uncategorized row nobody has placed yet.
 */
export type ResolvedScopeValue = Scope | 'unassigned'
