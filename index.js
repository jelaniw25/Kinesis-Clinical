import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const val = localStorage.getItem('kinesis_' + key);
      if (val === null) throw new Error('Not found');
      return { key, value: val };
    },
    set: async (key, value) => {
      localStorage.setItem('kinesis_' + key, value);
      return { key, value };
    },
    delete: async (key) => {
      localStorage.removeItem('kinesis_' + key);
      return { key, deleted: true };
    },
    list: async (prefix = '') => {
      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith('kinesis_' + prefix))
        .map(k => k.replace('kinesis_', ''));
      return { keys };
    }
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
