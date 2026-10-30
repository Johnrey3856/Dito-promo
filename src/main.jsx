import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// The admin dashboard (and its map library) only loads when someone opens #/admin.
const Admin = lazy(() => import('./Admin.jsx'));

function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (hash.startsWith('#/admin')) {
    return <Suspense fallback={null}><Admin demo={hash === '#/admin/demo'} /></Suspense>;
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><Root /></React.StrictMode>
);
