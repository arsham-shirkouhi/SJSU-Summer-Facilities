import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

function renderBootError(message) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f5f0e8;color:#001a57;font-family:system-ui,sans-serif;">
      <div style="max-width:520px;border:2.5px solid #001a57;background:#fff;padding:20px;box-shadow:4px 4px 0 #001a57;">
        <p style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;">LinenTrack Error</p>
        <h1 style="margin:0 0 12px;font-size:22px;">App failed to start</h1>
        <p style="margin:0;line-height:1.5;">${message}</p>
      </div>
    </div>
  `
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (error) {
  renderBootError(error?.message || 'Unknown startup error')
}
