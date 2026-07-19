import React from 'react';
import CustomGamePage from './test/CustomGamePage';
import './TestPage.css';
import './AnalyzeCustomGame.css';

/**
 * Upload a custom PGN and run the same brilliance stage cascade used for game review.
 * Working analysis rows are temporary (ephemeral) — not kept in All Games / brilliant-move lists.
 */
export default function AnalyzeCustomGame() {
  return (
    <div className="analyze-custom-page">
      <CustomGamePage
        boardId="AnalyzeCustomBoard"
        inputSource="custom_analyze"
        hideBrilliancePanel
        ephemeral
      />
    </div>
  );
}
