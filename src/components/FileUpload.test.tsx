import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileUpload } from './FileUpload'

class MockFileReader {
  onloadend: (() => void) | null = null
  onprogress: ((event: ProgressEvent<FileReader>) => void) | null = null

  readAsArrayBuffer() {
    if (this.onprogress) {
      const event = {
        loaded: 50,
        total: 100,
        lengthComputable: true,
      } as ProgressEvent<FileReader>
      this.onprogress(event)
    }
    if (this.onloadend) {
      this.onloadend()
    }
  }
}

describe('FileUpload', () => {
  beforeEach(() => {
    vi.stubGlobal('FileReader', MockFileReader)
  })

  it('calls onFilesSelect when dropping a CSV', async () => {
    const onFilesSelect = vi.fn()
    render(<FileUpload onFilesSelect={onFilesSelect} />)

    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    const dropzone = screen.getByTestId('file-dropzone')

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      expect(onFilesSelect).toHaveBeenCalledWith([file])
    })
  })

  it('shows validation error for non-csv files', () => {
    const onFilesSelect = vi.fn()
    render(<FileUpload onFilesSelect={onFilesSelect} />)

    const file = new File(['data'], 'test.txt', { type: 'text/plain' })
    const dropzone = screen.getByTestId('file-dropzone')

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    })

    expect(screen.getByText('Only CSV files are supported.')).toBeInTheDocument()
    expect(onFilesSelect).not.toHaveBeenCalled()
  })

  it('handles multiple file selection', async () => {
    const onFilesSelect = vi.fn()
    render(<FileUpload onFilesSelect={onFilesSelect} />)

    const fileInput = screen.getByTestId('file-input')
    const files = [
      new File(['a'], 'a.csv', { type: 'text/csv' }),
      new File(['b'], 'b.csv', { type: 'text/csv' }),
    ]

    fireEvent.change(fileInput, { target: { files } })

    await waitFor(() => {
      expect(onFilesSelect).toHaveBeenCalledWith(files)
    })
  })

  it('shows upload progress while processing', () => {
    const onFilesSelect = vi.fn()
    render(<FileUpload onFilesSelect={onFilesSelect} />)

    const file = new File(['data'], 'test.csv', { type: 'text/csv' })
    const dropzone = screen.getByTestId('file-dropzone')

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    })

    expect(screen.getByText('Uploading... 50%')).toBeInTheDocument()
  })
})
