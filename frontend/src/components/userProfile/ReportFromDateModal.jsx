import React, { useEffect, useState } from 'react';
import { computeSinceDate } from './RatingProgressChart';
import './ReportFromDateModal.css';

const REPORT_FROM_OPTIONS = [
  {
    key: 'joining',
    label: 'Joining date',
    description: 'Full report from the student joining date through today.',
  },
  {
    key: '1m',
    label: 'One month',
    description: 'Report covering the last 30 days of play.',
  },
];

function formatBasicDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReportFromDateModal({
  open,
  joiningDate = null,
  onCancel,
  onConfirm,
}) {
  const defaultKey = joiningDate ? 'joining' : '1m';
  const [selected, setSelected] = useState(defaultKey);

  useEffect(() => {
    if (open) {
      setSelected(joiningDate ? 'joining' : '1m');
    }
  }, [open, joiningDate]);

  if (!open) return null;

  const joiningDisabled = !joiningDate;

  return (
    <div className="report-from-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="report-from-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-from-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="report-from-modal-head">
          <h3 id="report-from-modal-title">Select report from date</h3>
          <button
            type="button"
            className="report-from-modal-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="report-from-modal-options">
          {REPORT_FROM_OPTIONS.map((option) => {
            const disabled = option.key === 'joining' && joiningDisabled;
            const since = disabled
              ? null
              : computeSinceDate(option.key, joiningDate);
            return (
              <label
                key={option.key}
                className={`report-from-modal-option${disabled ? ' is-disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="report-from-date"
                  checked={selected === option.key}
                  disabled={disabled}
                  onChange={() => setSelected(option.key)}
                />
                <span className="report-from-modal-option-body">
                  <strong>{option.label}</strong>
                  <span className="report-from-modal-option-desc">{option.description}</span>
                  <span className="report-from-modal-option-note">
                    {disabled
                      ? 'No joining date on file for this player.'
                      : `From ${formatBasicDate(since)}`}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="report-from-modal-actions">
          <button
            type="button"
            className="report-from-modal-btn report-from-modal-btn--ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="report-from-modal-btn report-from-modal-btn--primary"
            onClick={() => onConfirm(selected)}
            disabled={selected === 'joining' && joiningDisabled}
          >
            Report
          </button>
        </div>
      </div>
    </div>
  );
}
