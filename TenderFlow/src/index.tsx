import React from 'react';
import ReactDOM from 'react-dom/client';
import { FlowDashboard } from './components/FlowDashboard';
import './assets/index.css';

/**
 * Bootstrapper for Tender Executive Flow (Standalone)
 * This runs independently from Loop.
 */
const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<FlowDashboard />);
} else {
  console.error("Critical: 'root' element not found for Tender Flow Standalone.");
}
