import React, { useMemo } from 'react';
import { FiTrendingUp } from 'react-icons/fi';

function getPercent(data, t) {
  if (!data || !data.score) return 50;
  const s = data.score;
  let v = s.type === 'cp' ? s.value / 100 : s.value;
  if (t === 'b') v = -v;
  if (s.type === 'mate') {
    if (v > 0) return 100;
    if (v < 0) return 0;
    return t === 'b' ? 100 : 0;
  }
  if (v >= 8) return 100;
  if (v >= 4) return 90 + ((v - 4) / 4) * 10;
  if (v >= 0) return 50 + (v / 4) * 40;
  if (v >= -4) return 10 + ((v + 4) / 4) * 40;
  if (v >= -8) return ((v + 8) / 4) * 10;
  return 0;
}

export default function EvaluationGraph({ analysis, timeline, navIndex }) {
  const points = useMemo(() => {
    const pts = [];
    for (let i = 0; i < timeline.length; i++) {
      const data = analysis[i];
      if (!data || !data.score) continue;

      const t = timeline[i]?.turn;
      const p = getPercent(data, t);

      const s = data.score;
      let v = s.type === 'cp' ? s.value / 100 : s.value;
      if (t === 'b') v = -v;

      const scoreText = s.type === 'mate' ? `M${Math.abs(v)}` : (v >= 0 ? '+' : '') + v.toFixed(2);
      pts.push({ p, scoreText, originalIndex: i });
    }
    return pts;
  }, [analysis, timeline]);

  if (points.length < 1) {
    return (
      <div className="chess-eval-graph-empty">
        Waiting for analysis...
      </div>
    );
  }

  const width = 280;
  const height = 80;

  const dLine = points
    .map((pt, i) => {
      const x = points.length > 1 ? (i * width) / (points.length - 1) : width / 2;
      const y = height - (pt.p / 100) * height;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const currentPtIndex = points.findIndex((pt) => pt.originalIndex === navIndex);
  const markerX =
    currentPtIndex !== -1
      ? (points.length > 1 ? (currentPtIndex * width) / (points.length - 1) : width / 2)
      : navIndex >= points.length
        ? width
        : points.length > 1
          ? (navIndex * width) / (points.length - 1)
          : width / 2;

  const currentPt = currentPtIndex !== -1 ? points[currentPtIndex] : { scoreText: '...', p: 50 };
  const markerY = height - (currentPt.p / 100) * height;

  return (
    <div className="chess-eval-graph">
      <div className="chess-eval-graph-head">
        <span className="chess-eval-graph-title">
          <FiTrendingUp aria-hidden />
          Evaluation History
        </span>
        <span>{points.length} analyzed</span>
      </div>
      <div className="chess-eval-graph-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#484542" strokeWidth="1" strokeDasharray="4 2" />
          {points.length > 1 && (
            <path
              d={`${dLine} L ${width} ${height} L 0 ${height} Z`}
              fill="url(#graphGradient)"
              opacity="0.3"
            />
          )}
          <path
            d={dLine}
            fill="none"
            stroke="#81b64c"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1={markerX} y1="0" x2={markerX} y2={height} stroke="#ffffff" strokeWidth="1" opacity="0.5" strokeDasharray="2 2" />
          <g transform={`translate(${Math.min(width - 45, Math.max(5, markerX - 20))}, ${Math.max(10, markerY - 30)})`}>
            <rect width="40" height="18" rx="4" fill="#81b64c" />
            <text x="20" y="12" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">
              {currentPt.scoreText}
            </text>
            <path d="M 16 18 L 20 22 L 24 18" fill="#81b64c" />
          </g>
          <defs>
            <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#81b64c" />
              <stop offset="100%" stopColor="#81b64c" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
