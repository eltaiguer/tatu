import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createRootMock, renderMock } = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  renderMock: vi.fn(),
}))

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
  createRoot: createRootMock,
}))

vi.mock('./App.tsx', () => ({
  default: () => null,
}))

vi.mock('./services/firebase', () => ({}))

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="root"></div>'
    createRootMock.mockReturnValue({ render: renderMock })
  })

  it('creates react root and renders app tree', async () => {
    await import('./main')

    expect(createRootMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById('root')
    )
    expect(renderMock).toHaveBeenCalledTimes(1)
  })
})
