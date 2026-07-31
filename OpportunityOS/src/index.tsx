import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { RootErrorBoundary } from './components/RootErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);