import React from 'react';
import { createRoot } from 'react-dom/client';
import TrusteraLandingPage from './App.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TrusteraLandingPage />
  </React.StrictMode>
);
