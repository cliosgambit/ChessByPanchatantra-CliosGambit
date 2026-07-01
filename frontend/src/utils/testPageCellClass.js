/** Semantic cell classes for the test page analysis table (no Tailwind). */
export function analysisCellClass(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function stage0CellClass(move) {
  if (!move) return '';
  if (move.see_value != null && move.see_value < -50) return 'tp-cell-fail';
  if (move.is_sacrifice_candidate) return 'tp-cell-warn';
  if (move.proceed_to_stage1) return 'tp-cell-pass';
  return '';
}

export function stage1CellClass(move) {
  if (!move) return '';
  if (move.proceed_to_stage2) return 'tp-cell-pass';
  if (!move.is_valid_sacrifice) return 'tp-cell-fail';
  return 'tp-cell-warn';
}

export function stage2CellClass(move) {
  if (!move) return '';
  if (move.proceed_to_stage3) return 'tp-cell-pass';
  if (move.cpl_shallow != null && move.cpl_shallow > 300) return 'tp-cell-fail';
  return '';
}

export function stage3CellClass(move) {
  if (!move) return '';
  if (move.is_sound) return 'tp-cell-pass';
  if (move.proceed_to_stage4) return 'tp-cell-stage3';
  return 'tp-cell-warn';
}

export function stage4CellClass(move) {
  if (!move) return '';
  if (move.is_brilliant || move.classification === 'BRILLIANT') return 'tp-cell-brilliant';
  if (move.classification === 'practical_brilliant') return 'tp-cell-stage3';
  return 'tp-cell-violet';
}
