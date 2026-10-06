import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * If true, renders an inline container preserving outer layouts (e.g. Navbar & Footer)
   */
  preserveHeader?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console in development, suppressed in production UI
    if (import.meta.env.DEV) {
      console.error('[HireByMinute ErrorBoundary]:', error, errorInfo);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.preserveHeader) {
        // Render within <main> preserving Header & Footer
        return (
          <div className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6">
            <div className="max-w-md w-full bg-white rounded-2xl border border-timberwolf/70 p-8 sm:p-10 text-center shadow-card space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200 shadow-xs">
                <AlertCircle className="w-7 h-7 text-amber-600" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-midnight tracking-tight">
                  Something went wrong
                </h2>
                <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed max-w-sm mx-auto">
                  Please refresh the page and try again.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs sm:text-sm font-bold hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-moonstone" />
                  <span>Refresh Page</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleReset}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-timberwolf bg-aliceblue/50 text-midnight text-xs sm:text-sm font-semibold hover:bg-aliceblue transition-all cursor-pointer"
                >
                  <Home className="w-4 h-4 text-midnight/60" />
                  <span>Go to Homepage</span>
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Root Full-Page Fallback (if top-level provider fails)
      return (
        <div className="min-h-screen bg-aliceblue flex flex-col items-center justify-center p-4 sm:p-6 text-midnight selection:bg-lightblue">
          <div className="max-w-md w-full bg-white rounded-3xl border border-timberwolf/70 p-8 sm:p-10 text-center shadow-card space-y-6">
            <div className="flex justify-center">
              <BrandLogo size="lg" asLink={false} />
            </div>

            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200 shadow-xs">
              <AlertCircle className="w-7 h-7 text-amber-600" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold text-midnight tracking-tight">
                Something went wrong
              </h1>
              <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed max-w-sm mx-auto">
                Please refresh the page and try again.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-midnight text-aliceblue text-xs sm:text-sm font-bold hover:bg-midnight-hover transition-all shadow-subtle cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-moonstone" />
                <span>Refresh Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-timberwolf bg-aliceblue/50 text-midnight text-xs sm:text-sm font-semibold hover:bg-aliceblue transition-all cursor-pointer"
              >
                <Home className="w-4 h-4 text-midnight/60" />
                <span>Go to Homepage</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
