# UX audit 2026-11 — screenshots

Evidence for the UX audit issues filed 2026-11-17 (epic #288). Orphan branch,
never merged; delete it when the epic closes:
`git push origin --delete ux-audit-2026-11-screenshots`.

Every shot comes from a local run (`npm run dev:backend`) on a throwaway
account that imported only the three public files in `samples/` through the
app's own import dialog (AI categorization off, no hand edits), except:

- `resumen-dark-bank-rows-as-merchants.png`: the same account right after
  importing only `UYUmovements.csv`, in the dark theme.
- `insights-cards-MOCK-DATA.png`: insight text written by hand (a cache row
  inserted in the local DB) to exercise the card layout — not a Claude output.
