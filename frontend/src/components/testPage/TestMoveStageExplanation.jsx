import React, { useMemo } from 'react';
import {
  buildStage0Rows,
  buildStage1Rows,
  buildStage2Rows,
  buildStage3Rows,
  buildStage4Rows,
} from '../../utils/brillianceStageScoreRows';

function PassCell({ pass, na }) {
  if (na) return <span className="tp-score-na">—</span>;
  if (pass == null) return <span className="tp-score-pending">·</span>;
  return (
    <span className={pass ? 'tp-score-ok' : 'tp-score-fail'}>
      {pass ? 'true' : 'false'}
    </span>
  );
}

function ScoreTable({ rows }) {
  return (
    <table className="tp-score-table">
      <thead>
        <tr>
          <th>Check</th>
          <th>Got</th>
          <th>Need</th>
          <th>OK</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={row.highlight ? 'tp-score-row--highlight' : undefined}>
            <td className="tp-score-check">{row.label}</td>
            <td className="tp-score-got">{row.got}</td>
            <td className="tp-score-need">{row.need}</td>
            <td className="tp-score-okcell">
              <PassCell pass={row.pass} na={row.na} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StageSection({ title, gatePass, gateLabel, children }) {
  return (
    <section className="tp-score-section">
      <div className="tp-score-section-head">
        <span className="tp-score-section-title">{title}</span>
        {gatePass != null && (
          <span
            className={`tp-score-gate ${gatePass ? 'tp-score-gate--pass' : 'tp-score-gate--stop'}`}
          >
            {gateLabel}
          </span>
        )}
      </div>
      <div className="tp-score-section-body">{children}</div>
    </section>
  );
}

export default function TestMoveStageExplanation({
  navIndex,
  moveLabel,
  s0Move,
  s1Move,
  s2Move,
  s3Move,
  s4Move,
  stage0Loading,
  stage1Loading,
  stage2Loading,
  stage3Loading,
  stage4Loading,
}) {
  const plyIndex = navIndex > 0 ? navIndex - 1 : null;

  const stage0Rows = useMemo(() => buildStage0Rows(s0Move), [s0Move]);
  const stage1Rows = useMemo(() => buildStage1Rows(s0Move, s1Move), [s0Move, s1Move]);
  const stage2Rows = useMemo(() => buildStage2Rows(s1Move, s2Move), [s1Move, s2Move]);
  const stage3Rows = useMemo(
    () => buildStage3Rows(s2Move, s1Move, s3Move),
    [s2Move, s1Move, s3Move]
  );
  const stage4Rows = useMemo(
    () => buildStage4Rows(s3Move, s4Move),
    [s3Move, s4Move]
  );

  if (plyIndex == null || !moveLabel) {
    return (
      <div className="tp-stage-scores-panel">
        <div className="tp-panel-header">
          <h2>Stage scores</h2>
        </div>
        <div className="tp-stage-scores-empty">
          Click a move to see scores vs thresholds.
        </div>
      </div>
    );
  }

  return (
    <div className="tp-stage-scores-panel">
      <div className="tp-panel-header">
        <h2>Stage scores</h2>
        <div className="tp-stage-scores-move">{moveLabel}</div>
        <div className="tp-stage-scores-ply">Ply {plyIndex}</div>
      </div>

      <div className="tp-stage-scores-body">
        <StageSection
          title="Stage 0"
          gatePass={stage0Loading ? null : Boolean(s0Move?.proceed_to_stage1)}
          gateLabel={stage0Loading ? '…' : s0Move?.proceed_to_stage1 ? '→ S1' : 'Stop'}
        >
          {stage0Loading ? (
            <p className="tp-score-msg">Running…</p>
          ) : stage0Rows.length ? (
            <ScoreTable rows={stage0Rows} />
          ) : (
            <p className="tp-score-msg">No data</p>
          )}
        </StageSection>

        <StageSection
          title="Stage 1"
          gatePass={
            stage1Loading || !s0Move?.proceed_to_stage1
              ? null
              : Boolean(s1Move?.proceed_to_stage2)
          }
          gateLabel={
            stage1Loading
              ? '…'
              : !s0Move?.proceed_to_stage1
                ? 'Skip'
                : s1Move?.proceed_to_stage2
                  ? '→ S2'
                  : 'Stop'
          }
        >
          {stage1Loading ? (
            <p className="tp-score-msg">Running…</p>
          ) : !s0Move?.proceed_to_stage1 ? (
            <p className="tp-score-msg">Not a Stage 0 candidate</p>
          ) : stage1Rows.length ? (
            <ScoreTable rows={stage1Rows} />
          ) : (
            <p className="tp-score-msg">No data</p>
          )}
        </StageSection>

        <StageSection
          title="Stage 2"
          gatePass={
            stage2Loading || !s1Move?.proceed_to_stage2
              ? null
              : Boolean(s2Move?.proceed_to_stage3)
          }
          gateLabel={
            stage2Loading
              ? '…'
              : !s1Move?.proceed_to_stage2
                ? 'Skip'
                : s2Move?.proceed_to_stage3
                  ? '→ S3'
                  : 'Stop'
          }
        >
          {stage2Loading ? (
            <p className="tp-score-msg">Running…</p>
          ) : !s1Move?.proceed_to_stage2 ? (
            <p className="tp-score-msg">Did not pass Stage 1</p>
          ) : stage2Rows.length ? (
            <ScoreTable rows={stage2Rows} />
          ) : (
            <p className="tp-score-msg">No data</p>
          )}
        </StageSection>

        <StageSection
          title="Stage 3"
          gatePass={
            stage3Loading || !s1Move?.proceed_to_stage2 || !s2Move?.proceed_to_stage3
              ? null
              : Boolean(s3Move?.proceed_to_stage4)
          }
          gateLabel={
            stage3Loading
              ? '…'
              : !s1Move?.proceed_to_stage2
                ? 'Skip'
                : !s2Move?.proceed_to_stage3
                  ? 'Skip'
                  : s3Move?.proceed_to_stage4
                    ? '→ S4'
                    : 'Stop'
          }
        >
          {stage3Loading ? (
            <p className="tp-score-msg">Running…</p>
          ) : !s1Move?.proceed_to_stage2 || !s2Move?.proceed_to_stage3 ? (
            <p className="tp-score-msg">Did not pass Stage 1→2 cascade</p>
          ) : stage3Rows.length ? (
            <ScoreTable rows={stage3Rows} />
          ) : (
            <p className="tp-score-msg">No data</p>
          )}
        </StageSection>

        <StageSection
          title="Stage 4"
          gatePass={
            stage4Loading || !s3Move?.proceed_to_stage4
              ? null
              : Boolean(s4Move?.is_brilliant ?? (s4Move?.brilliance_score != null && s4Move.brilliance_score >= 6.5))
          }
          gateLabel={
            stage4Loading
              ? '…'
              : !s3Move?.proceed_to_stage4
                ? 'Skip'
                : s4Move?.classification === 'BRILLIANT'
                  ? 'BRILLIANT'
                  : s4Move?.classification
                    ? s4Move.classification
                    : 'Done'
          }
        >
          {stage4Loading ? (
            <p className="tp-score-msg">Running…</p>
          ) : !s3Move?.proceed_to_stage4 ? (
            <p className="tp-score-msg">Did not pass Stage 3</p>
          ) : stage4Rows.length ? (
            <ScoreTable rows={stage4Rows} />
          ) : (
            <p className="tp-score-msg">No Stage 4 data</p>
          )}
        </StageSection>
      </div>
    </div>
  );
}
