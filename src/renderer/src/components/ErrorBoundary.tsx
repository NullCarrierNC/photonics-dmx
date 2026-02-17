import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Fallback UI when an error is caught. Receives error and reset function. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** Optional label for logging (e.g. "App", "CueEditor") */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches JavaScript errors in the child tree and renders a fallback UI instead of crashing.
 * Use around major sections (e.g. App root, page content, cue editor canvas).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const name = this.props.name ?? 'ErrorBoundary';
    console.error(`[${name}] Caught error:`, error, errorInfo);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="p-6 rounded-lg bg-red-900/20 border border-red-500/50 text-red-200">
          <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
          <p className="text-sm font-mono mb-4 break-all">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-sm"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
