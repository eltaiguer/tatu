import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './alert-dialog'

// The app's dialogs are controlled (open + onOpenChange) and have no
// DialogTrigger, so Radix has nothing to return focus to on close.
function ControlledDialog({ removeOpenerOnClose = false }) {
  const [open, setOpen] = useState(false)
  const [openerGone, setOpenerGone] = useState(false)
  return (
    <>
      <button type="button">Antes</button>
      {!openerGone && (
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
      )}
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen && removeOpenerOnClose) setOpenerGone(true)
        }}
      >
        <DialogContent>
          <DialogTitle>Diálogo</DialogTitle>
          <DialogDescription>Contenido</DialogDescription>
          <button type="button" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ControlledAlertDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Eliminar
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>¿Eliminar?</AlertDialogTitle>
          <AlertDialogDescription>No se puede deshacer.</AlertDialogDescription>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

describe('DialogContent focus', () => {
  it('returns focus to the button that opened it when closed with Escape', async () => {
    const user = userEvent.setup()
    render(<ControlledDialog />)
    const opener = screen.getByRole('button', { name: 'Abrir' })

    await user.click(opener)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('returns focus to the opener when closed from inside the dialog', async () => {
    const user = userEvent.setup()
    render(<ControlledDialog />)
    const opener = screen.getByRole('button', { name: 'Abrir' })

    await user.click(opener)
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('falls back to the page when the opener is gone after closing', async () => {
    const user = userEvent.setup()
    render(<ControlledDialog removeOpenerOnClose />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull()
    await waitFor(() => expect(document.body).toHaveFocus())
  })

  it('returns focus to the opener of a confirmation dialog', async () => {
    const user = userEvent.setup()
    render(<ControlledAlertDialog />)
    const opener = screen.getByRole('button', { name: 'Eliminar' })

    await user.click(opener)
    await screen.findByRole('alertdialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('names the close button in Spanish', async () => {
    const user = userEvent.setup()
    render(<ControlledDialog />)

    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(
      await screen.findByRole('button', { name: 'Cerrar' })
    ).toBeInTheDocument()
  })
})
