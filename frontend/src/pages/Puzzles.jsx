import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiGrid, FiShuffle, FiTarget } from 'react-icons/fi';
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
      description: 'Saved brilliant-move puzzles from Chess.com games',
      path: '/puzzles/chesscom',
      icon: <FiShuffle aria-hidden />,
    },
  ];

  return (
    <div className="puzzles-page">
      <header className="puzzles-header">
        <button type="button" className="puzzles-back" onClick={() => navigate('/dashboard')}>
          <FiArrowLeft aria-hidden /> Dashboard
        </button>
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
