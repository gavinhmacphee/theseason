import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-surface font-[family-name:var(--font-body)]">
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold text-brand mb-3">
            Something went wrong
          </h1>
          <p className="text-[15px] text-muted max-w-[340px] text-center leading-relaxed mb-2">
            The app hit an unexpected error. Your data is safe — tap below to reload.
          </p>
          <p className="text-xs text-light max-w-[340px] text-center mb-6 break-words">
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-base font-semibold text-white bg-brand border-none px-9 py-3.5 cursor-pointer"
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
