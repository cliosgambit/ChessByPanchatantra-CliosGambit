export const ALL_MOVES_FILTER = { mode: 'all' };

/** Moves that passed Stage 0 and entered Stage 1 (same as Stage 1 tab on test page). */
export const STAGE1_ONLY_FILTER = { mode: 'stage1' };

export const DEFAULT_DOWNLOAD_FILTER = ALL_MOVES_FILTER;

export function buildStageMapsFromData(stage0, stage1, stage2, stage3, stage4) {
  const toMap = (stageData) => {
    const map = new Map();
    for (const m of stageData?.moves || []) {
      map.set(m.ply_index, m);
    }
    return map;
  };
  return {
    s0: toMap(stage0),
    s1: toMap(stage1),
    s2: toMap(stage2),
    s3: toMap(stage3),
    s4: toMap(stage4),
  };
}

export function countMovesPassingStage(tableMoveRows, maps, stageKey) {
  if (stageKey === 'stage1') {
    return tableMoveRows.filter(({ plyIndex }) => Boolean(maps.s0.get(plyIndex)?.proceed_to_stage1)).length;
  }
  return tableMoveRows.length;
}

export function filterRowsByStagePass(tableMoveRows, maps, filter = ALL_MOVES_FILTER) {
  if (!tableMoveRows?.length) return [];
  if (!filter || filter.mode === 'all') {
    return tableMoveRows;
  }
  if (filter.mode === 'stage1') {
    return tableMoveRows.filter(({ plyIndex }) => Boolean(maps.s0.get(plyIndex)?.proceed_to_stage1));
  }
  return tableMoveRows;
}
