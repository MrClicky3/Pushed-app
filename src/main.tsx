import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyAccent, loadAccent } from './lib/accent';
import { applyCategoryColors, loadCategoryColors } from './lib/categoryColors';
import { applyTheme, loadTheme } from './lib/theme';
import ErrorBoundary from './components/ErrorBoundary';

// Apply saved appearance before first paint so nothing flashes the wrong theme
applyTheme(loadTheme());
applyAccent(loadAccent());
applyCategoryColors(loadCategoryColors());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
