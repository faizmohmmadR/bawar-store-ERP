import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { getCurrentLanguage } from '@/i18n'
import { applyDocumentFonts } from '@/lib/fonts'
import { setupServiceWorker } from '@/lib/serviceWorker'

applyDocumentFonts(getCurrentLanguage())

void setupServiceWorker()

createRoot(document.getElementById("root")!).render(<App />);
