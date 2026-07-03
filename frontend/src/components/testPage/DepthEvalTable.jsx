import React from 'react';

export default function DepthEvalTable({ title, subtitle, rows = [] }) {
  if (!rows.length) return null;

  return (
    <div className="tp-depth-eval-block">
      <div className="tp-depth-eval-head">
        <span className="tp-depth-eval-title">{title}</span>
        {subtitle ? <span className="tp-depth-eval-subtitle">{subtitle}</span> : null}
      </div>
      <table className="tp-depth-eval-table">
        <thead>
          <tr>
            <th>Depth</th>
            <th>Search</th>
            <th>Eval</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.depth}-${row.purpose}-${idx}`}>
              <td className="tp-depth-eval-depth">d{row.depth}</td>
              <td className="tp-depth-eval-purpose">{row.purpose}</td>
              <td className="tp-depth-eval-cp">{row.eval}</td>
              <td className="tp-depth-eval-note">{row.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
