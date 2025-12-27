import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  handleReset = () => {
    this.setState({ hasError: false })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
          Something went wrong
        </p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
          We hit an unexpected error.
        </h2>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Try resetting the view. Your data is still safe.
        </p>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-6 rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          Reset view
        </button>
      </div>
    )
  }
}
