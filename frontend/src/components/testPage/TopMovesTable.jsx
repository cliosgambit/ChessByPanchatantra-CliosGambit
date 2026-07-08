import React from 'react';

export default function TopMovesTable({ title, subtitle, verdict, rows = [] }) {
  if (!rows.length) return null;

  return (
    <div className="tp-top-moves-block">
      <div className="tp-top-moves-head">
        <span className="tp-top-moves-title">{title}</span>
        {subtitle ? <span className="tp-top-moves-subtitle">{subtitle}</span> : null}
      </div>
      {verdict ? <p className="tp-top-moves-verdict">{verdict}</p> : null}
      <table className="tp-top-moves-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Move</th>
            <th>Eval</th>
            <th>CPL</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.move}-${idx}`}
              className={[
                row.isPlayed ? 'tp-top-moves-row--played' : '',
                row.isBest ? 'tp-top-moves-row--best' : '',
                row.isBad ? 'tp-top-moves-row--bad' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <td className="tp-top-moves-rank">{row.rank}</td>
              <td className="tp-top-moves-move">{row.move}</td>
              <td className="tp-top-moves-eval">{row.eval}</td>
              <td className="tp-top-moves-cpl">{row.cpl}</td>
              <td className="tp-top-moves-note">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
