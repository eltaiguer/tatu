---
name: add-view
description: Checklist for adding, renaming or removing a top-level Tatu view or route. Use when a new page needs a sidebar entry and URL, or when changing a view's path or page title.
---

# Add a view / route

The URL is the source of truth for the current view. A view touches five
places, and TypeScript only catches the ones keyed by `View`.

## Steps

1. **Red.** Extend `src/routes.test.ts` (path ↔ view both ways, the title) and
   add an integration case to `src/App.test.tsx`: clicking the sidebar item
   renders the view and sets the URL, and loading the path directly renders
   it. Watch both fail.
2. **Green**, in this order:
   - `View` union and the sidebar nav groups in
     `src/components/AppSidebar.tsx` (label in Spanish, a lucide icon).
   - `VIEW_PATHS` and `VIEW_TITLES` in `src/routes.ts`. Paths are lowercase
     Spanish without accents (`/categorias`); `titleForView` appends
     `· Tatú`.
   - A memoized loader, a `retryableLazy` export and an entry in
     `preloadViews` in `src/lazy-views.tsx`.
   - The `currentView === '…'` render branch in `src/App.tsx`, inside the
     existing `ViewErrorBoundary` + `Suspense`.
3. **Copy.** UI text is rioplatense Spanish with voseo — see the UI copy guide
   in `docs/CONTEXT.md`. Page header via `src/components/ui/page-header.tsx`.
4. **Docs.** Same PR: the Views table in `docs/CONTEXT.md`, and "Navigation &
   views" plus the project structure in `AGENTS.md`.
5. **Look at it.** Use the `run` skill to check the view in the real app.

## Gotchas

- Unknown paths fall back to Resumen **without** a redirect (a redirect could
  drop a password-recovery hash). Keep it that way.
- A dialog (like import) is not a view: it gets no route.
- Filters belong in the query string (`src/services/filters/url-filters.ts`),
  not in new paths.
