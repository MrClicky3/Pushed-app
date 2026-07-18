import { Component, type ErrorInfo, type ReactNode } from 'react';
import { buildBugReportUrl } from '../lib/bugReport';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Catches render/runtime errors anywhere below it so a single throw shows a
// recoverable, on-brand screen instead of a blank white page.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it for anyone watching the console / future crash reporter.
    console.error('Uncaught error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-center px-8"
        style={{ background: '#010101', color: 'var(--te-text-1)', gap: 24 }}
      >
        <img src="/apple-touch-icon.png" alt="" style={{ width: 56, height: 56, borderRadius: 'var(--te-radius-md)', opacity: 0.9 }} />
        <div style={{ maxWidth: 320 }}>
          <p className="text-[20px] font-bold tracking-tight" style={{ letterSpacing: '-0.03em' }}>
            Something broke
          </p>
          <p className="text-[15px] mt-2 leading-relaxed" style={{ color: 'var(--te-text-3)' }}>
            The app hit an unexpected error. Your logged workouts are safe — reloading usually fixes it.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 w-full" style={{ maxWidth: 280 }}>
          <button
            onClick={this.handleReload}
            className="w-full py-3.5 rounded-te-md font-semibold text-[15px] tracking-tight active:opacity-80 transition-opacity"
            style={{ background: '#f4f1ec', color: 'var(--te-ink)' }}
          >
            Reload app
          </button>
          <a
            href={buildBugReportUrl({ context: 'Crash screen', error })}
            className="w-full py-3.5 rounded-te-md font-semibold text-[15px] tracking-tight active:opacity-80 transition-opacity"
            style={{ background: '#2f6fed', color: '#ffffff', textDecoration: 'none' }}
          >
            Report this bug
          </a>
        </div>
      </div>
    );
  }
}
