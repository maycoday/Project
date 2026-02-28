import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CryptoProvider } from './context/CryptoContext';
import { ThemeProvider } from './context/ThemeContext';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <CryptoProvider>
          <App />
        </CryptoProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
