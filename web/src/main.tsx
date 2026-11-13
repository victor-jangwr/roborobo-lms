import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import PayPage, { isPayLink } from './pages/PayPage'

// ?pay=… 로 열리면 학부모 결제 화면 (로그인 없음)
createRoot(document.getElementById('root')!).render(<StrictMode>{isPayLink() ? <PayPage /> : <App />}</StrictMode>)
