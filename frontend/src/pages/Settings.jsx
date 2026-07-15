import React from 'react';
import './Dashboard.css';

function Settings() {
  return (
    <div className="dashboard-page">
      <div
        style={{
          background: '#fff',
          borderRadius: 18,
          border: '1px solid rgba(59,47,42,0.08)',
          padding: '1.75rem 1.5rem',
          maxWidth: 560,
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#3b2f2a' }}>
          Settings
        </h1>
        <p style={{ margin: '0.6rem 0 0', color: '#8a7a70', lineHeight: 1.5 }}>
          Settings page placeholder — wire preferences here later.
        </p>
      </div>
    </div>
  );
}

export default Settings;
