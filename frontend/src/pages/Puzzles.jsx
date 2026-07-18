import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiGrid, FiShuffle, FiTarget, FiZap } from 'react-icons/fi';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import './Puzzles.css';

function Puzzles() {
  const navigate = useNavigate();

  const boxes = [
    {
      key: 'gm',
      title: 'GM Puzzles',
      description: '3000-rated grandmaster puzzles',
      path: '/puzzles/gm',
      icon: <FiGrid aria-hidden />,
    },
    {
      key: 'lichess',
      title: 'Lichess puzzles',
      description: 'Puzzles from Lichess',
      path: '/puzzles/lichess',
      icon: <FiTarget aria-hidden />,
    },
    {
      key: 'chesscom',
      title: 'Chess.com random puzzles',
      description: 'Daily-style random puzzles from Chess.com',
      path: '/puzzles/chesscom',
      icon: <FiShuffle aria-hidden />,
    },
    {
      key: 'brilliant',
      title: 'Brilliant Move Puzzles',
      description: 'Saved puzzles from verified brilliant moves',
      path: '/puzzles/brilliant',
      icon: <FiZap aria-hidden />,
    },
  ];

  return (
    <div className="puzzles-page">
      <header className="puzzles-header">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Puzzles' },
          ]}
        />
        <h1>Puzzles</h1>
        <p className="puzzles-muted">Choose a puzzle collection.</p>
      </header>

      <div className="puzzles-grid">
        {boxes.map((box) => (
          <div
            key={box.key}
            className="puzzles-box"
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
            <div className="puzzles-box-icon">{box.icon}</div>
            <h2>{box.title}</h2>
            <p>{box.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Puzzles;
