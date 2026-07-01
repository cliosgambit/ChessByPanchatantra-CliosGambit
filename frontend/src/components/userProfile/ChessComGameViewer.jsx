import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiExternalLink,
  FiVolume2,
  FiVolumeX,
} from 'react-icons/fi';
import EvaluationBar from '../gameAnalysis/EvaluationBar';
import BrillianceStagesPanel from '../gameAnalysis/BrillianceStagesPanel';
import StageEnginePanel from '../gameAnalysis/StageEnginePanel';
import MoveClassIcon from '../gameAnalysis/MoveClassIcon';
import { useBrillianceStages } from '../../hooks/useBrillianceStages';
import { useLichessBrillianceStages } from '../../hooks/useLichessBrillianceStages';
import { getStageMoveBadge, whiteCpToEvalDisplay } from '../../utils/stageEvalUtils';
import { sanitizeChessComPgn } from '../../utils/chessComPgnUtils';
import {
  isChessSoundEnabled,
  playSoundForHistoryIndex,
  preloadChessSounds,
  setChessSoundEnabled,
} from '../../utils/chessSound';
import ChessComBoardSquare from './ChessComBoardSquare';
import './ChessComGamePage.css';

const BOARD_NOTATION_STYLE = {
  lineHeight: 1.15,
  fontWeight: 700,
  opacity: 0.95,
};

function resultClassName(resultType) {
  if (resultType === 'win') return 'chess-result-win';
  if (resultType === 'loss') return 'chess-result-loss';
  if (resultType === 'draw') return 'chess-result-draw';
  return 'chess-result-neutral';
}

function PlayerBar({ username, rating, color, isSelf, position }) {
  return (
    <div
      className={`chess-game-player-bar chess-game-player-bar--${position}${
        isSelf ? ' chess-game-player-bar--self' : ''
      }`}
    >
      <span className={`chess-game-player-bar-piece chess-game-player-bar-piece--${color}`}>
        {color === 'white' ? 'W' : 'B'}
      </span>
      <span className="chess-game-player-bar-name">{username}</span>
      <span className="chess-game-player-bar-rating">{rating ?? '—'}</span>
      {isSelf && <span className="chess-game-player-bar-you">You</span>}
    </div>
  );
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function stageByPly(stageData) {
  const map = new Map();
  for (const m of stageData?.moves || []) {
    map.set(m.ply_index, m);
  }
  return map;
}

function ChessComGameViewer({ game, profileUsername, lichessGameId = null }) {
  const [moveIndex, setMoveIndex] = useState(-1);
  const [boardWidth, setBoardWidth] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(isChessSoundEnabled);
  const moveListRef = useRef(null);
  const boardInnerRef = useRef(null);
  const prevMoveIndexRef = useRef(-1);
  const skipSoundRef = useRef(true);

  const history = useMemo(() => {
    if (game?.moveHistory?.length) return game.moveHistory;
    if (!game?.pgn) return [];
    const chess = new Chess();
    try {
      chess.loadPgn(sanitizeChessComPgn(game.pgn));
      return chess.history({ verbose: true });
    } catch (err) {
      console.error('Failed to load PGN', err);
      return [];
    }
  }, [game?.moveHistory, game?.pgn]);

  const chessComBrilliance = useBrillianceStages(game, profileUsername);
  const lichessBrilliance = useLichessBrillianceStages(lichessGameId);
  const brilliance = lichessGameId ? lichessBrilliance : chessComBrilliance;

  const stage0ByPly = useMemo(() => stageByPly(brilliance.stage0), [brilliance.stage0]);
  const stage4ByPly = useMemo(() => stageByPly(brilliance.stage4), [brilliance.stage4]);

  const stage2Move = useMemo(() => {
    if (moveIndex < 0 || !brilliance.stage2?.moves?.length) return null;
    return brilliance.stage2.moves.find((m) => m.ply_index === moveIndex) || null;
  }, [brilliance.stage2, moveIndex]);

  const stage3Move = useMemo(() => {
    if (moveIndex < 0 || !brilliance.stage3?.moves?.length) return null;
    return brilliance.stage3.moves.find((m) => m.ply_index === moveIndex) || null;
  }, [brilliance.stage3, moveIndex]);

  const stage4Move = useMemo(() => {
    if (moveIndex < 0 || !brilliance.stage4?.moves?.length) return null;
    return brilliance.stage4.moves.find((m) => m.ply_index === moveIndex) || null;
  }, [brilliance.stage4, moveIndex]);

  const stageEvalCp = stage3Move?.deep_eval_cp ?? stage2Move?.our_score_cp ?? null;
  const { percent: evalPercent, display: displayScore } = useMemo(
    () => whiteCpToEvalDisplay(stageEvalCp),
    [stageEvalCp]
  );
  const showEvalBar = stageEvalCp != null;

  const fen = useMemo(() => {
    if (moveIndex < 0) return new Chess().fen();
    const stored = game?.moveHistory?.[moveIndex];
    if (stored?.fen_after || stored?.after) return stored.fen_after || stored.after;
    const chess = new Chess();
    history.slice(0, moveIndex + 1).forEach((move) => {
      chess.move(move.san);
    });
    return chess.fen();
  }, [history, moveIndex, game?.moveHistory]);

  const currentMoveDisplay = history[moveIndex];
  const boardOrientation = game?.isWhite ? 'white' : 'black';

  const renderBoardSquare = useCallback(
    (props) => <ChessComBoardSquare {...props} boardOrientation={boardOrientation} />,
    [boardOrientation]
  );

  const customNotationStyle = useMemo(
    () => ({
      ...BOARD_NOTATION_STYLE,
      fontSize: boardWidth > 0 ? Math.max(11, Math.round(boardWidth / 42)) : 12,
    }),
    [boardWidth]
  );

  const lastMoveSquareStyles = useMemo(() => {
    const move = currentMoveDisplay;
    if (!move) return {};
    return {
      [move.from]: { background: 'rgba(235, 236, 59, 0.65)' },
      [move.to]: { background: 'rgba(235, 236, 59, 0.78)' },
    };
  }, [currentMoveDisplay]);

  const topPlayer = game.isWhite
    ? { username: game.black, rating: game.blackRating, color: 'black', isSelf: false }
    : { username: game.white, rating: game.whiteRating, color: 'white', isSelf: false };

  const bottomPlayer = game.isWhite
    ? { username: game.white, rating: game.whiteRating, color: 'white', isSelf: true }
    : { username: game.black, rating: game.blackRating, color: 'black', isSelf: true };

  const goToMove = useCallback(
    (index) => {
      if (index >= -1 && index < history.length) setMoveIndex(index);
    },
    [history.length]
  );

  useEffect(() => {
    setMoveIndex(-1);
    skipSoundRef.current = true;
    prevMoveIndexRef.current = -1;
  }, [game?.uuid, game?.gameUrl]);

  useEffect(() => {
    preloadChessSounds();
  }, []);

  useEffect(() => {
    if (skipSoundRef.current) {
      skipSoundRef.current = false;
      prevMoveIndexRef.current = moveIndex;
      return;
    }

    const prev = prevMoveIndexRef.current;
    prevMoveIndexRef.current = moveIndex;

    if (!soundEnabled || moveIndex < 0 || moveIndex <= prev) return;
    playSoundForHistoryIndex(history, moveIndex);
  }, [moveIndex, history, soundEnabled]);

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current;
      setChessSoundEnabled(next);
      return next;
    });
  };

  useEffect(() => {
    const container = boardInnerRef.current;
    if (!container) return undefined;

    const updateBoardWidth = () => {
      const width = container.clientWidth;
      if (width > 0) {
        setBoardWidth(Math.max(280, Math.floor(width)));
      }
    };

    updateBoardWidth();

    const observer = new ResizeObserver(updateBoardWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [showEvalBar]);

  useEffect(() => {
    const el = document.getElementById(`chess-move-${moveIndex}`);
    if (el && moveListRef.current) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [moveIndex]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setMoveIndex((index) => (index > -1 ? index - 1 : index));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setMoveIndex((index) => (index < history.length - 1 ? index + 1 : index));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history.length]);

  if (!game) return null;

  const movePairs = [];
  for (let i = 0; i < history.length; i += 2) {
    const badge = getStageMoveBadge(stage0ByPly.get(i), stage4ByPly.get(i));
    const blackBadge =
      i + 1 < history.length
        ? getStageMoveBadge(stage0ByPly.get(i + 1), stage4ByPly.get(i + 1))
        : null;
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      whiteIndex: i,
      whiteSan: history[i]?.san,
      whiteClass: badge,
      blackIndex: i + 1 < history.length ? i + 1 : null,
      blackSan: history[i + 1]?.san || null,
      blackClass: blackBadge,
    });
  }

  const playerBarHeight = 44;
  const boardStackHeight = (boardWidth || 400) + playerBarHeight * 2;

  return (
    <div className="chess-game-viewer-layout">
      <div className="chess-game-viewer-top">
        <aside className="chess-game-moves-column">
          <div className="chess-game-sidebar-header">
            <div>
              <h2 className="chess-game-sidebar-title">Game Review</h2>
              <p className="chess-game-sidebar-subtitle">
                {game.timeControl}
                {game.rated ? ' · Rated' : ''} · {game.moves ?? history.length} moves
              </p>
            </div>
            <span className={`chess-game-sidebar-result ${resultClassName(game.resultType)}`}>
              {game.resultNotation}
            </span>
          </div>

          <div className="chess-game-accuracy-panel">
            <div className="chess-game-accuracy-item">
              <span className="chess-game-accuracy-piece chess-game-accuracy-piece--white">W</span>
              <div className="chess-game-accuracy-info">
                <span className="chess-game-accuracy-name">{game.white}</span>
                <span className="chess-game-accuracy-value">
                  {game.whiteAccuracy != null ? `${game.whiteAccuracy}%` : '—'}
                </span>
              </div>
            </div>
            <div className="chess-game-accuracy-item">
              <span className="chess-game-accuracy-piece chess-game-accuracy-piece--black">B</span>
              <div className="chess-game-accuracy-info">
                <span className="chess-game-accuracy-name">{game.black}</span>
                <span className="chess-game-accuracy-value">
                  {game.blackAccuracy != null ? `${game.blackAccuracy}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="chess-game-moves-panel">
            <div className="chess-game-moves-panel-head">
              <span>Moves</span>
              {profileUsername ? (
                <span className="chess-game-moves-viewing">Viewing as {profileUsername}</span>
              ) : lichessGameId ? (
                <span className="chess-game-moves-viewing">Custom PGN test</span>
              ) : null}
            </div>
            <div ref={moveListRef} className="chess-game-moves-scroll">
              {!history.length ? (
                <p className="chess-game-moves-empty">No moves available.</p>
              ) : (
                movePairs.map((pair) => (
                  <div key={pair.number} className="chess-game-move-line">
                    <span className="chess-game-move-num">{pair.number}.</span>
                    <button
                      type="button"
                      id={`chess-move-${pair.whiteIndex}`}
                      className={`chess-game-move-btn${
                        pair.whiteIndex === moveIndex ? ' chess-game-move-btn--active' : ''
                      }${stage0ByPly.get(pair.whiteIndex)?.is_sacrifice_candidate ? ' chess-game-move-btn--sac' : ''}`}
                      onClick={() => goToMove(pair.whiteIndex)}
                    >
                      {pair.whiteClass ? <MoveClassIcon moveClass={pair.whiteClass} /> : null}
                      {pair.whiteSan}
                    </button>
                    <button
                      type="button"
                      id={pair.blackIndex != null ? `chess-move-${pair.blackIndex}` : undefined}
                      className={`chess-game-move-btn${
                        pair.blackIndex === moveIndex ? ' chess-game-move-btn--active' : ''
                      }${pair.blackIndex == null ? ' chess-game-move-btn--empty' : ''}${
                        pair.blackIndex != null && stage0ByPly.get(pair.blackIndex)?.is_sacrifice_candidate
                          ? ' chess-game-move-btn--sac'
                          : ''
                      }`}
                      onClick={() => pair.blackIndex != null && goToMove(pair.blackIndex)}
                      disabled={pair.blackIndex == null}
                    >
                      {pair.blackClass ? <MoveClassIcon moveClass={pair.blackClass} /> : null}
                      {pair.blackSan || ''}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {game.gameUrl && (
            <a
              href={game.gameUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="chess-game-open-link"
            >
              <FiExternalLink />
              Open on Chess.com
            </a>
          )}
        </aside>

        <div className="chess-game-board-column">
          <div className={`chess-game-board-stack${showEvalBar ? '' : ' chess-game-board-stack--no-eval'}`}>
            {showEvalBar && (
              <EvaluationBar
                percent={evalPercent}
                display={displayScore}
                orientation={boardOrientation}
                barHeight={boardStackHeight}
              />
            )}

            <div className="chess-game-board-inner" ref={boardInnerRef}>
              <PlayerBar {...topPlayer} position="top" />

              <div className="chess-game-board-frame">
                {boardWidth > 0 ? (
                  <Chessboard
                    id="chess-game-main-board"
                    position={fen}
                    boardOrientation={boardOrientation}
                    boardWidth={boardWidth}
                    arePiecesDraggable={false}
                    showBoardNotation
                    customSquare={renderBoardSquare}
                    customNotationStyle={customNotationStyle}
                    customDarkSquareStyle={{ backgroundColor: '#779556' }}
                    customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                    customSquareStyles={lastMoveSquareStyles}
                    animationDuration={180}
                  />
                ) : null}
              </div>

              <PlayerBar {...bottomPlayer} position="bottom" />
            </div>
          </div>

          <div className="chess-game-controls">
            <button
              type="button"
              className={`chess-game-control-btn chess-game-sound-btn${
                soundEnabled ? '' : ' chess-game-sound-btn--muted'
              }`}
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Mute move sounds' : 'Enable move sounds'}
              aria-pressed={soundEnabled}
              title={soundEnabled ? 'Sound on' : 'Sound off'}
            >
              {soundEnabled ? <FiVolume2 /> : <FiVolumeX />}
            </button>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(-1)}
              disabled={moveIndex < 0}
              aria-label="Go to start"
            >
              <FiChevronsLeft />
            </button>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(moveIndex - 1)}
              disabled={moveIndex < 0}
              aria-label="Previous move"
            >
              <FiChevronLeft />
            </button>
            <span className="chess-game-control-status">
              {moveIndex < 0 ? 'Start' : `Move ${moveIndex + 1} of ${history.length}`}
              {brilliance.loading ? ' · Brilliance running…' : ''}
            </span>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(moveIndex + 1)}
              disabled={moveIndex >= history.length - 1}
              aria-label="Next move"
            >
              <FiChevronRight />
            </button>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(history.length - 1)}
              disabled={moveIndex >= history.length - 1 || !history.length}
              aria-label="Go to end"
            >
              <FiChevronsRight />
            </button>
          </div>
        </div>

        <StageEnginePanel
          moveIndex={moveIndex}
          stage2Move={stage2Move}
          stage3Move={stage3Move}
          stage4Move={stage4Move}
          loading={brilliance.loading}
          boardHeight={boardStackHeight}
        />
      </div>

      <BrillianceStagesPanel
        history={history}
        moveIndex={moveIndex}
        onSelectMove={(plyIndex) => goToMove(plyIndex)}
        stage0={brilliance.stage0}
        stage1={brilliance.stage1}
        stage2={brilliance.stage2}
        stage3={brilliance.stage3}
        stage4={brilliance.stage4}
        loading={brilliance.loading}
        error={brilliance.error}
        stageFilter={brilliance.stageFilter}
        setStageFilter={brilliance.setStageFilter}
        onRerun={brilliance.rerun}
      />
    </div>
  );
}

export default ChessComGameViewer;
