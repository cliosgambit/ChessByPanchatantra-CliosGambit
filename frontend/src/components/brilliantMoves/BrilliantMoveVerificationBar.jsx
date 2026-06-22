import React, { useCallback, useEffect, useState } from 'react';
import { FiCheck, FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi';
import FenHoverPreview from '../userProfile/FenHoverPreview';
import {
  fetchBrilliantPuzzleByMoveFromDb,
  saveBrilliantPuzzle,
  unsaveBrilliantPuzzle,
  verifyBrilliantPuzzle,
} from '../../services/chessComDbService';
import './BrilliantMoveVerificationBar.css';

function VerifyStep({ label, question, onYes, onNo, yesActive, noActive, disabled, meta }) {
  return (
    <div className="brilliant-move-verify-step">
      <div className="brilliant-move-verify-step-head">
        <span className="brilliant-move-verify-step-label">{label}</span>
        <p className="brilliant-move-verify-step-question">{question}</p>
      </div>
      <div className="brilliant-move-verify-actions">
        <button
          type="button"
          className={`brilliant-move-verify-btn brilliant-move-verify-btn--approve${
            yesActive ? ' brilliant-move-verify-btn--active' : ''
          }`}
          onClick={onYes}
          disabled={disabled}
          aria-label="Yes"
          title="Yes"
        >
          <FiCheck />
        </button>
        <button
          type="button"
          className={`brilliant-move-verify-btn brilliant-move-verify-btn--reject${
            noActive ? ' brilliant-move-verify-btn--active' : ''
          }`}
          onClick={onNo}
          disabled={disabled}
          aria-label="No"
          title="No"
        >
          <FiX />
        </button>
      </div>
      {meta && <p className="brilliant-move-verify-meta">{meta}</p>}
    </div>
  );
}

function Step1ResultButton({ status, onClick }) {
  const label = status === 'approved' ? 'Brilliant move confirmed' : 'Not a brilliant move';

  return (
    <button
      type="button"
      className={`brilliant-move-verify-step-result-btn${
        status === 'approved'
          ? ' brilliant-move-verify-step-result-btn--approved'
          : ' brilliant-move-verify-step-result-btn--rejected'
      }`}
      onClick={onClick}
      title="Click to change your answer"
    >
      <span>{label}</span>
      <span className="brilliant-move-verify-step-result-hint">Click to change</span>
    </button>
  );
}

function ReviewSummary({ status, isSaved, puzzleAddDeclined, editExpanded, onToggleEdit }) {
  return (
    <div className="brilliant-move-verify-summary">
      <div className="brilliant-move-verify-summary-text">
        <p
          className={`brilliant-move-verify-meta${
            status === 'approved'
              ? ' brilliant-move-verify-meta--approved'
              : ' brilliant-move-verify-meta--rejected'
          }`}
        >
          {status === 'approved' ? 'Brilliant move confirmed' : 'Not a brilliant move'}
        </p>
        {isSaved && (
          <p className="brilliant-move-verify-meta brilliant-move-verify-meta--saved">Saved to Puzzles</p>
        )}
        {!isSaved && puzzleAddDeclined && (
          <p className="brilliant-move-verify-meta">Not added to Puzzles</p>
        )}
      </div>
      <button
        type="button"
        className="brilliant-move-verify-edit-toggle"
        onClick={onToggleEdit}
        aria-expanded={editExpanded}
      >
        <span>{editExpanded ? 'Hide' : 'Edit review'}</span>
        {editExpanded ? <FiChevronUp /> : <FiChevronDown />}
      </button>
    </div>
  );
}

function PuzzlePreview({ move, puzzleState, puzzleFen, orientation, previousMove }) {
  if (!puzzleFen) return null;

  return (
    <div className="brilliant-move-save-panel">
      <header className="brilliant-move-save-panel-header">Puzzle preview</header>
      <p className="brilliant-move-save-panel-copy">
        Position before <strong>{move.sanMove}</strong>
        {puzzleState?.previousMoveSan ? (
          <>
            {' '}
            (previous move: <strong>{puzzleState.previousMoveSan}</strong>)
          </>
        ) : null}
      </p>
      <div className="brilliant-move-save-panel-board">
        <FenHoverPreview
          fen={puzzleFen}
          lastMove={previousMove}
          orientation={orientation}
          boardId="brilliant-move-save-preview"
          boardSize={168}
          showBoardNotation
        />
      </div>
    </div>
  );
}

function BrilliantMoveVerificationBar({ move }) {
  const [puzzleState, setPuzzleState] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [puzzleAddDeclined, setPuzzleAddDeclined] = useState(false);
  const [editExpanded, setEditExpanded] = useState(false);
  const [step1Editing, setStep1Editing] = useState(false);

  const moveId = move?.id;

  const loadStatus = useCallback(async () => {
    if (!moveId) return;
    setLoadingStatus(true);
    setError(null);
    try {
      const data = await fetchBrilliantPuzzleByMoveFromDb(moveId);
      setPuzzleState(data.puzzle || null);
      setPuzzleAddDeclined(false);
    } catch (err) {
      setError(err.message || 'Failed to load verification status.');
    } finally {
      setLoadingStatus(false);
    }
  }, [moveId]);

  useEffect(() => {
    setEditExpanded(false);
    setStep1Editing(false);
    loadStatus();
  }, [loadStatus, moveId]);

  const handleBrilliantYes = async () => {
    if (!moveId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const data = await verifyBrilliantPuzzle(moveId, 'approved');
      setPuzzleState(data.puzzle);
      setPuzzleAddDeclined(false);
      setStep1Editing(false);
    } catch (err) {
      setError(err.message || 'Failed to confirm brilliant move.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBrilliantNo = async () => {
    if (!moveId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const data = await verifyBrilliantPuzzle(moveId, 'rejected');
      setPuzzleState(data.puzzle);
      setPuzzleAddDeclined(false);
      setStep1Editing(false);
    } catch (err) {
      setError(err.message || 'Failed to mark as not brilliant.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPuzzleYes = async () => {
    if (!moveId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const data = await saveBrilliantPuzzle(moveId);
      setPuzzleState(data.puzzle);
      setPuzzleAddDeclined(false);
      setEditExpanded(false);
    } catch (err) {
      setError(err.message || 'Failed to save puzzle.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPuzzleNo = async () => {
    if (actionLoading) return;
    setError(null);

    if (puzzleState?.savedAt) {
      if (!moveId) return;
      setActionLoading(true);
      try {
        const data = await unsaveBrilliantPuzzle(moveId);
        setPuzzleState(data.puzzle);
        setPuzzleAddDeclined(true);
      } catch (err) {
        setError(err.message || 'Failed to remove puzzle.');
      } finally {
        setActionLoading(false);
      }
      return;
    }

    setPuzzleAddDeclined(true);
    setEditExpanded(false);
  };

  if (!move) return null;

  const status = puzzleState?.verificationStatus || 'pending';
  const isSaved = Boolean(puzzleState?.savedAt);
  const brillianceReviewComplete = status === 'approved' || status === 'rejected';
  const puzzleDecisionComplete = isSaved || puzzleAddDeclined;
  const reviewFinished = brillianceReviewComplete && puzzleDecisionComplete;

  const showSummaryCollapsed = !loadingStatus && reviewFinished && !editExpanded;
  const showStep1Form =
    !loadingStatus && (!brillianceReviewComplete || editExpanded || step1Editing);
  const showStep2 =
    !loadingStatus && brillianceReviewComplete && (!puzzleDecisionComplete || editExpanded);
  const showStep1ResultButton =
    showStep2 && !editExpanded && brillianceReviewComplete && !step1Editing;

  const puzzleFen = puzzleState?.puzzleFen || move.fenBeforeMove;
  const orientation = move.turn === 'white' ? 'white' : 'black';
  const previousMove =
    puzzleState?.previousMoveFrom && puzzleState?.previousMoveTo
      ? { from: puzzleState.previousMoveFrom, to: puzzleState.previousMoveTo }
      : null;

  return (
    <div className="brilliant-move-verify-dock" aria-label="Brilliant move verification">
      {loadingStatus && <p className="brilliant-move-verify-meta">Loading status…</p>}

      {showSummaryCollapsed && (
        <ReviewSummary
          status={status}
          isSaved={isSaved}
          puzzleAddDeclined={puzzleAddDeclined}
          editExpanded={false}
          onToggleEdit={() => setEditExpanded(true)}
        />
      )}

      {editExpanded && reviewFinished && (
        <ReviewSummary
          status={status}
          isSaved={isSaved}
          puzzleAddDeclined={puzzleAddDeclined}
          editExpanded
          onToggleEdit={() => setEditExpanded(false)}
        />
      )}

      {showStep1Form && (
        <VerifyStep
          label="Step 1"
          question="Is this a brilliant move?"
          onYes={handleBrilliantYes}
          onNo={handleBrilliantNo}
          yesActive={status === 'approved'}
          noActive={status === 'rejected'}
          disabled={actionLoading}
          meta={
            brillianceReviewComplete
              ? 'Change your answer with ✓ or ✗'
              : 'Choose ✓ for yes or ✗ for no'
          }
        />
      )}

      {showStep2 && (
        <>
          {showStep1ResultButton && (
            <div className="brilliant-move-verify-step brilliant-move-verify-step--done">
              <Step1ResultButton status={status} onClick={() => setStep1Editing(true)} />
            </div>
          )}

          <VerifyStep
            label="Step 2"
            question="Add this to Puzzles?"
            onYes={handleAddPuzzleYes}
            onNo={handleAddPuzzleNo}
            yesActive={isSaved}
            noActive={puzzleAddDeclined && !isSaved}
            disabled={actionLoading}
            meta="You can save it as a puzzle even if it is not brilliant"
          />

          <PuzzlePreview
            move={move}
            puzzleState={puzzleState}
            puzzleFen={puzzleFen}
            orientation={orientation}
            previousMove={previousMove}
          />
        </>
      )}

      {error && <p className="brilliant-move-verify-error">{error}</p>}
    </div>
  );
}

export default BrilliantMoveVerificationBar;
