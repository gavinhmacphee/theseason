import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 32,
          background: '#FAFAF7', fontFamily: "'DM Sans', sans-serif",
        }}>
          <h1 style={{
            fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 28,
            fontWeight: 700, color: '#1B4332', marginBottom: 12,
          }}>
            Something went wrong
          </h1>
          <p style={{
            fontSize: 15, color: '#666', maxWidth: 340,
            textAlign: 'center', lineHeight: 1.5, marginBottom: 8,
          }}>
            The app hit an unexpected error. Your data is safe — tap below to reload.
          </p>
          <p style={{
            fontSize: 12, color: '#999', maxWidth: 340,
            textAlign: 'center', marginBottom: 24, wordBreak: 'break-word',
          }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 16,
              fontWeight: 600, color: 'white', background: '#1B4332',
              border: 'none', padding: '14px 36px', cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
