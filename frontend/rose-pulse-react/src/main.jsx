import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createRuntime } from './service.js';
import './styles.css';

createRoot(document.getElementById('root')).render(<App runtime={createRuntime()} />);
