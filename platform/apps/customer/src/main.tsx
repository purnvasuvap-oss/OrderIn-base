import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerApp } from './App';
import { createGateway } from './firebase';
import { installLogging } from './logging';
import './styles.css';

installLogging();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomerApp gateway={createGateway()} />
  </StrictMode>,
);
