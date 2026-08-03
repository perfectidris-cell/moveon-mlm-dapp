import { useState } from 'react';
import { Web3Provider } from './contexts/Web3Context';
import { ErrorBoundary } from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import Dashboard from './pages/Dashboard';
import DownlinePage from './pages/DownlinePage';
import AdminPage from './pages/AdminPage';
import type { Page } from './types';

export default function App() {
  const [page, setPage] = useState<Page>('home');

  return (
    <ErrorBoundary>
      <Web3Provider>
        <div className="min-h-screen">
          <Navbar onNavigate={setPage} currentPage={page} />
          {page === 'home' && <HomePage onNavigate={setPage} />}
          {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
          {page === 'downline' && <DownlinePage />}
          {page === 'admin' && <AdminPage />}
        </div>
      </Web3Provider>
    </ErrorBoundary>
  );
}
