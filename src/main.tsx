import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { captureOwnerKey } from './owner'

// Before the app reads its data: #owner=... switches this browser to the owner's synced account.
captureOwnerKey()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
