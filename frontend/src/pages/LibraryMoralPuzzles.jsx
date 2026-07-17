import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FiPlus, FiRefreshCw, FiShuffle, FiTrash2, FiX } from 'react-icons/fi';
import FenHoverPreview from '../components/userProfile/FenHoverPreview';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { useAuth } from '../context/AuthContext';
import {
  assignMoralPuzzle,
  fetchMoralPuzzles,
  unassignMoralPuzzle,
} from '../services/libraryService';
import { fetchChapterMoralPuzzles } from '../services/modulesService';
import { fetchGmPuzzles } from '../services/gmPuzzleService';
import { fetchLichessPuzzles, fetchLichessPuzzleFilters } from '../services/lichessPuzzleService';
import {
  fetchChessComRandomPuzzle,
  persistChessComPuzzle,
} from '../services/chessComDbService';
import { resolveLichessPuzzlePosition } from '../utils/lichessPuzzleFen';
import { solutionSansFromChessCom, solutionTextFromChessCom } from '../utils/chessComPgnUtils';
import { fetchBestMoveSequence, uciSequenceToSans } from '../utils/stockfishClient';
import { Chess } from 'chess.js';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import './LibraryMoralPuzzles.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PICKER_BOARD_SIZE = 380;

function turnLabelFromFen(fen) {
  const turn = String(fen || '').split(/\s+/)[1];
  return turn === 'b' ? 'Black to play' : 'White to play';
}

function orientationFromFen(fen) {
  const turn = String(fen || '').split(/\s+/)[1];
  return turn === 'b' ? 'black' : 'white';
}

function previewFenForPickerRow(source, row) {
  if (!row?.fen) return null;
  if (source === 'lichess') {
    return resolveLichessPuzzlePosition(row.fen, row.moves).playFen || row.fen;
  }
  return row.fen;
}

const LICHESS_SORT_OPTIONS = [
  { value: 'rating_desc', label: 'Rating (high → low)' },
  { value: 'rating_asc', label: 'Rating (low → high)' },
  { value: 'popularity_desc', label: 'Popularity' },
  { value: 'nb_plays_desc', label: 'Most played' },
  { value: 'id_asc', label: 'ID' },
];

const DEFAULT_LICHESS_FILTERS = {
  ratingMin: '',
  ratingMax: '',
  theme: '',
  opening: '',
  sort: 'rating_desc',
};

function splitSpaceTags(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function formatTagLabel(value) {
  return String(value || '').replace(/_/g, ' ');
}

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

const SOURCE_LABEL = {
  gm: 'GM',
  lichess: 'Lichess',
  chesscom: 'Chess.com',
};

const SOLUTION_ENGINE_DEPTH = 15;
const SOLUTION_MAX_PLIES = 14;

function playFenForAssignment(assignment) {
  const p = assignment?.puzzle;
  if (!p?.fen) return null;
  if (p.source === 'lichess' || assignment.source === 'lichess') {
    return resolveLichessPuzzlePosition(p.fen, p.moves).playFen || p.fen;
  }
  return p.fen;
}

function solutionSansForAssignment(assignment) {
  const p = assignment?.puzzle;
  if (!p) return [];
  if (p.source === 'lichess' || assignment.source === 'lichess') {
    return resolveLichessPuzzlePosition(p.fen, p.moves).solutionSans || [];
  }
  if (p.source === 'chesscom' || assignment.source === 'chesscom') {
    return solutionSansFromChessCom(p.solution || p.pgn, p.fen);
  }
  if (!p.moves || !p.fen) return [];
  try {
    const game = new Chess(p.fen);
    const parts = String(p.moves).trim().split(/\s+/).filter(Boolean);
    const sans = [];
    for (const part of parts) {
      if (part.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(part)) {
        const result = game.move({
          from: part.slice(0, 2),
          to: part.slice(2, 4),
          promotion: part[4] || undefined,
        });
        if (!result) break;
        sans.push(result.san);
      } else {
        const result = game.move(part);
        if (!result) break;
        sans.push(result.san);
      }
    }
    return sans;
  } catch {
    return [];
  }
}

function chipLabel(source, indexInSource) {
  const prefix = source === 'gm' ? 'GM' : source === 'lichess' ? 'Li' : 'CC';
  return `${prefix}-${indexInSource + 1}`;
}

function sameChessComPuzzle(a, b) {
  if (!a || !b) return false;
  const fenA = String(a.fen || '').trim();
  const fenB = String(b.fen || '').trim();
  if (fenA && fenB && fenA === fenB) return true;
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true;
  return false;
}

function LibraryMoralPuzzles() {
  const { storyId, moralId, moduleId, chapterId } = useParams();
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const canManage = isAdmin;
  const storyBackPath =
    moduleId && chapterId
      ? `/modules/${moduleId}/chapters/${chapterId}/stories/${storyId}`
      : `/library/${storyId}`;

  const [story, setStory] = useState(null);
  const [moral, setMoral] = useState(null);
  const [moduleMeta, setModuleMeta] = useState(null);
  const [chapterMeta, setChapterMeta] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [boardKey, setBoardKey] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [computedSolutionSans, setComputedSolutionSans] = useState([]);
  const [isFetchingSolution, setIsFetchingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState('');
  const solutionFetchId = useRef(0);
  /** assignment_id → { sans, error } — avoids re-fetching when switching puzzles on this page */
  const solutionCacheRef = useRef(new Map());
  const [chipMenu, setChipMenu] = useState(null); // { x, y, assignmentId, label }

  const [picker, setPicker] = useState(null); // 'gm' | 'lichess' | 'chesscom' | null
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [chesscomDraft, setChesscomDraft] = useState(null);
  const [pickerSelectedId, setPickerSelectedId] = useState(null);
  const [pickerHoverId, setPickerHoverId] = useState(null);
  const [lichessFilters, setLichessFilters] = useState(DEFAULT_LICHESS_FILTERS);
  const [lichessMeta, setLichessMeta] = useState(null);
  const [lichessMetaLoading, setLichessMetaLoading] = useState(false);
  const pickerItemRefs = useRef(new Map());

  useEffect(() => {
    if (pickerSelectedId == null) return;
    const el = pickerItemRefs.current.get(String(pickerSelectedId));
    if (!el) return;
    const scrollParent = el.closest('.moral-puzzles-picker-scroll');
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset =
        elRect.top - parentRect.top - parentRect.height / 2 + elRect.height / 2;
      scrollParent.scrollBy({ top: offset, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }, [pickerSelectedId]);

  const load = useCallback(async () => {
    solutionCacheRef.current.clear();
    setLoading(true);
    setError('');
    try {
      const data =
        moduleId && chapterId
          ? await fetchChapterMoralPuzzles(moduleId, chapterId, storyId, moralId)
          : await fetchMoralPuzzles(storyId, moralId);
      setStory(data.story || null);
      setMoral(data.moral || null);
      setModuleMeta(data.module || null);
      setChapterMeta(data.chapter || null);
      setAssignments(data.assignments || []);
      setSelectedIndex(0);
      setBoardKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Failed to load moral puzzles.');
      setStory(null);
      setMoral(null);
      setModuleMeta(null);
      setChapterMeta(null);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [moduleId, chapterId, storyId, moralId]);

  useEffect(() => {
    load();
  }, [load]);

  const active = assignments[selectedIndex] || assignments[0] || null;

  const puzzleFen = playFenForAssignment(active);
  const boardFen = puzzleFen || START_FEN;
  const hasPuzzle = Boolean(puzzleFen);
  const solutionSans = useMemo(() => solutionSansForAssignment(active), [active]);
  const displayedSolutionSans =
    solutionSans.length > 0 ? solutionSans : computedSolutionSans;

  useEffect(() => {
    const fetchId = ++solutionFetchId.current;
    setShowSolution(false);

    if (!active?.assignment_id || !puzzleFen) {
      setComputedSolutionSans([]);
      setSolutionError('');
      setIsFetchingSolution(false);
      return undefined;
    }

    if (solutionSans.length > 0) {
      setComputedSolutionSans([]);
      setSolutionError('');
      setIsFetchingSolution(false);
      return undefined;
    }

    const cacheKey = String(active.assignment_id);
    const cached = solutionCacheRef.current.get(cacheKey);
    if (cached) {
      setComputedSolutionSans(cached.sans || []);
      setSolutionError(cached.error || '');
      setIsFetchingSolution(false);
      return undefined;
    }

    setSolutionError('');
    setComputedSolutionSans([]);
    setIsFetchingSolution(true);

    (async () => {
      try {
        const uciMoves = await fetchBestMoveSequence(puzzleFen, {
          depth: SOLUTION_ENGINE_DEPTH,
          ply: SOLUTION_MAX_PLIES,
        });
        if (fetchId !== solutionFetchId.current) return;
        if (!uciMoves.length) {
          throw new Error('Analysis returned no valid moves.');
        }
        const sans = uciSequenceToSans(puzzleFen, uciMoves);
        if (!sans.length) {
          throw new Error('Analysis returned no valid moves.');
        }
        solutionCacheRef.current.set(cacheKey, { sans, error: '' });
        setComputedSolutionSans(sans);
      } catch (err) {
        if (fetchId !== solutionFetchId.current) return;
        const message = err.message || 'Failed to fetch solution from Stockfish.';
        solutionCacheRef.current.set(cacheKey, { sans: [], error: message });
        setSolutionError(message);
      } finally {
        if (fetchId === solutionFetchId.current) {
          setIsFetchingSolution(false);
        }
      }
    })();

    return undefined;
  }, [active?.assignment_id, puzzleFen, solutionSans.length]);

  const handleShowSolution = useCallback(() => {
    setShowSolution(true);
  }, []);

  const puzzlesBySource = useMemo(() => {
    const groups = { gm: [], lichess: [], chesscom: [] };
    assignments.forEach((a, globalIndex) => {
      const key = a.source;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ assignment: a, globalIndex, localIndex: groups[key].length });
    });
    return groups;
  }, [assignments]);

  const loadLichessPickerRows = useCallback(
    async ({ query = pickerQuery, filters = lichessFilters } = {}) => {
      const data = await fetchLichessPuzzles({
        unused: true,
        q: query,
        limit: 100,
        ratingMin: filters.ratingMin,
        ratingMax: filters.ratingMax,
        theme: filters.theme,
        opening: filters.opening,
        sort: filters.sort,
      });
      setPickerRows(data.puzzles || []);
    },
    [lichessFilters, pickerQuery]
  );

  const openPicker = async (source) => {
    setPicker(source);
    setPickerQuery('');
    setPickerRows([]);
    setChesscomDraft(null);
    setPickerSelectedId(null);
    setPickerHoverId(null);
    setLichessFilters(DEFAULT_LICHESS_FILTERS);
    setLichessMeta(null);
    setPickerLoading(true);
    setError('');
    try {
      if (source === 'gm') {
        const data = await fetchGmPuzzles({ unused: true, limit: 100 });
        setPickerRows(data.puzzles || []);
      } else if (source === 'lichess') {
        setLichessMetaLoading(true);
        const [meta] = await Promise.all([
          fetchLichessPuzzleFilters({ unused: true }),
          loadLichessPickerRows({ query: '', filters: DEFAULT_LICHESS_FILTERS }),
        ]);
        setLichessMeta(meta);
      } else if (source === 'chesscom') {
        const puzzle = await fetchChessComRandomPuzzle();
        setChesscomDraft(puzzle);
        puzzle?.persistPromise?.then((saved) => {
          if (!saved) return;
          setChesscomDraft((current) =>
            current && sameChessComPuzzle(current, saved)
              ? { ...current, ...saved, persistPromise: undefined }
              : current
          );
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load unused puzzles.');
    } finally {
      setPickerLoading(false);
      setLichessMetaLoading(false);
    }
  };

  const searchPicker = async () => {
    if (!picker || picker === 'chesscom') return;
    setPickerLoading(true);
    setPickerSelectedId(null);
    setPickerHoverId(null);
    try {
      if (picker === 'gm') {
        const data = await fetchGmPuzzles({ unused: true, q: pickerQuery, limit: 100 });
        setPickerRows(data.puzzles || []);
      } else if (picker === 'lichess') {
        await loadLichessPickerRows({ query: pickerQuery, filters: lichessFilters });
      }
    } catch (err) {
      setError(err.message || 'Search failed.');
    } finally {
      setPickerLoading(false);
    }
  };

  const closePicker = () => {
    setPicker(null);
    setChesscomDraft(null);
    setPickerSelectedId(null);
    setPickerHoverId(null);
    setLichessFilters(DEFAULT_LICHESS_FILTERS);
    setLichessMeta(null);
  };

  const handleAssign = async (source, puzzleId) => {
    setBusy(true);
    setError('');
    try {
      let id = puzzleId;
      if (source === 'chesscom' && id == null) {
        let saved = null;
        if (chesscomDraft?.persistPromise) {
          saved = await chesscomDraft.persistPromise;
        }
        // Persist may have failed earlier (race) — retry ingest once before giving up.
        if (!saved?.id && chesscomDraft?.fen) {
          saved = await persistChessComPuzzle({
            title: chesscomDraft.title,
            fen: chesscomDraft.fen,
            pgn: chesscomDraft.solution || chesscomDraft.pgn,
            solution: chesscomDraft.solution || chesscomDraft.pgn,
            url: chesscomDraft.url,
            image: chesscomDraft.image,
            publish_time: chesscomDraft.publish_time,
            comments: chesscomDraft.comments,
          });
        }
        id = saved?.id ?? null;
        if (saved) {
          setChesscomDraft((current) =>
            current ? { ...current, ...saved, persistPromise: undefined } : current
          );
        }
      }
      if (id == null) throw new Error('Puzzle is still saving — try Assign again in a moment.');
      await assignMoralPuzzle(storyId, moralId, { source, puzzle_id: id });
      closePicker();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to assign puzzle.');
    } finally {
      setBusy(false);
    }
  };

  const pickRandomPickerPuzzle = () => {
    const candidates = pickerRows.filter((row) => !row.is_used);
    if (!candidates.length) return;
    let pick = candidates[Math.floor(Math.random() * candidates.length)];
    // Prefer a different puzzle when possible
    if (candidates.length > 1 && pickerSelectedId != null) {
      const others = candidates.filter((row) => String(row.id) !== String(pickerSelectedId));
      if (others.length) {
        pick = others[Math.floor(Math.random() * others.length)];
      }
    }
    setPickerSelectedId(pick.id);
    setPickerHoverId(null);
  };

  const pickerPreviewRow = useMemo(() => {
    if (picker === 'chesscom') return chesscomDraft;
    const id = pickerHoverId ?? pickerSelectedId;
    if (id == null) return null;
    return pickerRows.find((row) => String(row.id) === String(id)) || null;
  }, [picker, chesscomDraft, pickerHoverId, pickerSelectedId, pickerRows]);

  const pickerPreviewFen = useMemo(
    () => previewFenForPickerRow(picker, pickerPreviewRow),
    [picker, pickerPreviewRow]
  );

  const pickerSelectedRow = useMemo(() => {
    if (picker === 'chesscom') return chesscomDraft;
    if (pickerSelectedId == null) return null;
    return pickerRows.find((row) => String(row.id) === String(pickerSelectedId)) || null;
  }, [picker, chesscomDraft, pickerSelectedId, pickerRows]);

  useEffect(() => {
    if (!chipMenu) return undefined;
    const close = () => setChipMenu(null);
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [chipMenu]);

  const handleRemove = async (assignmentId) => {
    if (!window.confirm('Remove this puzzle from the moral?')) return;
    setChipMenu(null);
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
    const previous = chesscomDraft;
    try {
      const puzzle = await fetchChessComRandomPuzzle();
      if (previous && sameChessComPuzzle(previous, puzzle)) {
        setError('Chess.com returned the same puzzle — try again in a few seconds.');
        return;
      }
      setChesscomDraft(puzzle);
      puzzle?.persistPromise?.then((saved) => {
        if (!saved) return;
        setChesscomDraft((current) =>
          current && sameChessComPuzzle(current, saved)
            ? { ...current, ...saved, persistPromise: undefined }
            : current
        );
      });
    } catch (err) {
      setError(err.message || 'Failed to fetch Chess.com puzzle.');
    } finally {
      setPickerLoading(false);
    }
  };

  const moralBreadcrumb = useMemo(() => {
    const moralLabel = moral?.moral_name || moral?.moral_code || 'Moral puzzles';
    if (moduleId && chapterId) {
      return [
        { label: 'Dashboard', to: '/dashboard' },
        { label: 'Modules', to: '/modules' },
        { label: moduleMeta?.name || 'Module', to: `/modules/${moduleId}` },
        {
          label: chapterMeta?.name || 'Chapter',
          to: `/modules/${moduleId}/chapters/${chapterId}`,
        },
        {
          label: story?.title || 'Story',
          to: storyBackPath,
        },
        { label: moralLabel },
      ];
    }
    return [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Library', to: '/library' },
      { label: story?.title || 'Story', to: storyBackPath },
      { label: moralLabel },
    ];
  }, [
    moduleId,
    chapterId,
    moduleMeta?.name,
    chapterMeta?.name,
    story?.title,
    storyBackPath,
    moral?.moral_name,
    moral?.moral_code,
  ]);

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
        <PageBreadcrumb items={moralBreadcrumb} />
        <p className="moral-puzzles-error">{error || 'Not found.'}</p>
      </div>
    );
  }

  return (
    <div className="moral-puzzles-page moral-puzzles-page--play moral-puzzles-page--triple">
      <div className="moral-puzzles-zone moral-puzzles-zone--story">
        <div className="moral-puzzles-left-inner">
        <PageBreadcrumb items={moralBreadcrumb} />

        <h1 className="moral-play-title">{story.title}</h1>
        {story.subheading ? <p className="moral-play-sub">{story.subheading}</p> : null}

        {error ? <p className="moral-puzzles-error">{error}</p> : null}

        {story.content ? (
          <section className="moral-play-card">
            <p className="moral-play-card-label">Story Message</p>
            <p className="moral-play-card-body">{story.content}</p>
          </section>
        ) : null}

        <section className="moral-play-card moral-play-card--moral">
          <p className="moral-play-card-label">Moral</p>
          <p className="moral-play-card-body">
            {moral.moral_name}
            {moral.moral_code ? (
              <span className="moral-play-moral-code">{moral.moral_code}</span>
            ) : null}
          </p>
        </section>

        <section className="moral-play-card">
          <p className="moral-play-card-label">Positions &amp; Puzzles</p>
          {canManage ? (
            <div className="moral-puzzles-add-row moral-play-add-row">
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
          ) : null}

          {assignments.length === 0 ? (
            <p className="moral-puzzles-muted">
              {canManage
                ? 'No puzzles yet. Add from GM, Lichess, or Chess.com.'
                : 'No puzzles assigned to this moral yet.'}
            </p>
          ) : (
            <div className="moral-play-chip-groups">
              {['gm', 'lichess', 'chesscom'].map((source) => {
                const items = puzzlesBySource[source] || [];
                if (!items.length) return null;
                return (
                  <div key={source} className="moral-play-chip-group">
                    <span className="moral-play-chip-group-label">{SOURCE_LABEL[source]}</span>
                    <div className="moral-play-chips">
                      {items.map(({ assignment: a, globalIndex, localIndex }) => (
                        <button
                          key={a.assignment_id}
                          type="button"
                          className={[
                            'moral-play-chip',
                            `moral-play-chip--${source}`,
                            globalIndex === selectedIndex ? 'is-active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setSelectedIndex(globalIndex);
                            setBoardKey((k) => k + 1);
                            setChipMenu(null);
                          }}
                          onContextMenu={(e) => {
                            if (!canManage) return;
                            e.preventDefault();
                            setChipMenu({
                              x: e.clientX,
                              y: e.clientY,
                              assignmentId: a.assignment_id,
                              label: chipLabel(source, localIndex),
                            });
                          }}
                        >
                          {chipLabel(source, localIndex)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="moral-play-card moral-play-card--solution">
          <p className="moral-play-card-label">Puzzle Solution</p>
          {!showSolution ? (
            <>
              {hasPuzzle &&
              (isFetchingSolution || displayedSolutionSans.length > 0) ? (
                <button
                  type="button"
                  className="moral-play-solution-btn"
                  disabled={isFetchingSolution || displayedSolutionSans.length === 0}
                  onClick={handleShowSolution}
                >
                  Show Solution
                </button>
              ) : null}
              {!isFetchingSolution &&
              hasPuzzle &&
              displayedSolutionSans.length === 0 &&
              solutionError ? (
                <p className="moral-puzzles-muted">{solutionError}</p>
              ) : null}
              {!isFetchingSolution &&
              hasPuzzle &&
              displayedSolutionSans.length === 0 &&
              !solutionError ? (
                <p className="moral-puzzles-muted">No solution moves available for this puzzle.</p>
              ) : null}
            </>
          ) : null}
          {showSolution && displayedSolutionSans.length > 0 ? (
            <p className="moral-play-solution-text">{displayedSolutionSans.join(' ')}</p>
          ) : null}
          {showSolution && displayedSolutionSans.length === 0 && solutionError ? (
            <p className="moral-puzzles-muted">{solutionError}</p>
          ) : null}
          {showSolution &&
          displayedSolutionSans.length === 0 &&
          !solutionError &&
          hasPuzzle ? (
            <p className="moral-puzzles-muted">No solution moves available for this puzzle.</p>
          ) : null}
        </section>
        </div>
      </div>

      <div className="moral-puzzles-zone moral-puzzles-zone--board" aria-label="Board area">
        <ChroniclesPuzzleBoard
          initialFen={boardFen}
          resetKey={boardKey}
          layout="moral-zone"
        />
      </div>

      {canManage && chipMenu ? (
        <div
          className="moral-play-chip-menu"
          style={{ top: chipMenu.y, left: chipMenu.x }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="moral-play-chip-menu-item moral-play-chip-menu-item--danger"
            role="menuitem"
            disabled={busy}
            onClick={() => handleRemove(chipMenu.assignmentId)}
          >
            <FiTrash2 aria-hidden /> Delete {chipMenu.label}
          </button>
        </div>
      ) : null}

      {canManage && picker ? (
        <div className="moral-puzzles-modal" role="dialog" aria-modal="true">
          <div
            className={[
              'moral-puzzles-modal-card moral-puzzles-modal-card--wide',
              picker === 'lichess' ? 'moral-puzzles-modal-card--lichess' : '',
              picker === 'chesscom' ? 'moral-puzzles-modal-card--chesscom' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <header>
              <h2>Add {SOURCE_LABEL[picker]} puzzle</h2>
              <button type="button" className="moral-puzzles-icon-btn" onClick={closePicker}>
                <FiX aria-hidden />
              </button>
            </header>

            <div
              className={[
                'moral-puzzles-modal-body',
                picker === 'lichess' ? 'moral-puzzles-modal-body--lichess' : '',
                picker === 'chesscom' ? 'moral-puzzles-modal-body--chesscom' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {picker === 'chesscom' ? (
                <div className="moral-puzzles-chesscom-toolbar">
                  <button
                    type="button"
                    className="moral-puzzles-btn moral-puzzles-btn--primary"
                    onClick={handleFetchChesscom}
                    disabled={pickerLoading || busy}
                  >
                    <FiRefreshCw aria-hidden /> {pickerLoading ? 'Fetching…' : 'Fetch new'}
                  </button>
                  {chesscomDraft?.title ? (
                    <p className="moral-puzzles-chesscom-title">
                      <strong>{chesscomDraft.title}</strong>
                      {chesscomDraft.id != null ? ` · #${chesscomDraft.id}` : ''}
                    </p>
                  ) : (
                    <p className="moral-puzzles-muted">
                      {pickerLoading ? 'Fetching a new Chess.com puzzle…' : 'Fetch a new puzzle to preview'}
                    </p>
                  )}
                </div>
              ) : null}

              {picker === 'lichess' ? (
                <div className="moral-puzzles-lichess-filters">
                  {(() => {
                    const step = 10;
                    const rawMin = Number(lichessMeta?.rating_min ?? 400);
                    const rawMax = Number(lichessMeta?.rating_max ?? 3000);
                    const boundMin = Math.floor(rawMin / step) * step;
                    const boundMax = Math.max(
                      Math.ceil(rawMax / step) * step,
                      boundMin + step
                    );
                    const span = Math.max(boundMax - boundMin, step);
                    const snap = (value) =>
                      Math.min(
                        boundMax,
                        Math.max(boundMin, Math.round(Number(value) / step) * step)
                      );
                    const currentMin =
                      lichessFilters.ratingMin !== ''
                        ? snap(lichessFilters.ratingMin)
                        : boundMin;
                    const currentMax =
                      lichessFilters.ratingMax !== ''
                        ? snap(lichessFilters.ratingMax)
                        : boundMax;
                    const low = Math.min(currentMin, currentMax);
                    const high = Math.max(currentMin, currentMax);
                    const leftPct = ((low - boundMin) / span) * 100;
                    const rightPct = ((high - boundMin) / span) * 100;

                    return (
                      <div className="moral-puzzles-lichess-filters-row">
                        <label className="moral-puzzles-filter-field">
                          <span>Theme</span>
                          <select
                            value={lichessFilters.theme}
                            onChange={(e) =>
                              setLichessFilters((prev) => ({
                                ...prev,
                                theme: e.target.value,
                              }))
                            }
                            disabled={lichessMetaLoading}
                          >
                            <option value="">All themes</option>
                            {(lichessMeta?.themes || []).map((item) => (
                              <option key={item.value} value={item.value}>
                                {formatTagLabel(item.value)} ({item.count})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="moral-puzzles-filter-field">
                          <span>Opening</span>
                          <select
                            value={lichessFilters.opening}
                            onChange={(e) =>
                              setLichessFilters((prev) => ({
                                ...prev,
                                opening: e.target.value,
                              }))
                            }
                            disabled={lichessMetaLoading}
                          >
                            <option value="">All openings</option>
                            {(lichessMeta?.openings || []).map((item) => (
                              <option key={item.value} value={item.value}>
                                {formatTagLabel(item.value)} ({item.count})
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="moral-puzzles-filter-field moral-puzzles-filter-field--rating">
                          <div className="moral-puzzles-rating-range-head">
                            <span>Rating</span>
                            <strong>
                              {low} – {high}
                            </strong>
                          </div>
                          <div
                            className="moral-puzzles-rating-slider"
                            style={{
                              '--range-left': `${leftPct}%`,
                              '--range-right': `${rightPct}%`,
                            }}
                          >
                            <input
                              type="range"
                              className="moral-puzzles-rating-thumb moral-puzzles-rating-thumb--min"
                              min={boundMin}
                              max={boundMax}
                              step={step}
                              value={low}
                              disabled={lichessMetaLoading || !lichessMeta}
                              aria-label="Minimum rating"
                              onChange={(e) => {
                                const next = snap(e.target.value);
                                setLichessFilters((prev) => {
                                  const maxVal =
                                    prev.ratingMax !== ''
                                      ? snap(prev.ratingMax)
                                      : boundMax;
                                  return {
                                    ...prev,
                                    ratingMin: String(Math.min(next, maxVal)),
                                    ratingMax:
                                      prev.ratingMax !== ''
                                        ? String(snap(prev.ratingMax))
                                        : String(boundMax),
                                  };
                                });
                              }}
                            />
                            <input
                              type="range"
                              className="moral-puzzles-rating-thumb moral-puzzles-rating-thumb--max"
                              min={boundMin}
                              max={boundMax}
                              step={step}
                              value={high}
                              disabled={lichessMetaLoading || !lichessMeta}
                              aria-label="Maximum rating"
                              onChange={(e) => {
                                const next = snap(e.target.value);
                                setLichessFilters((prev) => {
                                  const minVal =
                                    prev.ratingMin !== ''
                                      ? snap(prev.ratingMin)
                                      : boundMin;
                                  return {
                                    ...prev,
                                    ratingMin:
                                      prev.ratingMin !== ''
                                        ? String(snap(prev.ratingMin))
                                        : String(boundMin),
                                    ratingMax: String(Math.max(next, minVal)),
                                  };
                                });
                              }}
                            />
                          </div>
                        </div>
                        <label className="moral-puzzles-filter-field moral-puzzles-filter-field--sort">
                          <span>Sort</span>
                          <select
                            value={lichessFilters.sort}
                            onChange={(e) =>
                              setLichessFilters((prev) => ({
                                ...prev,
                                sort: e.target.value,
                              }))
                            }
                          >
                            {LICHESS_SORT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="moral-puzzles-btn moral-puzzles-btn--primary moral-puzzles-lichess-apply"
                          onClick={searchPicker}
                          disabled={pickerLoading}
                        >
                          Apply
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              <div className="moral-puzzles-modal-split">
                {picker !== 'chesscom' ? (
                <div className="moral-puzzles-modal-left">
                  {picker === 'gm' ? (
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
                      <button
                        type="button"
                        className="moral-puzzles-btn"
                        onClick={searchPicker}
                        disabled={pickerLoading}
                      >
                        Search
                      </button>
                    </div>
                  ) : null}

                  <div className="moral-puzzles-picker-scroll">
                    {pickerLoading ? (
                      <p className="moral-puzzles-muted">Loading unused puzzles…</p>
                    ) : pickerRows.length === 0 ? (
                      <p className="moral-puzzles-muted">No unused puzzles found.</p>
                    ) : (
                      <ul className="moral-puzzles-picker-list">
                        {pickerRows.map((row) => {
                          const selected = String(row.id) === String(pickerSelectedId);
                          const hovered = String(row.id) === String(pickerHoverId);
                          const themeTags = splitSpaceTags(row.themes);
                          return (
                            <li key={row.id}>
                              <button
                                type="button"
                                ref={(node) => {
                                  const key = String(row.id);
                                  if (node) pickerItemRefs.current.set(key, node);
                                  else pickerItemRefs.current.delete(key);
                                }}
                                className={[
                                  'moral-puzzles-picker-item',
                                  selected ? 'is-selected' : '',
                                  hovered ? 'is-hovered' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                disabled={busy || row.is_used}
                                onMouseEnter={() => setPickerHoverId(row.id)}
                                onMouseLeave={() => setPickerHoverId(null)}
                                onFocus={() => setPickerHoverId(row.id)}
                                onBlur={() => setPickerHoverId(null)}
                                onClick={() => setPickerSelectedId(row.id)}
                              >
                                <div className="moral-puzzles-picker-item-head">
                                  <strong>#{row.id}</strong>
                                  {row.rating != null ? (
                                    <span className="moral-puzzles-rating-badge">{row.rating}</span>
                                  ) : null}
                                  {row.title ? <span>{row.title}</span> : null}
                                </div>
                                {picker === 'lichess' && themeTags.length > 0 ? (
                                  <div className="moral-puzzles-tag-row">
                                    {themeTags.slice(0, 4).map((tag) => (
                                      <span key={tag} className="moral-puzzles-tag">
                                        {formatTagLabel(tag)}
                                      </span>
                                    ))}
                                    {themeTags.length > 4 ? (
                                      <span className="moral-puzzles-tag moral-puzzles-tag--more">
                                        +{themeTags.length - 4}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                                <span className="moral-puzzles-fen">{row.fen}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
                ) : null}

              <div
                className={[
                  'moral-puzzles-modal-right',
                  picker === 'lichess' || picker === 'chesscom'
                    ? 'moral-puzzles-modal-right--lichess'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {pickerPreviewFen ? (
                  <p
                    className={[
                      'moral-puzzles-picker-turn',
                      orientationFromFen(pickerPreviewFen) === 'black'
                        ? 'is-black'
                        : 'is-white',
                    ].join(' ')}
                  >
                    {turnLabelFromFen(pickerPreviewFen)}
                  </p>
                ) : (
                  <p className="moral-puzzles-muted moral-puzzles-picker-turn-hint">
                    {picker === 'chesscom'
                      ? 'Fetch a new puzzle to preview'
                      : 'Hover a puzzle to preview'}
                  </p>
                )}

                <div
                  className={[
                    'moral-puzzles-preview-main',
                    picker === 'lichess' || picker === 'chesscom'
                      ? 'moral-puzzles-preview-main--split'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="moral-puzzles-picker-board">
                    {pickerPreviewFen ? (
                      <FenHoverPreview
                        fen={pickerPreviewFen}
                        boardId={`moral-picker-${picker}-${pickerPreviewRow?.id || 'preview'}`}
                        boardSize={PICKER_BOARD_SIZE}
                        orientation={orientationFromFen(pickerPreviewFen)}
                        showBoardNotation
                      />
                    ) : (
                      <div className="moral-puzzles-picker-board-empty">
                        <FenHoverPreview
                          fen={START_FEN}
                          boardId="moral-picker-empty"
                          boardSize={PICKER_BOARD_SIZE}
                          showBoardNotation
                        />
                      </div>
                    )}
                  </div>

                  {picker === 'lichess' && pickerPreviewRow ? (
                    <div className="moral-puzzles-lichess-details">
                      <div className="moral-puzzles-detail-grid">
                        <div>
                          <span className="moral-puzzles-detail-label">Rating</span>
                          <strong>
                            {pickerPreviewRow.rating != null ? pickerPreviewRow.rating : '—'}
                            {pickerPreviewRow.rating_deviation != null
                              ? ` ±${pickerPreviewRow.rating_deviation}`
                              : ''}
                          </strong>
                        </div>
                        <div>
                          <span className="moral-puzzles-detail-label">Popularity</span>
                          <strong>{formatCount(pickerPreviewRow.popularity)}</strong>
                        </div>
                        <div>
                          <span className="moral-puzzles-detail-label">Plays</span>
                          <strong>{formatCount(pickerPreviewRow.nb_plays)}</strong>
                        </div>
                        <div>
                          <span className="moral-puzzles-detail-label">Puzzle ID</span>
                          <strong>#{pickerPreviewRow.id}</strong>
                        </div>
                      </div>

                      {splitSpaceTags(pickerPreviewRow.themes).length > 0 ? (
                        <div className="moral-puzzles-detail-block">
                          <span className="moral-puzzles-detail-label">Themes</span>
                          <div className="moral-puzzles-tag-row">
                            {splitSpaceTags(pickerPreviewRow.themes).map((tag) => (
                              <span key={tag} className="moral-puzzles-tag">
                                {formatTagLabel(tag)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {splitSpaceTags(pickerPreviewRow.opening_tags).length > 0 ? (
                        <div className="moral-puzzles-detail-block">
                          <span className="moral-puzzles-detail-label">Opening</span>
                          <div className="moral-puzzles-tag-row">
                            {splitSpaceTags(pickerPreviewRow.opening_tags).map((tag) => (
                              <span key={tag} className="moral-puzzles-tag moral-puzzles-tag--opening">
                                {formatTagLabel(tag)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {pickerPreviewRow.moves ? (
                        <div className="moral-puzzles-detail-block">
                          <span className="moral-puzzles-detail-label">Solution moves</span>
                          <p className="moral-puzzles-fen">{pickerPreviewRow.moves}</p>
                        </div>
                      ) : null}

                      {pickerPreviewRow.game_url ? (
                        <a
                          className="moral-puzzles-game-link"
                          href={pickerPreviewRow.game_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View on Lichess
                        </a>
                      ) : null}
                    </div>
                  ) : picker === 'chesscom' && chesscomDraft ? (
                    <div className="moral-puzzles-lichess-details">
                      <div className="moral-puzzles-detail-grid">
                        <div>
                          <span className="moral-puzzles-detail-label">Title</span>
                          <strong>{chesscomDraft.title || 'Chess.com puzzle'}</strong>
                        </div>
                        <div>
                          <span className="moral-puzzles-detail-label">Puzzle ID</span>
                          <strong>
                            {chesscomDraft.id != null ? `#${chesscomDraft.id}` : '—'}
                          </strong>
                        </div>
                      </div>
                      {chesscomDraft.fen ? (
                        <div className="moral-puzzles-detail-block">
                          <span className="moral-puzzles-detail-label">FEN</span>
                          <p className="moral-puzzles-fen">{chesscomDraft.fen}</p>
                        </div>
                      ) : null}
                      {chesscomDraft.solution || chesscomDraft.pgn ? (
                        <div className="moral-puzzles-detail-block">
                          <span className="moral-puzzles-detail-label">Solution</span>
                          <p className="moral-puzzles-fen">
                            {solutionTextFromChessCom(chesscomDraft.solution || chesscomDraft.pgn) ||
                              '—'}
                          </p>
                        </div>
                      ) : null}
                      {chesscomDraft.url ? (
                        <a
                          className="moral-puzzles-game-link"
                          href={chesscomDraft.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View on Chess.com
                        </a>
                      ) : null}
                    </div>
                  ) : pickerPreviewFen && picker === 'gm' ? (
                    <p className="moral-puzzles-fen moral-puzzles-picker-preview-fen">
                      {pickerPreviewFen}
                    </p>
                  ) : null}
                </div>
              </div>
              </div>
            </div>

            <footer className="moral-puzzles-modal-footer">
              {picker !== 'chesscom' ? (
                <button
                  type="button"
                  className="moral-puzzles-btn"
                  disabled={busy || pickerLoading || pickerRows.every((row) => row.is_used)}
                  onClick={pickRandomPickerPuzzle}
                >
                  <FiShuffle aria-hidden /> Random
                </button>
              ) : null}
              <button
                type="button"
                className="moral-puzzles-btn moral-puzzles-btn--primary"
                disabled={
                  busy ||
                  !pickerSelectedRow ||
                  Boolean(pickerSelectedRow.is_used) ||
                  (picker === 'chesscom'
                    ? !pickerSelectedRow.fen
                    : pickerSelectedRow.id == null)
                }
                onClick={() => handleAssign(picker, pickerSelectedRow.id)}
              >
                Assign
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LibraryMoralPuzzles;
