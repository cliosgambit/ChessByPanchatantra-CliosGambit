import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBook, FiUser } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function StudentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const chessComId = String(user?.chess_com_id || '').trim();

  const boxes = [
    {
      key: 'profile',
      title: 'Profile',
      icon: <FiUser aria-hidden />,
      onClick: () => {
        if (!chessComId) return;
        navigate(`/players/${encodeURIComponent(chessComId)}`, {
          state: { from: '/modules', fromLabel: 'Back to Modules', tab: 'report' },
        });
      },
    },
    {
      key: 'modules',
      title: 'Modules',
      icon: <FiBook aria-hidden />,
      onClick: () => navigate('/modules'),
    },
  ];

  return (
    <div className="dashboard-page">
      <div className="dashboard-feature-grid">
        {boxes.map((box) => (
          <div
            key={box.key}
            className="dashboard-library-box"
            role="button"
            tabIndex={0}
            onClick={box.onClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                box.onClick();
              }
            }}
          >
            <div className="dashboard-library-box-icon">{box.icon}</div>
            <h2 className="dashboard-library-box-title">{box.title}</h2>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StudentDashboard;
