import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#f5f0e8',
            color: '#001a57',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 560,
              border: '2.5px solid #001a57',
              background: '#fff',
              padding: 20,
              boxShadow: '4px 4px 0 #001a57',
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              LinenTrack Error
            </p>
            <h1 style={{ margin: '8px 0 12px', fontSize: 22 }}>Something went wrong</h1>
            <p style={{ margin: 0, lineHeight: 1.5, fontSize: 14 }}>
              {this.state.error?.message || 'The app hit an unexpected error on this device.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.assign('/login')}
              style={{
                marginTop: 16,
                border: '2.5px solid #001a57',
                background: '#001a57',
                color: '#fff',
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reload Login
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
