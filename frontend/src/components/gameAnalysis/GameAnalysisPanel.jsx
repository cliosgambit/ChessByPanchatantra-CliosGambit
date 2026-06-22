import React, { useMemo } from 'react';
import { FaMicrochip } from 'react-icons/fa6';
import { FiLoader } from 'react-icons/fi';
import EvaluationGraph from './EvaluationGraph';
import MoveClassIcon from './MoveClassIcon';
import { buildBestLinesForNavIndex } from '../../utils/playedMoveClassification';

export default function GameAnalysisPanel({
  analysis,
  navIndex,
  timeline,
  history,
  currentMove,
  playedMoveEval,
  legalMovesCount,
  analysisProgress,
  isAnalyzing,
  boardHeight,
}) {
  const currentAnalysis = analysis[navIndex];
  const turn = timeline[navIndex]?.turn || 'w';

  const { scoreText, advantage, lines } = useMemo(() => {
    if (!currentAnalysis) {
      return {
        scoreText: '+0.00',
        advantage: { text: 'Equal', className: 'chess-analysis-advantage--neutral' },
        lines: [],
      };
    }

    const { score, lines: analysisLines, winProbability } = currentAnalysis;

    let scoreTextLocal = '+0.00';
    let advantage = { text: 'Equal', className: 'chess-analysis-advantage--neutral' };

    if (score && (score.type === 'cp' || score.type === 'mate') && Number.isFinite(score.value)) {
      let v = score.type === 'cp' ? score.value / 100 : score.value;
      if (turn === 'b') v = -v;

      if (score.type === 'mate') {
        scoreTextLocal = `M${Math.abs(v)}`;
        if (v > 0) {
          advantage = { text: 'Winning', className: 'chess-analysis-advantage--win' };
        } else if (v < 0) {
          advantage = { text: 'Losing', className: 'chess-analysis-advantage--loss' };
        }
      } else {
        scoreTextLocal = `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
        const whiteWinPctRaw =
          typeof winProbability?.white === 'number' ? winProbability.white : 50 + (v / 4) * 40;
        const whiteWinPct = Math.max(0, Math.min(100, whiteWinPctRaw));
        const blackWinPct = 100 - whiteWinPct;
        advantage = {
          text: `W ${whiteWinPct.toFixed(1)}% | B ${blackWinPct.toFixed(1)}%`,
          className: v >= 0 ? 'chess-analysis-advantage--win' : 'chess-analysis-advantage--loss',
        };
      }
    }

    return { scoreText: scoreTextLocal, advantage, lines: analysisLines || [] };
  }, [currentAnalysis, turn]);

  const linesWithPlayedStanding = useMemo(
    () => buildBestLinesForNavIndex(analysis, timeline, history, navIndex),
    [analysis, timeline, history, navIndex]
  );

  const playedStanding = linesWithPlayedStanding.find((line) => line.isPlayed)?.rank ?? null;

  const finalClassification = useMemo(() => {
    if (navIndex === 0) return null;
    return linesWithPlayedStanding.find((line) => line.isPlayed)?.moveClass || null;
  }, [navIndex, linesWithPlayedStanding]);

  const panelHeight = boardHeight ? boardHeight + 112 : undefined;

  return (
    <aside className="chess-analysis-panel" style={panelHeight ? { minHeight: panelHeight } : undefined}>
      <div className="chess-analysis-panel-inner">
        <div className="chess-analysis-panel-head">
          <h2>
            <FaMicrochip aria-hidden />
            Stockfish 18
          </h2>
          <span>{analysisProgress}%</span>
        </div>

        <div className="chess-analysis-panel-body">
          <div className="chess-analysis-score-row">
            <div className="chess-analysis-score-main">
              <span className="chess-analysis-score-value">{scoreText}</span>
              {finalClassification && (
                <span className="chess-analysis-move-class">
                  <MoveClassIcon moveClass={finalClassification} />
                  <span>{finalClassification}</span>
                </span>
              )}
            </div>
            <span className={`chess-analysis-advantage ${advantage.className}`}>{advantage.text}</span>
          </div>

          <div className="chess-analysis-lines-panel">
            <h3>Best Lines</h3>
            <p className="chess-analysis-lines-meta">
              {navIndex > 0 ? (
                <>
                  Played standing:{' '}
                  <strong>{playedStanding ? `#${playedStanding}` : 'N/A'}</strong> of{' '}
                  <strong>{legalMovesCount ?? 0}</strong> legal moves
                </>
              ) : (
                'Lines appear after the first move'
              )}
            </p>

            <div className="chess-analysis-lines-scroll">
              {navIndex > 0 ? (
                linesWithPlayedStanding.length > 0 ? (
                  linesWithPlayedStanding.map((line, i) => (
                    <div
                      key={`${line.move}-${i}`}
                      className={`chess-analysis-line${line.isPlayed ? ' chess-analysis-line--played' : ''}`}
                    >
                      <MoveClassIcon moveClass={line.moveClass} />
                      <span className="chess-analysis-line-score">{line.formattedScore}</span>
                      <span className="chess-analysis-line-sep">:</span>
                      <span className="chess-analysis-line-pv">
                        {line.pv}
                        {line.isPlayed ? ` (played #${line.rank})` : ` (#${line.rank})`}
                      </span>
                      <span className="chess-analysis-line-sep">|</span>
                      <span className="chess-analysis-line-first">
                        {line.firstMoveFormattedScore || 'N/A'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="chess-analysis-loading">
                    <FiLoader className="chess-analysis-spinner" aria-hidden />
                    <p>{isAnalyzing ? 'Calculating lines...' : 'Waiting for engine...'}</p>
                  </div>
                )
              ) : (
                <div className="chess-analysis-placeholder">
                  Start the game to see analysis
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="chess-analysis-graph-wrap">
          <EvaluationGraph analysis={analysis} timeline={timeline} navIndex={navIndex} />
        </div>
      </div>
    </aside>
  );
}
