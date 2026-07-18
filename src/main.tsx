import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyAccent, loadAccent } from './lib/accent';
import { applyCategoryColors, loadCategoryColors } from './lib/categoryColors';
import ErrorBoundary from './components/ErrorBoundary';

// Apply the saved accent before first paint so toggles/levers render correctly
applyAccent(loadAccent());
applyCategoryColors(loadCategoryColors());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
