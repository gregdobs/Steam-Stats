import { Component } from 'react';

// Catches render-time exceptions anywhere below it so one bad component
// doesn't white-screen the whole app with no way back for the user.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Steam Stats crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--ss-bg, #0b0e14)', color: 'var(--ss-ink, #fff)',
        padding: 24, textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
        <p style={{ fontSize: 14, color: 'var(--ss-ink3, #9aa)', maxWidth: 420 }}>
          Steam Stats hit an unexpected error. Your saved data is untouched — reloading usually fixes this.
        </p>
        <pre style={{
          fontSize: 11, color: 'var(--ss-ink3, #9aa)', maxWidth: 560, overflow: 'auto',
          background: 'var(--ss-inset, rgba(255,255,255,0.05))', padding: 12, borderRadius: 10, textAlign: 'left',
        }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button
          onClick={() => window.location.reload()}
          className="btn btn-ghost"
          style={{ fontSize: 13, padding: '8px 16px' }}
        >
          Reload
        </button>
      </div>
    );
  }
}
