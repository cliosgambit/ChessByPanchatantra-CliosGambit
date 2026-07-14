import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiEdit2, FiEye, FiKey, FiPlus, FiRefreshCw, FiTrash2, FiX } from 'react-icons/fi';
import {
  createStudent,
  deleteStudent,
  fetchStudents,
  syncAllStudentsChessCom,
  updateStudent,
  updateStudentPassword,
} from '../services/studentService';
import { syncChessComPlayer } from '../services/chessComDbService';
import './Students.css';

const EMPTY_FORM = {
  player_name: '',
  email: '',
  password: '',
  chess_com_id: '',
  joining_date: new Date().toISOString().slice(0, 10),
  phone: '',
  notes: '',
  status: 'active',
};

function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'password' | null
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newPassword, setNewPassword] = useState('');

  const [syncingId, setSyncingId] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStudents({ q: query });
      setStudents(data.students || []);
    } catch (err) {
      setError(err.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, joining_date: new Date().toISOString().slice(0, 10) });
    setModal('create');
    setError('');
    setMessage('');
  };

  const openEdit = (student) => {
    setEditing(student);
    setForm({
      player_name: student.player_name || '',
      email: student.email || '',
      password: '',
      chess_com_id: student.chess_com_id || '',
      joining_date: (student.joining_date || '').slice(0, 10),
      phone: student.phone || '',
      notes: student.notes || '',
      status: student.status || 'active',
    });
    setModal('edit');
    setError('');
    setMessage('');
  };

  const openPassword = (student) => {
    setEditing(student);
    setNewPassword('');
    setModal('password');
    setError('');
    setMessage('');
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
    setNewPassword('');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createStudent({
        player_name: form.player_name,
        email: form.email,
        password: form.password,
        chess_com_id: form.chess_com_id || null,
        joining_date: form.joining_date,
        phone: form.phone || null,
        notes: form.notes || null,
        status: form.status,
      });
      setMessage('Student registered.');
      closeModal();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to register student.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editing?.id) return;
    setBusy(true);
    setError('');
    try {
      await updateStudent(editing.id, {
        player_name: form.player_name,
        email: form.email,
        chess_com_id: form.chess_com_id || null,
        joining_date: form.joining_date,
        phone: form.phone || null,
        notes: form.notes || null,
        status: form.status,
      });
      setMessage('Student updated.');
      closeModal();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update student.');
    } finally {
      setBusy(false);
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (!editing?.id) return;
    setBusy(true);
    setError('');
    try {
      await updateStudentPassword(editing.id, newPassword);
      setMessage(`Password updated for ${editing.player_name}.`);
      closeModal();
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  };

  const openChessReport = (student) => {
    const username = String(student?.chess_com_id || '').trim();
    if (!username) {
      setError('Add a Chess.com ID before viewing the report.');
      return;
    }
    navigate(`/players/${encodeURIComponent(username)}`, {
      state: { from: '/students', fromLabel: 'Back to Students', tab: 'report' },
    });
  };

  const handleSyncAll = async () => {
    const withChess = students.filter((s) => String(s.chess_com_id || '').trim());
    if (!withChess.length) {
      setError('No students have a Chess.com ID to sync.');
      return;
    }
    setSyncingAll(true);
    setError('');
    setMessage('');
    try {
      const result = await syncAllStudentsChessCom();
      setMessage(
        result.message ||
          `Synced ${result.count || 0} student(s): live stats + ` +
            `${result.archivesFetched ?? 0} month(s), ${result.gamesUpserted ?? 0} games` +
            (result.durationMs != null ? ` · ${Math.round(result.durationMs / 1000)}s` : '')
      );
    } catch (err) {
      setError(err.message || 'Sync all failed.');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSync = async (student) => {
    const username = String(student?.chess_com_id || '').trim();
    if (!username) {
      setError('Add a Chess.com ID before syncing.');
      return;
    }
    setSyncingId(student.id);
    setError('');
    setMessage('');
    try {
      // Live Chess.com stats + all missing monthly archives / games
      const result = await syncChessComPlayer(username, { full: false });
      setMessage(
        `Synced ${username}: live stats updated` +
          ` · ${result.archivesProcessed ?? 0} month(s) fetched` +
          ` · ${result.gamesUpserted ?? 0} new games` +
          (result.totalGamesInDb != null ? ` · ${result.totalGamesInDb} total in DB` : '')
      );
    } catch (err) {
      setError(err.message || `Sync failed for ${username}.`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (student) => {
    if (
      !window.confirm(
        `Delete student “${student.player_name}”? This also removes their login account.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteStudent(student.id);
      setMessage('Student deleted.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete student.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="students-page">
      <header className="students-header">
        <button type="button" className="students-back" onClick={() => navigate('/dashboard')}>
          <FiArrowLeft aria-hidden /> Dashboard
        </button>
        <div className="students-header-row">
          <div>
            <h1>Students</h1>
            <p className="students-muted">
              {loading ? 'Loading…' : `${students.length} student${students.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="students-header-actions">
            <button
              type="button"
              className="students-btn"
              onClick={handleSyncAll}
              disabled={busy || syncingAll || loading}
            >
              <FiRefreshCw
                aria-hidden
                className={syncingAll ? 'students-spin' : undefined}
              />
              {syncingAll ? 'Syncing all…' : 'Sync all'}
            </button>
            <button type="button" className="students-btn students-btn--primary" onClick={openCreate}>
              <FiPlus aria-hidden /> Register student
            </button>
            <input
              className="students-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, Chess.com…"
            />
          </div>
        </div>
      </header>

      {error ? <p className="students-error">{error}</p> : null}
      {message ? <p className="students-ok">{message}</p> : null}

      {!loading && students.length === 0 ? (
        <div className="students-empty">No students yet. Register one to get started.</div>
      ) : null}

      {!loading && students.length > 0 ? (
        <div className="students-table-wrap">
          <table className="students-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chess.com</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className={s.chess_com_id ? 'students-row--clickable' : ''}
                  onClick={() => {
                    if (s.chess_com_id) openChessReport(s);
                  }}
                >
                  <td>
                    <strong>{s.player_name}</strong>
                  </td>
                  <td>{s.chess_com_id || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td>{(s.joining_date || '').slice(0, 10) || '—'}</td>
                  <td>
                    <span className={`students-status students-status--${s.status}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="students-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="students-icon-btn"
                      title="Chess.com report"
                      onClick={() => openChessReport(s)}
                      disabled={busy || !s.chess_com_id}
                    >
                      <FiEye aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="students-icon-btn"
                      title="Sync Chess.com"
                      onClick={() => handleSync(s)}
                      disabled={busy || !s.chess_com_id || syncingId === s.id}
                    >
                      <FiRefreshCw
                        aria-hidden
                        className={syncingId === s.id ? 'students-spin' : undefined}
                      />
                    </button>
                    <button
                      type="button"
                      className="students-icon-btn"
                      title="Edit"
                      onClick={() => openEdit(s)}
                      disabled={busy}
                    >
                      <FiEdit2 aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="students-icon-btn"
                      title="Reset password"
                      onClick={() => openPassword(s)}
                      disabled={busy}
                    >
                      <FiKey aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="students-icon-btn students-icon-btn--danger"
                      title="Delete"
                      onClick={() => handleDelete(s)}
                      disabled={busy}
                    >
                      <FiTrash2 aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modal === 'create' || modal === 'edit' ? (
        <div className="students-modal" role="dialog" aria-modal="true">
          <form
            className="students-modal-card"
            autoComplete="off"
            onSubmit={modal === 'create' ? handleCreate : handleUpdate}
          >
            <div className="students-modal-header">
              <div className="students-modal-header-text">
                <h2 className="students-modal-title">
                  {modal === 'create' ? 'Register student' : 'Edit student'}
                </h2>
                <p className="students-modal-sub">
                  {modal === 'create'
                    ? 'Creates a student profile and login account.'
                    : 'Update profile and login email.'}
                </p>
              </div>
              <button type="button" className="students-icon-btn" onClick={closeModal} aria-label="Close">
                <FiX aria-hidden />
              </button>
            </div>

            {/* decoys: stop browsers from stuffing saved login into the real fields */}
            <input
              type="text"
              name="prevent_autofill_user"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="students-autofill-decoy"
              defaultValue=""
            />
            <input
              type="password"
              name="prevent_autofill_pass"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              className="students-autofill-decoy"
              defaultValue=""
            />

            <div className="students-form-section">
              <h3>Profile</h3>
              <div className="students-form-grid">
                <label className="students-field students-field--full">
                  <span>Player name *</span>
                  <input
                    required
                    name="student_player_name"
                    autoComplete="off"
                    value={form.player_name}
                    onChange={(e) => setForm((f) => ({ ...f, player_name: e.target.value }))}
                    placeholder="Full name"
                  />
                </label>
                <label className="students-field">
                  <span>Chess.com ID</span>
                  <input
                    name="student_chess_com_id"
                    autoComplete="off"
                    value={form.chess_com_id}
                    onChange={(e) => setForm((f) => ({ ...f, chess_com_id: e.target.value }))}
                    placeholder="username"
                  />
                </label>
                <label className="students-field">
                  <span>Joining date *</span>
                  <input
                    required
                    type="date"
                    name="student_joining_date"
                    autoComplete="off"
                    value={form.joining_date}
                    onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))}
                  />
                </label>
                <label className="students-field">
                  <span>Status</span>
                  <select
                    name="student_status"
                    autoComplete="off"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="left">left</option>
                  </select>
                </label>
                <label className="students-field">
                  <span>Phone</span>
                  <input
                    name="student_phone"
                    autoComplete="off"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <label className="students-field students-field--full">
                  <span>Notes</span>
                  <textarea
                    name="student_notes"
                    autoComplete="off"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </label>
              </div>
            </div>

            <div className="students-form-section">
              <h3>Login credentials</h3>
              <div className="students-form-grid">
                <label className="students-field students-field--full">
                  <span>Email *</span>
                  <input
                    required
                    type="email"
                    name="student_email_login"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="student@email.com"
                  />
                </label>
                {modal === 'create' ? (
                  <label className="students-field students-field--full">
                    <span>Password *</span>
                    <input
                      required
                      type="password"
                      name="student_new_password"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      minLength={4}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="At least 4 characters"
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="students-modal-actions">
              <button type="button" className="students-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="students-btn students-btn--primary" disabled={busy}>
                {busy ? 'Saving…' : modal === 'create' ? 'Register' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {modal === 'password' && editing ? (
        <div className="students-modal" role="dialog" aria-modal="true">
          <form className="students-modal-card students-modal-card--narrow" autoComplete="off" onSubmit={handlePassword}>
            <div className="students-modal-header">
              <div className="students-modal-header-text">
                <h2 className="students-modal-title">Reset password</h2>
                <p className="students-modal-sub">
                  {editing.player_name} · {editing.email}
                </p>
              </div>
              <button type="button" className="students-icon-btn" onClick={closeModal} aria-label="Close">
                <FiX aria-hidden />
              </button>
            </div>
            <input
              type="password"
              name="prevent_autofill_pass2"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              className="students-autofill-decoy"
              defaultValue=""
            />
            <label className="students-field">
              <span>New password *</span>
              <input
                required
                type="password"
                name="student_reset_password"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                minLength={4}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 4 characters"
                autoFocus
              />
            </label>
            <div className="students-modal-actions">
              <button type="button" className="students-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="students-btn students-btn--primary" disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default Students;
