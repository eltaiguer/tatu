import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollapsibleSection } from './CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders content when open', () => {
    render(
      <CollapsibleSection id="overview" title="Overview" isOpen>
        <div>Details</div>
      </CollapsibleSection>
    )

    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('hides content when closed', () => {
    render(
      <CollapsibleSection id="overview" title="Overview" isOpen={false}>
        <div>Details</div>
      </CollapsibleSection>
    )

    expect(screen.queryByText('Details')).toBeNull()
  })

  it('toggles when clicking the header', () => {
    const handleToggle = vi.fn()

    render(
      <CollapsibleSection
        id="overview"
        title="Overview"
        isOpen={false}
        onToggle={handleToggle}
      >
        <div>Details</div>
      </CollapsibleSection>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    expect(handleToggle).toHaveBeenCalledWith(true)
  })
})
