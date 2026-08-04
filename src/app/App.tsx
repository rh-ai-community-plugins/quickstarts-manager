import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import CommunityBanner from './components/CommunityBanner';
import QuickstartsPage from './pages/QuickstartsPage';

const App: React.FC = () => (
  <div className="community-plugin-layout">
    {/* [SHARED] Do not remove — all community plugins must display the CommunityBanner */}
    <CommunityBanner />
    <div className="community-plugin-content">
      <Routes>
        <Route path="/" element={<Navigate to="quickstarts" replace />} />
        <Route path="quickstarts/*" element={<QuickstartsPage />} />
      </Routes>
    </div>
  </div>
);

export default App;
