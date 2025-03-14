import './styles/app.css';
import * as React from 'react';
import ReactDOM from 'react-dom/client'
import App from './App'
import { DarkModeProvider } from './DarkModeProvider';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DarkModeProvider>
      <App />
    </DarkModeProvider>

  </React.StrictMode>
)
