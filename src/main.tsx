import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/card.css';
import './styles/chat.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Wake the server's Gemini connection while the student is still looking at the map.
fetch('/api/warm').catch(() => {});
