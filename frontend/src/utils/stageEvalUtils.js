export function whiteCpToEvalDisplay(cp) {
  if (cp == null || !Number.isFinite(cp)) {
    return { percent: 50, display: { text: '0.00', side: 'w' } };
  }

  const v = cp / 100;
  let percent;
  if (v >= 8) percent = 100;
  else if (v >= 4) percent = 90 + ((v - 4) / 4) * 10;
  else if (v >= 0) percent = 50 + (v / 4) * 40;
  else if (v >= -4) percent = 10 + ((v + 4) / 4) * 40;
  else if (v >= -8) percent = ((v + 8) / 4) * 10;
  else percent = 0;

  return {
    percent: Math.max(0, Math.min(100, percent)),
    display: {
      text: `${v >= 0 ? '+' : ''}${v.toFixed(2)}`,
      side: v >= 0 ? 'w' : 'b',
    },
  };
}

export function formatWhiteCpScore(cp) {
  if (cp == null || !Number.isFinite(cp)) return null;
  if (Math.abs(cp) >= 9000) {
    const mateIn = Math.max(1, 10000 - Math.abs(cp));
    const whitePositive = cp > 0;
    return {
      scoreText: `M${mateIn}`,
      advantage: whitePositive
        ? { text: 'White winning', className: 'chess-stage-engine-advantage--win' }
        : { text: 'Black winning', className: 'chess-stage-engine-advantage--loss' },
    };
  }
  const pawns = cp / 100;
  return {
    scoreText: `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`,
    advantage: {
      text: pawns >= 0 ? 'White better' : 'Black better',
      className: pawns >= 0 ? 'chess-stage-engine-advantage--win' : 'chess-stage-engine-advantage--loss',
    },
  };
}

export function formatWhiteCpLabel(cp) {
  if (cp == null || !Number.isFinite(cp)) return '—';
  if (Math.abs(cp) >= 9000) {
    const mateIn = Math.max(1, 10000 - Math.abs(cp));
    return cp > 0 ? `+M${mateIn}` : `-M${mateIn}`;
  }
  const pawns = cp / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export function getStageMoveBadge(stage0Move, stage4Move) {
  if (stage4Move?.is_brilliant || stage4Move?.classification === 'BRILLIANT') return 'brilliant';
  if (stage4Move?.classification === 'practical_brilliant') return 'great';
  if (stage0Move?.is_sacrifice_candidate) return 'book';
  return null;
}
