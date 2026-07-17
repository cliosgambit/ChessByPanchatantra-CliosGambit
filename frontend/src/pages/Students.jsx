import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiEdit2,
  FiEye,
  FiKey,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import {
  createStudent,
  deleteStudent,
  fetchStudents,
  syncAllStudentsChessCom,
  updateStudent,
  updateStudentPassword,
} from '../services/studentService';
import {
  createBatch,
  deleteBatch,
  fetchBatches,
} from '../services/batchService';
import { syncChessComPlayer } from '../services/chessComDbService';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
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

const EMPTY_BATCH_FORM = {
  name: '',
  description: '',
  status: 'active',
};

function matchesQuery(haystacks, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  return haystacks.some((v) =>
    String(v || '')
      .toLowerCase()
      .includes(q)
  );
}

function Students() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('students'); // 'students' | 'batches'
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [chessFilter, setChessFilter] = useState('all');
  const [batchStatusFilter, setBatchStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'password' | 'batch-create' | null
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH_FORM);
  const [newPassword, setNewPassword] = useState('');

  const [syncingId, setSyncingId] = useState(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [studentsData, batchesData] = await Promise.all([
        fetchStudents(),
        fetchBatches(),
      ]);
      setStudents(studentsData.students || []);
      setBatches(batchesData.batches || []);
    } catch (err) {
      setError(err.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [batchesData, studentsData] = await Promise.all([
        fetchBatches(),
        fetchStudents(),
      ]);
      setBatches(batchesData.batches || []);
      setStudents(studentsData.students || []);
    } catch (err) {
      setError(err.message || 'Failed to load batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'students') loadStudents();
    else loadBatches();
  }, [tab, loadStudents, loadBatches]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (
        !matchesQuery(
          [s.player_name, s.email, s.chess_com_id, s.phone, s.notes],
          query
        )
      ) {
        return false;
      }
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (chessFilter === 'with' && !String(s.chess_com_id || '').trim()) return false;
      if (chessFilter === 'without' && String(s.chess_com_id || '').trim()) return false;
      if (batchFilter === 'none') {
        if ((s.batches || []).length > 0) return false;
      } else if (batchFilter !== 'all') {
        const bid = Number(batchFilter);
        if (!(s.batches || []).some((b) => Number(b.id) === bid)) return false;
      }
      return true;
    });
  }, [students, query, statusFilter, batchFilter, chessFilter]);

  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (!matchesQuery([b.name, b.description], query)) return false;
      if (batchStatusFilter !== 'all' && b.status !== batchStatusFilter) return false;
      return true;
    });
  }, [batches, query, batchStatusFilter]);

  const studentStats = useMemo(() => {
    const active = students.filter((s) => s.status === 'active').length;
    const unassigned = students.filter((s) => !(s.batches || []).length).length;
    return { total: students.length, active, unassigned };
  }, [students]);

  const hasActiveFilters =
    tab === 'students'
      ? Boolean(query.trim()) ||
        statusFilter !== 'all' ||
        batchFilter !== 'all' ||
        chessFilter !== 'all'
      : Boolean(query.trim()) || batchStatusFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setBatchFilter('all');
    setChessFilter('all');
    setBatchStatusFilter('all');
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, joining_date: new Date().toISOString().slice(0, 10) });
    setModal('create');
    setError('');
    setMessage('');
  };

  const openBatchCreate = () => {
    setBatchForm({ ...EMPTY_BATCH_FORM });
    setModal('batch-create');
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
      await loadStudents();
    } catch (err) {
      setError(err.message || 'Failed to register student.');
    } finally {
      setBusy(false);
    }
  };

  const handleBatchCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await createBatch(batchForm);
      setMessage(`Batch “${data.batch?.name || batchForm.name}” created.`);
      closeModal();
      await loadBatches();
    } catch (err) {
      setError(err.message || 'Failed to create batch.');
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
      await loadStudents();
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
    navigate(`/players/${encodeURIComponent(username)}/new`, {
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
      await loadStudents();
    } catch (err) {
      setError(err.message || 'Failed to delete student.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (
      !window.confirm(
        `Delete batch “${batch.name}”? Students are not deleted — only the batch membership.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteBatch(batch.id);
      setMessage('Batch deleted.');
      await loadBatches();
    } catch (err) {
      setError(err.message || 'Failed to delete batch.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="students-page">
      <header className="students-header">
        <div className="students-toolbar">
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', to: '/dashboard' },
              { label: 'Students' },
            ]}
          />
          <div className="students-header-actions">
            {tab === 'students' ? (
              <>
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
                  {syncingAll ? 'Syncing…' : 'Sync all'}
                </button>
                <button
                  type="button"
                  className="students-btn students-btn--primary"
                  onClick={openCreate}
                >
                  <FiPlus aria-hidden /> Register
                </button>
              </>
            ) : (
              <button
                type="button"
                className="students-btn students-btn--primary"
                onClick={openBatchCreate}
              >
                <FiPlus aria-hidden /> Create batch
              </button>
            )}
          </div>
        </div>

        <div className="students-title-block">
          <h1>Students</h1>
          <p className="students-muted">
            Register students first, then assign them to one or more batches.
          </p>
        </div>

        <div className="students-stats" aria-label="Student summary">
          <div className="students-stat">
            <span className="students-stat-value">{studentStats.total}</span>
            <span className="students-stat-label">Total</span>
          </div>
          <div className="students-stat">
            <span className="students-stat-value">{studentStats.active}</span>
            <span className="students-stat-label">Active</span>
          </div>
          <div className="students-stat">
            <span className="students-stat-value">{studentStats.unassigned}</span>
            <span className="students-stat-label">No batch</span>
          </div>
          <div className="students-stat">
            <span className="students-stat-value">{batches.length}</span>
            <span className="students-stat-label">Batches</span>
          </div>
        </div>

        <div className="students-tabs" role="tablist" aria-label="Students sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'students'}
            className={`students-tab${tab === 'students' ? ' is-active' : ''}`}
            onClick={() => {
              setTab('students');
              setMessage('');
              setError('');
            }}
          >
            Students
            <span className="students-tab-count">{students.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'batches'}
            className={`students-tab${tab === 'batches' ? ' is-active' : ''}`}
            onClick={() => {
              setTab('batches');
              setMessage('');
              setError('');
            }}
          >
            Batches
            <span className="students-tab-count">{batches.length}</span>
          </button>
        </div>
      </header>

      <div className="students-filters" role="search">
        <label className="students-search-wrap">
          <FiSearch aria-hidden className="students-search-icon" />
          <input
            className="students-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === 'students'
                ? 'Search name, email, Chess.com…'
                : 'Search batches…'
            }
            aria-label="Search"
          />
          {query ? (
            <button
              type="button"
              className="students-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <FiX aria-hidden />
            </button>
          ) : null}
        </label>

        {tab === 'students' ? (
          <>
            <select
              className="students-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="left">Left</option>
            </select>
            <select
              className="students-filter-select"
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              aria-label="Filter by batch"
            >
              <option value="all">All batches</option>
              <option value="none">No batch</option>
              {batches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              className="students-filter-select"
              value={chessFilter}
              onChange={(e) => setChessFilter(e.target.value)}
              aria-label="Filter by Chess.com ID"
            >
              <option value="all">Chess.com: all</option>
              <option value="with">Has Chess.com ID</option>
              <option value="without">Missing Chess.com ID</option>
            </select>
          </>
        ) : (
          <select
            className="students-filter-select"
            value={batchStatusFilter}
            onChange={(e) => setBatchStatusFilter(e.target.value)}
            aria-label="Filter by batch status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        )}

        {hasActiveFilters ? (
          <button type="button" className="students-btn students-btn--ghost" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="students-results-meta">
        {loading ? (
          <span>Loading…</span>
        ) : tab === 'students' ? (
          <span>
            Showing <strong>{filteredStudents.length}</strong> of {students.length} student
            {students.length === 1 ? '' : 's'}
          </span>
        ) : (
          <span>
            Showing <strong>{filteredBatches.length}</strong> of {batches.length} batch
            {batches.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      {error ? <p className="students-error">{error}</p> : null}
      {message ? <p className="students-ok">{message}</p> : null}

      {tab === 'students' ? (
        <>
          {!loading && students.length === 0 ? (
            <div className="students-empty">No students yet. Register one to get started.</div>
          ) : null}

          {!loading && students.length > 0 && filteredStudents.length === 0 ? (
            <div className="students-empty">
              No students match these filters.
              <button type="button" className="students-btn students-btn--ghost" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}

          {!loading && filteredStudents.length > 0 ? (
            <div className="students-table-wrap">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Batches</th>
                    <th>Chess.com</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr
                      key={s.id}
                      className={s.chess_com_id ? 'students-row--clickable' : ''}
                      onClick={() => {
                        if (s.chess_com_id) openChessReport(s);
                      }}
                    >
                      <td>
                        <div className="students-name-cell">
                          <strong>{s.player_name}</strong>
                          {s.phone ? <span className="students-cell-sub">{s.phone}</span> : null}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {(s.batches || []).length === 0 ? (
                          <span className="students-muted">Unassigned</span>
                        ) : (
                          <div className="students-batch-chips">
                            {s.batches.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                className="students-batch-chip"
                                title={`Open ${b.name}`}
                                onClick={() => navigate(`/students/batches/${b.id}`)}
                              >
                                {b.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {s.chess_com_id ? (
                          <span className="students-mono">{s.chess_com_id}</span>
                        ) : (
                          <span className="students-muted">—</span>
                        )}
                      </td>
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
        </>
      ) : (
        <>
          {!loading && batches.length === 0 ? (
            <div className="students-empty">
              No batches yet. Create a batch, then assign existing students to it.
            </div>
          ) : null}

          {!loading && batches.length > 0 && filteredBatches.length === 0 ? (
            <div className="students-empty">
              No batches match these filters.
              <button type="button" className="students-btn students-btn--ghost" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : null}

          {!loading && filteredBatches.length > 0 ? (
            <div className="students-table-wrap">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.map((b) => (
                    <tr
                      key={b.id}
                      className="students-row--clickable"
                      onClick={() => navigate(`/students/batches/${b.id}`)}
                    >
                      <td>
                        <strong>{b.name}</strong>
                      </td>
                      <td>
                        <span className="students-desc-cell">{b.description || '—'}</span>
                      </td>
                      <td>
                        <span className="students-count-pill">{b.student_count ?? 0}</span>
                      </td>
                      <td>
                        <span
                          className={`students-status students-status--${
                            b.status === 'active' ? 'active' : 'left'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="students-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="students-icon-btn"
                          title="Open batch"
                          onClick={() => navigate(`/students/batches/${b.id}`)}
                          disabled={busy}
                        >
                          <FiEye aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="students-icon-btn students-icon-btn--danger"
                          title="Delete batch"
                          onClick={() => handleDeleteBatch(b)}
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
        </>
      )}

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
                    ? 'Creates a student profile and login account. Assign to batches later.'
                    : 'Update profile and login email.'}
                </p>
              </div>
              <button type="button" className="students-icon-btn" onClick={closeModal} aria-label="Close">
                <FiX aria-hidden />
              </button>
            </div>

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

      {modal === 'batch-create' ? (
        <div className="students-modal" role="dialog" aria-modal="true">
          <form
            className="students-modal-card students-modal-card--narrow"
            onSubmit={handleBatchCreate}
          >
            <div className="students-modal-header">
              <div className="students-modal-header-text">
                <h2 className="students-modal-title">Create batch</h2>
                <p className="students-modal-sub">
                  Create an empty batch, then open it to add students.
                </p>
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
                    value={batchForm.name}
                    onChange={(e) => setBatchForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Morning Juniors"
                    autoFocus
                  />
                </label>
                <label className="students-field students-field--full">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={batchForm.description}
                    onChange={(e) => setBatchForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <label className="students-field">
                  <span>Status</span>
                  <select
                    value={batchForm.status}
                    onChange={(e) => setBatchForm((f) => ({ ...f, status: e.target.value }))}
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
                {busy ? 'Creating…' : 'Create'}
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
            <label className="students-field" style={{ padding: '1rem 1.25rem 0' }}>
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
