import { Checkbox } from '../ui/checkbox'
import { RadioGroup } from '../ui/radio-group'
import type { HouseholdDraft } from './useHouseholdDraft'

/**
 * The edit dialog's Hogar group (Sí / No / "Según …") and, under it, the
 * "Recordar para todas las de …" box. All state lives in `useHouseholdDraft`.
 */
export function HouseholdField({ draft }: { draft: HouseholdDraft }) {
  return (
    <>
      {draft.show && (
        <RadioGroup
          legend={
            <>
              Hogar
              {!draft.canMakeRule && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · solo esta transacción
                </span>
              )}
            </>
          }
          description={draft.savedLine}
          name="household"
          value={draft.shownChoice}
          onChange={draft.pick}
          onReselect={draft.pick}
          options={[
            ...(draft.remembered
              ? []
              : [{ value: 'category' as const, label: draft.followLabel }]),
            { value: 'yes', label: 'Sí' },
            { value: 'no', label: 'No' },
          ]}
        />
      )}

      {draft.canMakeRule && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="household-remember"
            className="mt-0.5"
            checked={draft.remember}
            onCheckedChange={(checked) =>
              draft.toggleRemember(checked === true)
            }
            aria-describedby="household-remember-hint"
          />
          <div className="min-w-0">
            <label
              htmlFor="household-remember"
              className="cursor-pointer text-sm [overflow-wrap:anywhere]"
            >
              {draft.rememberLabel}
            </label>
            <p
              id="household-remember-hint"
              className="text-xs text-muted-foreground"
            >
              {draft.hint}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
