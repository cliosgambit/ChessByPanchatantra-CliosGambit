import React from 'react';
import { FaStar, FaThumbsUp, FaCheckCircle, FaMinusCircle, FaBook, FaLock } from 'react-icons/fa';

export default function MoveClassIcon({ moveClass, title, className = '' }) {
  if (!moveClass) return null;
  const label = title ?? moveClass;

  return (
    <span
      className={`chess-move-class-icon ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      {moveClass === 'brilliant' ? <span className="chess-move-class-brilliant">!!</span> : null}
      {moveClass === 'great' ? <span className="chess-move-class-great">!</span> : null}
      {moveClass === 'best' ? <FaStar className="chess-move-class-best" aria-hidden /> : null}
      {moveClass === 'excellent' ? <FaThumbsUp className="chess-move-class-excellent" aria-hidden /> : null}
      {moveClass === 'good' ? <FaCheckCircle className="chess-move-class-good" aria-hidden /> : null}
      {moveClass === 'inaccuracy' ? <span className="chess-move-class-inaccuracy">?!</span> : null}
      {moveClass === 'mistake' ? <span className="chess-move-class-mistake">?</span> : null}
      {moveClass === 'blunder' ? <span className="chess-move-class-blunder">??</span> : null}
      {moveClass === 'missed' ? <FaMinusCircle className="chess-move-class-missed" aria-hidden /> : null}
      {moveClass === 'book' ? <FaBook className="chess-move-class-book" aria-hidden /> : null}
      {moveClass === 'forced' ? <FaLock className="chess-move-class-forced" aria-hidden /> : null}
    </span>
  );
}
