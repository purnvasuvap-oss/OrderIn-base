import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './stadium-icons/stadium-theme.css';
import App from './App';
import { CartProvider } from './context/CartContext';
import reportWebVitals from './reportWebVitals';

// One-time cleanup: the withdrawn "Movie Mode" feature could leave this
// attribute stuck on <html>, and its CSS `filter` breaks every position:fixed
// element on the page (the footer would scroll with the content).
document.documentElement.removeAttribute('data-movie-mode');
try { localStorage.removeItem('orderin_movie_mode'); } catch (e) { /* ignore */ }

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <CartProvider>
      <App />
    </CartProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
