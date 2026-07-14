import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBook, FiBookOpen, FiGrid, FiUsers, FiZap } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import StudentDashboard from './StudentDashboard';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();

  if (role === 'student') {
    return <StudentDashboard />;
  }

  const boxes = [
    {
      key: 'modules',
      title: 'Modules',
      icon: <FiBook aria-hidden />,
      path: '/modules',
    },
    {
      key: 'library',
      title: 'Library',
      icon: <FiBookOpen aria-hidden />,
      path: '/library',
    },
    {
      key: 'puzzles',
      title: 'Puzzles',
      icon: <FiGrid aria-hidden />,
      path: '/puzzles',
    },
    {
      key: 'students',
      title: 'Students',
      icon: <FiUsers aria-hidden />,
      path: '/students',
    },
    {
      key: 'brilliant-moves',
      title: 'Brilliant Moves',
      icon: <FiZap aria-hidden />,
      path: '/brilliant-moves',
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
            onClick={() => navigate(box.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(box.path);
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

export default Dashboard;
