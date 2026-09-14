import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Design system: replaces the Vite default index.css.
// Loads variables → reset → base → layout → components → utilities
// in the correct dependency order, plus Google Fonts and Font Awesome.
import './styles/index.css'
import App from './App.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
