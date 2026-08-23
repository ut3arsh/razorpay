import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import OverviewPage from './pages/OverviewPage';
import CasesPage from './pages/CasesPage';
import CaseDetailPage from './pages/CaseDetailPage';
import ExceptionsPage from './pages/ExceptionsPage';
import EventsPage from './pages/EventsPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/exceptions" element={<ExceptionsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
