import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiEdit2, FiPlus, FiUserMinus, FiUserPlus, FiX } from 'react-icons/fi';
import {
  addStudentsToBatch,
  fetchBatch,
  removeStudentFromBatch,
  updateBatch,
} from '../services/batchService';
import { fetchStudents } from '../services/studentService';
import './Students.css';

function BatchDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState(null); // 'edit' | 'add' | null
  const [form, setForm] = useState({ name: '', description: '', status: 'active' });
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchBatch(batchId);
      setBatch(data.batch || null);
      setStudents(data.students || []);
    } catch (err) {
      setError(err.message || 'Failed to load batch.');
      setBatch(null);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const memberIds = useMemo(
    () => new Set(students.map((s) => Number(s.id))),
    [students]
  );

  const availableStudents = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return allStudents
      .filter((s) => !memberIds.has(Number(s.id)))
      .filter((s) => {
        if (!q) return true;
        return (
          String(s.player_name || '')
            .toLowerCase()
            .includes(q) ||
          String(s.email || '')
            .toLowerCase()
            .includes(q) ||
          String(s.chess_com_id || '')
            .toLowerCase()
            .includes(q)
        );
      });
  }, [allStudents, memberIds, pickerQuery]);

  const openEdit = () => {
    if (!batch) return;
    setForm({
      name: batch.name || '',
      description: batch.description || '',
      status: batch.status || 'active',
    });
    setModal('edit');
    setError('');
    setMessage('');
  };

  const openAdd = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await fetchStudents();
      setAllStudents(data.students || []);
      setSelectedIds(new Set());
      setPickerQuery('');
      setModal('add');
    } catch (err) {
      setError(err.message || 'Failed to load students.');
    } finally {
      setBusy(false);
    }
  };

  const closeModal = () => {
    setModal(null);
    setSelectedIds(new Set());
    setPickerQuery('');
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await updateBatch(batchId, form);
      setBatch(data.batch);
      setMessage('Batch updated.');
      closeModal();
    } catch (err) {
      setError(err.message || 'Failed to update batch.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddStudents = async (e) => {
    e.preventDefault();
    const ids = [...selectedIds];
    if (!ids.length) {
      setError('Select at least one student.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await addStudentsToBatch(batchId, ids);
      setStudents(data.students || []);
      setBatch((prev) =>
        prev
          ? { ...prev, student_count: (data.students || []).length }
          : prev
      );
      setMessage(data.message || 'Students added.');
      closeModal();
    } catch (err) {
      setError(err.message || 'Failed to add students.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (student) => {
    if (
      !window.confirm(
        `Remove “${student.player_name}” from this batch? The student account stays.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await removeStudentFromBatch(batchId, student.id);
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      setBatch((prev) =>
        prev
          ? { ...prev, student_count: Math.max(0, (prev.student_count || 1) - 1) }
          : prev
      );
      setMessage(`Removed ${student.player_name} from batch.`);
    } catch (err) {
      setError(err.message || 'Failed to remove student.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="students-page">
        <p className="students-muted">Loading batch…</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="students-page">
        <p className="students-error">{error || 'Batch not found.'}</p>
        <button type="button" className="students-btn" onClick={() => navigate('/students')}>
          Back to Students
        </button>
      </div>
    );
  }

  return (
    <div className="students-page">
      <header className="students-header">
        <div className="students-header-row">
          <div>
            <h1>{batch.name}</h1>
            <p className="students-muted">
              {students.length} student{students.length === 1 ? '' : 's'}
              {batch.description ? ` · ${batch.description}` : ''}
            </p>
          </div>
          <div className="students-header-actions">
            <span className={`students-status students-status--${batch.status === 'active' ? 'active' : 'left'}`}>
              {batch.status}
            </span>
            <button type="button" className="students-btn" onClick={openEdit} disabled={busy}>
              <FiEdit2 aria-hidden /> Edit batch
            </button>
            <button
              type="button"
              className="students-btn students-btn--primary"
              onClick={openAdd}
              disabled={busy}
            >
              <FiUserPlus aria-hidden /> Add students
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="students-error">{error}</p> : null}
      {message ? <p className="students-ok">{message}</p> : null}

      {students.length === 0 ? (
        <div className="students-empty">
          No students in this batch yet. Add existing students to assign them here.
        </div>
      ) : (
        <div className="students-table-wrap">
          <table className="students-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chess.com</th>
                <th>Email</th>
                <th>Status</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.player_name}</strong>
                  </td>
                  <td>{s.chess_com_id || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td>
                    <span className={`students-status students-status--${s.status}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{(s.added_at || '').slice(0, 10) || '—'}</td>
                  <td className="students-actions">
                    <button
                      type="button"
                      className="students-icon-btn students-icon-btn--danger"
                      title="Remove from batch"
                      onClick={() => handleRemove(s)}
                      disabled={busy}
                    >
                      <FiUserMinus aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'edit' ? (
        <div className="students-modal" role="dialog" aria-modal="true">
          <form className="students-modal-card students-modal-card--narrow" onSubmit={handleEdit}>
            <div className="students-modal-header">
              <div className="students-modal-header-text">
                <h2 className="students-modal-title">Edit batch</h2>
                <p className="students-modal-sub">Update name, description, or status.</p>
              </div>
              <button type="button" className="students-icon-btn" onClick={closeModal} aria-label="Close">
                <FiX aria-hidden />
              </button>
            </div>
            <div className="students-form-section">
              <div className="students-form-grid">
                <label className="students-field students-field--full">
                  <span>Name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Morning Juniors"
                  />
                </label>
                <label className="students-field students-field--full">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <label className="students-field">
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="students-modal-actions">
              <button type="button" className="students-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="students-btn students-btn--primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === 'add' ? (
        <div className="students-modal" role="dialog" aria-modal="true">
          <form className="students-modal-card" onSubmit={handleAddStudents}>
            <div className="students-modal-header">
              <div className="students-modal-header-text">
                <h2 className="students-modal-title">Add students</h2>
                <p className="students-modal-sub">
                  Pick existing students to assign to “{batch.name}”. A student can be in multiple batches.
                </p>
              </div>
              <button type="button" className="students-icon-btn" onClick={closeModal} aria-label="Close">
                <FiX aria-hidden />
              </button>
            </div>
            <div className="students-form-section">
              <input
                className="students-search"
                style={{ width: '100%', marginBottom: '0.75rem' }}
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Filter by name, email, Chess.com…"
              />
              {availableStudents.length === 0 ? (
                <div className="students-empty" style={{ padding: '1.25rem' }}>
                  {allStudents.length === 0
                    ? 'No students registered yet. Register students first, then assign them here.'
                    : 'All students are already in this batch (or none match the filter).'}
                </div>
              ) : (
                <div className="students-picker-list">
                  {availableStudents.map((s) => {
                    const checked = selectedIds.has(s.id);
                    return (
                      <label key={s.id} className={`students-picker-item${checked ? ' is-selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(s.id)}
                        />
                        <span className="students-picker-main">
                          <strong>{s.player_name}</strong>
                          <span className="students-muted">
                            {[s.email, s.chess_com_id].filter(Boolean).join(' · ') || 'No email'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="students-modal-actions">
              <button type="button" className="students-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="students-btn students-btn--primary"
                disabled={busy || selectedIds.size === 0}
              >
                <FiPlus aria-hidden />
                {busy ? 'Adding…' : `Add ${selectedIds.size || ''}`}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default BatchDetailPage;
