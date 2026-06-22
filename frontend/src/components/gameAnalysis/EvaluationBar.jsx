import React from 'react';

export default function EvaluationBar({ percent, display, orientation, barHeight, barWidth }) {
  const { text, side } = display || { text: '0.0', side: 'w' };
  const isFlipped = orientation === 'black';

  const whitePercent = percent;
  const blackPercent = 100 - percent;
  const hasWhiteAdvantage = side === 'w';

  const whiteLabelPosition = isFlipped ? { top: '4px' } : { bottom: '4px' };
  const blackLabelPosition = isFlipped ? { bottom: '4px' } : { top: '4px' };

  const w = barWidth ?? Math.min(32, Math.max(22, Math.round((barHeight || 400) / 14)));

  return (
    <div
      className="chess-eval-bar"
      style={{
        flexDirection: isFlipped ? 'column' : 'column-reverse',
        height: barHeight,
        width: w,
        minHeight: barHeight,
        maxHeight: barHeight,
        minWidth: w,
        maxWidth: w,
      }}
    >
      <div className="chess-eval-bar-white" style={{ height: `${whitePercent}%` }}>
        {hasWhiteAdvantage && (
          <span className="chess-eval-bar-label chess-eval-bar-label--white" style={whiteLabelPosition}>
            {text}
          </span>
        )}
      </div>
      <div className="chess-eval-bar-black" style={{ height: `${blackPercent}%` }}>
        {!hasWhiteAdvantage && (
          <span className="chess-eval-bar-label chess-eval-bar-label--black" style={blackLabelPosition}>
            {text}
          </span>
        )}
      </div>
    </div>
  );
}
