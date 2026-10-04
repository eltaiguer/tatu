import type { Dispatch, SetStateAction } from 'react'
import { Button } from '../ui/button'

export function TransactionsPagination({
  filteredCount,
  startIndex,
  pageRowCount,
  displayedRowCount,
  currentPage,
  setCurrentPage,
  safeTotalPages,
}: {
  filteredCount: number
  startIndex: number
  // Rows on the current page.
  pageRowCount: number
  displayedRowCount: number
  currentPage: number
  setCurrentPage: Dispatch<SetStateAction<number>>
  safeTotalPages: number
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        {filteredCount === 0
          ? 'Mostrando 0 de 0'
          : `Mostrando ${startIndex + 1}-${startIndex + pageRowCount} de ${displayedRowCount}`}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={currentPage === 1}
        >
          Anterior
        </Button>
        <div className="flex items-center gap-1">
          {(() => {
            const pages: (number | '...')[] = []
            if (safeTotalPages <= 7) {
              for (let i = 1; i <= safeTotalPages; i++) pages.push(i)
            } else {
              pages.push(1)
              if (currentPage > 3) pages.push('...')
              for (
                let i = Math.max(2, currentPage - 1);
                i <= Math.min(safeTotalPages - 1, currentPage + 1);
                i++
              )
                pages.push(i)
              if (currentPage < safeTotalPages - 2) pages.push('...')
              pages.push(safeTotalPages)
            }
            return pages.map((p, i) =>
              p === '...' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="px-1 text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={currentPage === p ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(p)}
                  className="w-10"
                >
                  {p}
                </Button>
              )
            )
          })()}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setCurrentPage((page) => Math.min(safeTotalPages, page + 1))
          }
          disabled={currentPage === safeTotalPages}
        >
          Siguiente
        </Button>
      </div>
    </div>
  )
}
