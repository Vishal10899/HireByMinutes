import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
  activeTab?: string;
  onReset?: () => void;
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AdminContentErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AdminContentErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public componentDidUpdate(prevProps: Props) {
    // If the active tab changes, reset the error boundary automatically
    if (prevProps.activeTab !== this.props.activeTab && this.state.hasError) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 p-6 md:p-8 flex items-center justify-center min-h-[400px]">
          <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 p-6 sm:p-8 shadow-card text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-midnight tracking-tight">
                Unable to load this section
              </h3>
              <p className="text-xs text-midnight/70 leading-relaxed">
                Something went wrong while rendering the requested administrative view. The Admin layout remains active.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-aliceblue rounded-xl text-left border border-timberwolf/40">
                <p className="text-[11px] font-mono text-rose-700 font-medium break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-semibold hover:bg-midnight-hover shadow-subtle transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-moonstone" />
                <span>Try Again</span>
              </button>

              {this.props.onNavigateHome && (
                <button
                  onClick={this.props.onNavigateHome}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-aliceblue text-midnight text-xs font-semibold hover:bg-lightblue/30 border border-timberwolf/60 transition-all cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-midnight/60" />
                  <span>Operations Dashboard</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default AdminContentErrorBoundary;
