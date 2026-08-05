import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import CommunityBanner from './components/CommunityBanner';
import ErrorBoundary from './components/ErrorBoundary';
import QuickstartsPage from './pages/QuickstartsPage';
import SettingsPage from './pages/SettingsPage';

const App: React.FC = () => (
  <div className="community-plugin-layout">
    {/* [SHARED] Do not remove — all community plugins must display the CommunityBanner */}
    <CommunityBanner />
    <ErrorBoundary>
      <div className="community-plugin-content">
        <Routes>
          <Route path="/" element={<Navigate to="quickstarts" replace />} />
          <Route path="quickstarts/*" element={<QuickstartsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </ErrorBoundary>
  </div>
);

export default App;
