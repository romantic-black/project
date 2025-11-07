import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const app = (
  <BrowserRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    <App />
  </BrowserRouter>
);

const root = ReactDOM.createRoot(rootElement);

if (import.meta.env.PROD) {
  root.render(<React.StrictMode>{app}</React.StrictMode>);
} else {
  root.render(app);
}
