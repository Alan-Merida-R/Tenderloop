
import React from 'react';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export class RootErrorBoundary extends React.Component<Props, State> {
  // TS + React types interaction: `declare` keeps the compiler aware of the
  // inherited props/state without emitting a runtime field that would shadow
  // React.Component's own assignments (same workaround used in App.tsx's
  // LocalErrorBoundary). Without this, TS misses the generics.
  declare props: Props;
  declare state: State;
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-white z-[9999] p-8">
          <div className="max-w-lg w-full bg-red-50 border border-red-200 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="text-6xl animate-bounce">⚠️</div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-red-700">OpportunityOS Crash Detected</h1>
              <p className="text-red-600 font-medium">The last database or update contains an error that prevents the app from starting.</p>
            </div>
            <div className="bg-white/50 p-4 rounded-xl border border-red-100 text-left">
              <p className="text-[10px] font-mono text-red-800 break-all">{this.state.error.stack?.substring(0, 500)}...</p>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg active:scale-95"
              >
                Try Reloading
              </button>
              <button 
                onClick={this.handleReset}
                className="w-full py-3 bg-white border-2 border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-all"
              >
                Reset App & Clear Database Connection
              </button>
            </div>
            <p className="text-[10px] text-red-400">Warning: Resetting will clear your "Recent Files" list and logout of the current database.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
