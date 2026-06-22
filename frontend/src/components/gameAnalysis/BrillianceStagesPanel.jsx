import React, { useMemo } from 'react';
import TestMoveStageExplanation from './TestMoveStageExplanation';
import {
  buildMoveListLabels,
  stage0Summary,
  stage1Summary,
  stage2Summary,
  stage3Summary,
  stage4Summary,
} from '../../utils/brillianceStageSummaries';
import './BrillianceStages.css';

function stageByPly(stageData) {
  const map = new Map();
  for (const m of stageData?.moves || []) {
    map.set(m.ply_index, m);
  }
  return map;
}

export default function BrillianceStagesPanel({
  history,
  moveIndex,
  onSelectMove,
  stage0,
  stage1,
  stage2,
  stage3,
  stage4,
  loading,
  error,
  stageFilter,
  setStageFilter,
  onRerun,
}) {
  const navIndex = moveIndex + 1;
  const moveListLabels = useMemo(() => buildMoveListLabels(history), [history]);

  const stage0ByPly = useMemo(() => stageByPly(stage0), [stage0]);
  const stage1ByPly = useMemo(() => stageByPly(stage1), [stage1]);
  const stage2ByPly = useMemo(() => stageByPly(stage2), [stage2]);
  const stage3ByPly = useMemo(() => stageByPly(stage3), [stage3]);
  const stage4ByPly = useMemo(() => stageByPly(stage4), [stage4]);

  const tableMoveRows = useMemo(
    () => moveListLabels.map((label, plyIndex) => ({ label, plyIndex })),
    [moveListLabels]
  );

  const visibleTableRows = useMemo(() => {
    if (stageFilter === 'stage1') {
      return tableMoveRows.filter(({ plyIndex }) => stage0ByPly.get(plyIndex)?.proceed_to_stage1);
    }
    if (stageFilter === 'stage4') {
      return tableMoveRows.filter(({ plyIndex }) => stage3ByPly.get(plyIndex)?.proceed_to_stage4);
    }
    return tableMoveRows;
  }, [tableMoveRows, stageFilter, stage0ByPly, stage3ByPly]);

  const stage1EligibleCount = useMemo(
    () => tableMoveRows.filter(({ plyIndex }) => stage0ByPly.get(plyIndex)?.proceed_to_stage1).length,
    [tableMoveRows, stage0ByPly]
  );

  const stage4EligibleCount = useMemo(
    () => tableMoveRows.filter(({ plyIndex }) => stage3ByPly.get(plyIndex)?.proceed_to_stage4).length,
    [tableMoveRows, stage3ByPly]
  );

  const selectedMoveLabel = navIndex > 0 ? moveListLabels[navIndex - 1] : null;
  const selectedS0Move = navIndex > 0 ? stage0ByPly.get(navIndex - 1) : null;
  const selectedS1Move = navIndex > 0 ? stage1ByPly.get(navIndex - 1) : null;
  const selectedS2Move = navIndex > 0 ? stage2ByPly.get(navIndex - 1) : null;
  const selectedS3Move = navIndex > 0 ? stage3ByPly.get(navIndex - 1) : null;
  const selectedS4Move = navIndex > 0 ? stage4ByPly.get(navIndex - 1) : null;

  return (
    <section className="chess-brilliance-section">
      <div className="chess-brilliance-section-head">
        <div>
          <h3>Brilliance Analysis</h3>
          <p>Stages 0–4 cascade · Stockfish on Stages 2–3 only</p>
        </div>
        <div className="chess-brilliance-section-actions">
          {loading && <span className="chess-brilliance-status">Running pipeline…</span>}
          {!loading && stage1?.moves?.length > 0 && (
            <span className="chess-brilliance-status chess-brilliance-status--ok">Complete</span>
          )}
          <button type="button" className="chess-brilliance-rerun-btn" onClick={onRerun} disabled={loading}>
            Re-run
          </button>
        </div>
      </div>

      {error && <div className="chess-brilliance-error">{error}</div>}

      <div className="chess-brilliance-filters">
        <button
          type="button"
          className={`chess-brilliance-filter-btn${stageFilter === 'stage1' ? ' chess-brilliance-filter-btn--active' : ''}`}
          onClick={() => setStageFilter((v) => (v === 'stage1' ? null : 'stage1'))}
          disabled={loading || !stage0?.moves?.length}
        >
          Stage 1
        </button>
        <button
          type="button"
          className={`chess-brilliance-filter-btn chess-brilliance-filter-btn--stage4${stageFilter === 'stage4' ? ' chess-brilliance-filter-btn--active' : ''}`}
          onClick={() => setStageFilter((v) => (v === 'stage4' ? null : 'stage4'))}
          disabled={loading || !stage3?.moves?.length}
        >
          Stage 4
        </button>
        {stageFilter == null && <span className="chess-brilliance-filter-hint">All moves</span>}
        {stageFilter === 'stage1' && (
          <span className="chess-brilliance-filter-hint">
            {stage1EligibleCount} move{stage1EligibleCount === 1 ? '' : 's'} eligible
          </span>
        )}
        {stageFilter === 'stage4' && (
          <span className="chess-brilliance-filter-hint">
            {stage4EligibleCount} move{stage4EligibleCount === 1 ? '' : 's'} for Stage 4
          </span>
        )}
      </div>

      <div className="chess-brilliance-grid">
        <div className="chess-brilliance-table-wrap">
          <table className="chess-brilliance-table">
            <thead>
              <tr>
                <th>Move</th>
                <th>Stage 0</th>
                <th>Stage 1</th>
                <th>Stage 2</th>
                <th>Stage 3</th>
                <th>Stage 4</th>
              </tr>
            </thead>
            <tbody>
              {!history.length ? (
                <tr>
                  <td colSpan={6} className="chess-brilliance-table-empty">
                    No moves available.
                  </td>
                </tr>
              ) : visibleTableRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="chess-brilliance-table-empty">
                    {stageFilter === 'stage4'
                      ? 'No moves selected for Stage 4.'
                      : 'No moves eligible for Stage 1.'}
                  </td>
                </tr>
              ) : (
                visibleTableRows.map(({ label, plyIndex }) => {
                  const isActive = navIndex === plyIndex + 1;
                  const s0Move = stage0ByPly.get(plyIndex);
                  const s1Move = stage1ByPly.get(plyIndex);
                  const s2Move = stage2ByPly.get(plyIndex);
                  const s3Move = stage3ByPly.get(plyIndex);
                  const s4Move = stage4ByPly.get(plyIndex);
                  const isStage1Eligible = Boolean(s0Move?.proceed_to_stage1);
                  const isStage2Eligible = Boolean(s1Move?.proceed_to_stage2);
                  const isStage3Eligible = Boolean(s1Move?.proceed_to_stage2 && s2Move?.proceed_to_stage3);
                  const isStage4Eligible = Boolean(s3Move?.proceed_to_stage4);
                  const isSac = s0Move?.is_sacrifice_candidate;

                  return (
                    <tr
                      key={plyIndex}
                      className={`chess-brilliance-row${isActive ? ' chess-brilliance-row--active' : ''}${
                        isStage4Eligible && stageFilter === 'stage4' ? ' chess-brilliance-row--stage4' : ''
                      }${isSac ? ' chess-brilliance-row--sac' : ''}`}
                      onClick={() => onSelectMove(plyIndex)}
                    >
                      <td className="chess-brilliance-move-label">{label}</td>
                      <td className={s0Move?.see_value < -50 ? 'chess-brilliance-cell--bad' : ''}>
                        {loading && !s0Move ? 'Running…' : stage0Summary(s0Move)}
                      </td>
                      <td>
                        {!isStage1Eligible ? (
                          <span className="chess-brilliance-cell--na">—</span>
                        ) : loading && !s1Move ? (
                          'Running…'
                        ) : (
                          <span
                            className={
                              s1Move?.proceed_to_stage2
                                ? 'chess-brilliance-cell--pass'
                                : s1Move && !s1Move.is_valid_sacrifice
                                  ? 'chess-brilliance-cell--bad'
                                  : ''
                            }
                          >
                            {stage1Summary(s1Move)}
                          </span>
                        )}
                      </td>
                      <td>
                        {!isStage2Eligible ? (
                          <span className="chess-brilliance-cell--na">—</span>
                        ) : loading && !s2Move ? (
                          'Running…'
                        ) : (
                          <span
                            className={
                              s2Move?.proceed_to_stage3
                                ? 'chess-brilliance-cell--pass'
                                : s2Move?.cpl_shallow > 300
                                  ? 'chess-brilliance-cell--bad'
                                  : ''
                            }
                          >
                            {stage2Summary(s2Move)}
                          </span>
                        )}
                      </td>
                      <td>
                        {!isStage3Eligible ? (
                          <span className="chess-brilliance-cell--na">—</span>
                        ) : loading && !s3Move ? (
                          'Running…'
                        ) : (
                          <span
                            className={
                              s3Move?.is_sound
                                ? 'chess-brilliance-cell--pass'
                                : s3Move?.proceed_to_stage4
                                  ? 'chess-brilliance-cell--stage4'
                                  : s3Move
                                    ? 'chess-brilliance-cell--warn'
                                    : ''
                            }
                          >
                            {stage3Summary(s3Move)}
                          </span>
                        )}
                      </td>
                      <td>
                        {!isStage4Eligible ? (
                          <span className="chess-brilliance-cell--na">—</span>
                        ) : loading && !s4Move ? (
                          'Running…'
                        ) : (
                          <span
                            className={
                              s4Move?.is_brilliant || s4Move?.classification === 'BRILLIANT'
                                ? 'chess-brilliance-cell--brilliant'
                                : s4Move?.classification === 'practical_brilliant'
                                  ? 'chess-brilliance-cell--practical'
                                  : s4Move
                                    ? 'chess-brilliance-cell--stage4'
                                    : ''
                            }
                          >
                            {stage4Summary(s4Move)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="chess-brilliance-expl-panel">
          <TestMoveStageExplanation
            navIndex={navIndex}
            moveLabel={selectedMoveLabel}
            s0Move={selectedS0Move}
            s1Move={selectedS1Move}
            s2Move={selectedS2Move}
            s3Move={selectedS3Move}
            s4Move={selectedS4Move}
            stage0Loading={loading}
            stage1Loading={loading}
            stage2Loading={loading}
            stage3Loading={loading}
            stage4Loading={loading}
          />
        </div>
      </div>
    </section>
  );
}
