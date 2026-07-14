import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiRefreshCw, FiTrash2, FiX } from 'react-icons/fi';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import {
  assignMoralPuzzle,
  fetchMoralPuzzles,
  unassignMoralPuzzle,
} from '../services/libraryService';
import { fetchGmPuzzles } from '../services/gmPuzzleService';
import { fetchLichessPuzzles } from '../services/lichessPuzzleService';
import {
  fetchChessComRandomPuzzle,
  fetchSavedChessComPuzzles,
} from '../services/chessComDbService';
import { resolveLichessPuzzlePosition } from '../utils/lichessPuzzleFen';
import './LibraryMoralPuzzles.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const SOURCE_LABEL = {
  gm: 'GM',
  lichess: 'Lichess',
  chesscom: 'Chess.com',
};

function playFenForAssignment(assignment) {
  const p = assignment?.puzzle;
  if (!p?.fen) return null;
  if (p.source === 'lichess' || assignment.source === 'lichess') {
    return resolveLichessPuzzlePosition(p.fen, p.moves).playFen || p.fen;
  }
  return p.fen;
}

function LibraryMoralPuzzles() {
  const { storyId, moralId } = useParams();
  const navigate = useNavigate();

  const [story, setStory] = useState(null);
  const [moral, setMoral] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [boardKey, setBoardKey] = useState(0);

  const [picker, setPicker] = useState(null); // 'gm' | 'lichess' | 'chesscom' | null
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [chesscomDraft, setChesscomDraft] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMoralPuzzles(storyId, moralId);
      setStory(data.story || null);
      setMoral(data.moral || null);
      setAssignments(data.assignments || []);
      setSelectedIndex(0);
      setBoardKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Failed to load moral puzzles.');
      setStory(null);
      setMoral(null);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [storyId, moralId]);

  useEffect(() => {
    load();
  }, [load]);

  const active = assignments[selectedIndex] || assignments[0] || null;
  const puzzleFen = playFenForAssignment(active);
  const boardFen = puzzleFen || START_FEN;
  const hasPuzzle = Boolean(puzzleFen);

  const images = useMemo(() => {
    const list = Array.isArray(story?.images) ? story.images : [];
    return list.map((img) => img.image_url || img.url).filter(Boolean);
  }, [story]);

  const openPicker = async (source) => {
    setPicker(source);
    setPickerQuery('');
    setPickerRows([]);
    setChesscomDraft(null);
    setPickerLoading(true);
    setError('');
    try {
      if (source === 'gm') {
        const data = await fetchGmPuzzles({ unused: true, limit: 100 });
        setPickerRows(data.puzzles || []);
      } else if (source === 'lichess') {
        const data = await fetchLichessPuzzles({ unused: true, limit: 100 });
        setPickerRows(data.puzzles || []);
      } else if (source === 'chesscom') {
        const data = await fetchSavedChessComPuzzles({ unused: true, limit: 100 });
        setPickerRows(data.puzzles || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load unused puzzles.');
    } finally {
      setPickerLoading(false);
    }
  };

  const searchPicker = async () => {
    if (!picker) return;
    setPickerLoading(true);
    try {
      if (picker === 'gm') {
        const data = await fetchGmPuzzles({ unused: true, q: pickerQuery, limit: 100 });
        setPickerRows(data.puzzles || []);
      } else if (picker === 'lichess') {
        const data = await fetchLichessPuzzles({ unused: true, q: pickerQuery, limit: 100 });
        setPickerRows(data.puzzles || []);
      } else if (picker === 'chesscom') {
        const data = await fetchSavedChessComPuzzles({
          unused: true,
          q: pickerQuery,
          limit: 100,
        });
        setPickerRows(data.puzzles || []);
      }
    } catch (err) {
      setError(err.message || 'Search failed.');
    } finally {
      setPickerLoading(false);
    }
  };

  const handleAssign = async (source, puzzleId) => {
    setBusy(true);
    setError('');
    try {
      await assignMoralPuzzle(storyId, moralId, { source, puzzle_id: puzzleId });
      setPicker(null);
      setChesscomDraft(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to assign puzzle.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (assignmentId) => {
    if (!window.confirm('Remove this puzzle from the moral?')) return;
    setBusy(true);
    setError('');
    try {
      await unassignMoralPuzzle(storyId, moralId, assignmentId);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to remove puzzle.');
    } finally {
      setBusy(false);
    }
  };

  const handleFetchChesscom = async () => {
    setPickerLoading(true);
    setError('');
    try {
      const puzzle = await fetchChessComRandomPuzzle();
      setChesscomDraft(puzzle);
      // Refresh unused saved list
      const data = await fetchSavedChessComPuzzles({ unused: true, limit: 100 });
      setPickerRows(data.puzzles || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch Chess.com puzzle.');
    } finally {
      setPickerLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="moral-puzzles-page">
        <p className="moral-puzzles-muted">Loading…</p>
      </div>
    );
  }

  if (!story || !moral) {
    return (
      <div className="moral-puzzles-page">
        <p className="moral-puzzles-error">{error || 'Not found.'}</p>
        <button type="button" className="moral-puzzles-back" onClick={() => navigate(`/library/${storyId}`)}>
          <FiArrowLeft aria-hidden /> Back to story
        </button>
      </div>
    );
  }

  return (
    <div className="moral-puzzles-page">
      <div className="moral-puzzles-left">
        <button
          type="button"
          className="moral-puzzles-back"
          onClick={() => navigate(`/library/${storyId}`)}
        >
          <FiArrowLeft aria-hidden /> Back to story
        </button>

        <p className="moral-puzzles-kicker">Moral puzzles</p>
        <h1>
          <span className="moral-puzzles-code">{moral.moral_code || moral.id}</span>{' '}
          {moral.moral_name}
        </h1>

        <h2 className="moral-puzzles-story-title">{story.title}</h2>
        {story.subheading ? <p className="moral-puzzles-sub">{story.subheading}</p> : null}

        {images.length > 0 ? (
          <div className="moral-puzzles-thumbs">
            {images.map((src) => (
              <img key={src} src={src} alt="" />
            ))}
          </div>
        ) : null}

        {error ? <p className="moral-puzzles-error">{error}</p> : null}

        <section className="moral-puzzles-assign">
          <h3>Assigned puzzles ({assignments.length})</h3>
          <div className="moral-puzzles-add-row">
            <button type="button" className="moral-puzzles-btn" onClick={() => openPicker('gm')} disabled={busy}>
              <FiPlus aria-hidden /> GM
            </button>
            <button
              type="button"
              className="moral-puzzles-btn"
              onClick={() => openPicker('lichess')}
              disabled={busy}
            >
              <FiPlus aria-hidden /> Lichess
            </button>
            <button
              type="button"
              className="moral-puzzles-btn moral-puzzles-btn--primary"
              onClick={() => openPicker('chesscom')}
              disabled={busy}
            >
              <FiPlus aria-hidden /> Chess.com
            </button>
          </div>

          {assignments.length === 0 ? (
            <p className="moral-puzzles-muted">No puzzles yet. Add from GM, Lichess, or Chess.com.</p>
          ) : (
            <ul className="moral-puzzles-list">
              {assignments.map((a, i) => (
                <li key={a.assignment_id} className={i === selectedIndex ? 'is-active' : ''}>
                  <button type="button" className="moral-puzzles-list-main" onClick={() => {
                    setSelectedIndex(i);
                    setBoardKey((k) => k + 1);
                  }}>
                    <span className="moral-puzzles-source">{SOURCE_LABEL[a.source] || a.source}</span>
                    <span>{a.puzzle?.title || `#${a.puzzle_id}`}</span>
                  </button>
                  <button
                    type="button"
                    className="moral-puzzles-icon-btn"
                    aria-label="Remove"
                    disabled={busy}
                    onClick={() => handleRemove(a.assignment_id)}
                  >
                    <FiTrash2 aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="moral-puzzles-right">
        <div className="moral-puzzles-board-wrap">
          <ChroniclesPuzzleBoard
            initialFen={boardFen}
            resetKey={`${boardKey}-${hasPuzzle ? 'puzzle' : 'start'}`}
            onMoveHistoryChange={() => {}}
          />
          {!hasPuzzle ? (
            <p className="moral-puzzles-muted moral-puzzles-board-hint">
              Starting position — assign a puzzle to load it here.
            </p>
          ) : null}
        </div>
      </div>

      {picker ? (
        <div className="moral-puzzles-modal" role="dialog" aria-modal="true">
          <div className="moral-puzzles-modal-card">
            <header>
              <h2>Add {SOURCE_LABEL[picker]} puzzle</h2>
              <button type="button" className="moral-puzzles-icon-btn" onClick={() => setPicker(null)}>
                <FiX aria-hidden />
              </button>
            </header>

            {picker === 'chesscom' ? (
              <div className="moral-puzzles-chesscom-tools">
                <button
                  type="button"
                  className="moral-puzzles-btn moral-puzzles-btn--primary"
                  onClick={handleFetchChesscom}
                  disabled={pickerLoading || busy}
                >
                  <FiRefreshCw aria-hidden /> Fetch new (saves unique FEN)
                </button>
                {chesscomDraft?.fen ? (
                  <div className="moral-puzzles-draft">
                    <p>
                      <strong>{chesscomDraft.title || 'Fetched puzzle'}</strong>
                      {chesscomDraft.is_used ? ' · already used' : ' · unused'}
                      {chesscomDraft.id != null ? ` · id ${chesscomDraft.id}` : ''}
                    </p>
                    <p className="moral-puzzles-fen">{chesscomDraft.fen}</p>
                    {chesscomDraft.id != null && !chesscomDraft.is_used ? (
                      <button
                        type="button"
                        className="moral-puzzles-btn"
                        disabled={busy}
                        onClick={() => handleAssign('chesscom', chesscomDraft.id)}
                      >
                        Assign this puzzle
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="moral-puzzles-search-row">
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search unused puzzles…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchPicker();
                  }
                }}
              />
              <button type="button" className="moral-puzzles-btn" onClick={searchPicker} disabled={pickerLoading}>
                Search
              </button>
            </div>

            {pickerLoading ? (
              <p className="moral-puzzles-muted">Loading unused puzzles…</p>
            ) : pickerRows.length === 0 ? (
              <p className="moral-puzzles-muted">No unused puzzles found.</p>
            ) : (
              <ul className="moral-puzzles-picker-list">
                {pickerRows.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>
                        #{row.id}
                        {row.title ? ` · ${row.title}` : ''}
                        {row.rating != null ? ` · ${row.rating}` : ''}
                      </strong>
                      <p className="moral-puzzles-fen">{row.fen}</p>
                    </div>
                    <button
                      type="button"
                      className="moral-puzzles-btn"
                      disabled={busy || row.is_used}
                      onClick={() => handleAssign(picker, row.id)}
                    >
                      Assign
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LibraryMoralPuzzles;
