import React, { useMemo } from 'react';
import { FaMicrochip } from 'react-icons/fa6';
import { FiLoader } from 'react-icons/fi';
import { formatWhiteCpLabel, formatWhiteCpScore } from '../../utils/stageEvalUtils';

export default function StageEnginePanel({
  moveIndex,
  stage2Move,
  stage3Move,
  stage4Move,
  loading,
  boardHeight,
}) {
  const activeMove = stage3Move || stage2Move;
  const activeStage = stage3Move ? 3 : stage2Move ? 2 : null;

  const evalDisplay = useMemo(() => {
    if (!activeMove) return null;
    const cp = stage3Move ? stage3Move.deep_eval_cp : stage2Move?.our_score_cp;
    if (cp == null) return null;
    return formatWhiteCpScore(cp);
  }, [activeMove, stage2Move, stage3Move]);

  const stage2BestDisplay = useMemo(() => {
    if (!stage2Move || stage2Move.best_score_cp == null) return null;
    return formatWhiteCpLabel(stage2Move.best_score_cp);
  }, [stage2Move]);

  const depthLabel = stage3Move?.engine_depth
    ? `d${stage3Move.engine_depth}`
    : stage2Move?.engine_depth
      ? `d${stage2Move.engine_depth}`
      : loading
        ? '…'
        : '—';

  const panelHeight = boardHeight ? boardHeight + 16 : undefined;

  return (
    <aside className="chess-stage-engine-panel" style={panelHeight ? { minHeight: panelHeight } : undefined}>
      <div className="chess-stage-engine-inner">
        <div className="chess-stage-engine-head">
          <h2>
            <FaMicrochip aria-hidden />
            Stage Engine
          </h2>
          <span>{depthLabel}</span>
        </div>

        <div className="chess-stage-engine-body">
          {loading && !activeMove ? (
            <div className="chess-stage-engine-placeholder">
              <FiLoader className="chess-stage-engine-spinner" aria-hidden />
              <p>Running brilliance pipeline…</p>
            </div>
          ) : activeMove && evalDisplay ? (
            <>
              <div className="chess-stage-engine-score-row">
                <div>
                  <div className="chess-stage-engine-move-meta">
                    {activeMove.san_move} · ply {activeMove.ply_index}
                    {activeStage === 3 ? ' · Stage 3' : ' · Stage 2'}
                  </div>
                  <span className="chess-stage-engine-score">{evalDisplay.scoreText}</span>
                </div>
                <span className={`chess-stage-engine-advantage ${evalDisplay.advantage.className}`}>
                  {evalDisplay.advantage.text}
                </span>
              </div>

              {stage3Move ? (
                <dl className="chess-stage-engine-stats">
                  <div>
                    <dt>Non-obvious</dt>
                    <dd>{stage3Move.non_obvious_score ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Rank d8→d22</dt>
                    <dd>
                      {stage3Move.rank_at_depth8}→{stage3Move.rank_at_depth22}
                    </dd>
                  </div>
                  <div>
                    <dt>Depth gain</dt>
                    <dd>{stage3Move.depth_gain ?? '—'} cp</dd>
                  </div>
                  <div>
                    <dt>Sound at d25</dt>
                    <dd>{stage3Move.is_sound ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
              ) : (
                <dl className="chess-stage-engine-stats">
                  <div>
                    <dt>Best line</dt>
                    <dd>
                      {stage2Move.best_move || '—'}
                      {stage2BestDisplay ? ` (${stage2BestDisplay})` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>CPL</dt>
                    <dd>{stage2Move.cpl_shallow ?? '—'} cp</dd>
                  </div>
                  <div>
                    <dt>Engine rank</dt>
                    <dd>
                      {stage2Move.our_rank_in_top5 != null && stage2Move.our_rank_in_top5 < 99
                        ? `#${stage2Move.our_rank_in_top5}`
                        : 'outside top 5'}
                    </dd>
                  </div>
                </dl>
              )}
            </>
          ) : moveIndex < 0 ? (
            <div className="chess-stage-engine-placeholder chess-stage-engine-placeholder--muted">
              <p>Start the game to see stage analysis</p>
            </div>
          ) : (
            <div className="chess-stage-engine-placeholder chess-stage-engine-placeholder--muted">
              <p>No engine eval for this move</p>
              <span>Stockfish runs only on brilliance cascade candidates (Stages 2–3)</span>
            </div>
          )}
        </div>

        <div className="chess-stage-engine-foot">
          {stage4Move ? (
            <>
              <p>
                Stage 4 · score <strong>{stage4Move.brilliance_score}</strong>
                <span
                  className={
                    stage4Move.classification === 'BRILLIANT'
                      ? 'chess-stage-engine-foot--brilliant'
                      : 'chess-stage-engine-foot--class'
                  }
                >
                  · {stage4Move.classification}
                </span>
              </p>
              <p className="chess-stage-engine-foot-archetype">
                {(stage4Move.archetype || 'masterstroke').replace(/_/g, ' ')}
              </p>
            </>
          ) : stage3Move ? (
            <p>
              Stage 3 deep eval · white POV
              {stage3Move.is_rising_curve ? (
                <span className="chess-stage-engine-foot--rising"> · rising depth curve</span>
              ) : null}
              {stage3Move.classification_if_unsound ? (
                <span className="chess-stage-engine-foot--warn"> · {stage3Move.classification_if_unsound}</span>
              ) : stage3Move.is_sound ? (
                <span className="chess-stage-engine-foot--pass"> · sound at d25</span>
              ) : null}
            </p>
          ) : stage2Move ? (
            <p>
              Stage 2 shallow eval · white POV
              {stage2Move.proceed_to_stage3 ? (
                <span className="chess-stage-engine-foot--pass"> · proceeds to Stage 3</span>
              ) : stage2Move.gate_fail_reason ? (
                <span className="chess-stage-engine-foot--warn"> · {stage2Move.gate_fail_reason}</span>
              ) : null}
            </p>
          ) : (
            <p>Stages 0–1 use heuristics · Stages 2–4 use Stockfish</p>
          )}
        </div>
      </div>
    </aside>
  );
}
