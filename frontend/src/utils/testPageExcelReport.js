import {
  stage0Summary,
  stage1Summary,
  stage2Summary,
  stage3Summary,
  stage4Summary,
} from './brillianceStageSummaries';
import {
  stage0CellClass,
  stage1CellClass,
  stage2CellClass,
  stage3CellClass,
  stage4CellClass,
} from './testPageCellClass';

const LAST_COL = 'F';

const PALETTE = {
  navy: 'FF1A2332',
  white: 'FFFFFFFF',
  cream: 'FFFAF8F5',
  altRow: 'FFF8FAFC',
  sacRow: 'FFFFFBEB',
  border: 'FFE5E7EB',
  titleBg: 'FF111827',
  metaBg: 'FFF1F5F9',
  passFill: 'FFD1FAE5',
  passFont: 'FF047857',
  failFill: 'FFFEE2E2',
  failFont: 'FFDC2626',
  warnFill: 'FFFEF3C7',
  warnFont: 'FFB45309',
  stage3Fill: 'FFEDE9FE',
  stage3Font: 'FF6D28D9',
  violetFill: 'FFF5F3FF',
  violetFont: 'FF7C3AED',
  brilliantFill: 'FFFFEDD5',
  brilliantFont: 'FFD97706',
  mutedFill: 'FFF1F5F9',
  mutedFont: 'FFCBD5E1',
  moveFont: 'FF1E293B',
};

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(color = PALETTE.border) {
  const edge = { style: 'thin', color: { argb: color } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function styleFromCellClass(cellClass, baseFill = PALETTE.cream) {
  switch (cellClass) {
    case 'tp-cell-pass':
      return { fill: solidFill(PALETTE.passFill), font: { color: { argb: PALETTE.passFont }, bold: true } };
    case 'tp-cell-fail':
      return { fill: solidFill(PALETTE.failFill), font: { color: { argb: PALETTE.failFont }, bold: true } };
    case 'tp-cell-warn':
      return { fill: solidFill(PALETTE.warnFill), font: { color: { argb: PALETTE.warnFont }, bold: true } };
    case 'tp-cell-stage3':
      return { fill: solidFill(PALETTE.stage3Fill), font: { color: { argb: PALETTE.stage3Font }, bold: true } };
    case 'tp-cell-violet':
      return { fill: solidFill(PALETTE.violetFill), font: { color: { argb: PALETTE.violetFont }, bold: true } };
    case 'tp-cell-brilliant':
      return { fill: solidFill(PALETTE.brilliantFill), font: { color: { argb: PALETTE.brilliantFont }, bold: true } };
    case 'tp-cell-muted':
      return { fill: solidFill(PALETTE.mutedFill), font: { color: { argb: PALETTE.mutedFont } } };
    default:
      return { fill: solidFill(baseFill), font: { color: { argb: 'FF475569' } } };
  }
}

function applyCellStyle(cell, style, { wrap = true, align = 'left' } = {}) {
  cell.fill = style.fill;
  cell.font = { name: 'Calibri', size: 10, ...(style.font || {}) };
  cell.alignment = { vertical: 'top', horizontal: align, wrapText: wrap };
  cell.border = thinBorder();
}

function sanitizeFilename(name) {
  return String(name || 'game')
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function buildStageMaps(stageData) {
  const map = new Map();
  for (const m of stageData?.moves || []) {
    map.set(m.ply_index, m);
  }
  return map;
}

export async function downloadBrillianceExcelReport({
  moveListLabels = [],
  rows = null,
  stage0 = null,
  stage1 = null,
  stage2 = null,
  stage3 = null,
  stage4 = null,
  gameMeta = {},
  gameInfo = null,
}) {
  const exportRows = rows?.length
    ? rows
    : moveListLabels.map((label, plyIndex) => ({ label, plyIndex }));

  if (!exportRows.length) {
    throw new Error('Load a PGN with moves before downloading the report.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CLIO Brilliance Test';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Brilliance Report', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const meta = gameMeta || {};
  const white = meta.White || 'White';
  const black = meta.Black || 'Black';
  const event = meta.Event || 'Custom PGN';
  const date = meta.Date || new Date().toISOString().slice(0, 10);
  const result = meta.Result || gameInfo?.result || '—';

  sheet.mergeCells(`A1:${LAST_COL}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Brilliance Cascade — Detailed Stage Report';
  applyCellStyle(titleCell, {
    fill: solidFill(PALETTE.titleBg),
    font: { color: { argb: PALETTE.white }, bold: true, size: 14 },
  }, { align: 'center', wrap: false });
  sheet.getRow(1).height = 28;

  sheet.mergeCells(`A2:${LAST_COL}2`);
  const metaCell = sheet.getCell('A2');
  metaCell.value = `${event}  ·  ${white}${meta.WhiteElo ? ` (${meta.WhiteElo})` : ''} vs ${black}${meta.BlackElo ? ` (${meta.BlackElo})` : ''}  ·  ${date}  ·  Result: ${result}  ·  Moves: ${exportRows.length}`;
  applyCellStyle(metaCell, {
    fill: solidFill(PALETTE.metaBg),
    font: { color: { argb: 'FF334155' }, bold: true, size: 10 },
  }, { align: 'center', wrap: true });
  sheet.getRow(2).height = 22;

  sheet.mergeCells(`A3:${LAST_COL}3`);
  const legendCell = sheet.getCell('A3');
  legendCell.value = 'Green = pass/proceed · Red = fail · Amber = sacrifice/warn · Purple = Stage 3/4 · Orange = BRILLIANT';
  applyCellStyle(legendCell, {
    fill: solidFill(PALETTE.cream),
    font: { color: { argb: 'FF64748B' }, italic: true, size: 9 },
  }, { align: 'center', wrap: false });
  sheet.getRow(3).height = 18;

  const headerRow = sheet.getRow(4);
  const headers = ['Move', 'Stage 0', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4'];
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    applyCellStyle(cell, {
      fill: solidFill(PALETTE.navy),
      font: { color: { argb: PALETTE.white }, bold: true, size: 11 },
    }, { align: 'center', wrap: false });
  });
  headerRow.height = 22;

  const s0Map = buildStageMaps(stage0);
  const s1Map = buildStageMaps(stage1);
  const s2Map = buildStageMaps(stage2);
  const s3Map = buildStageMaps(stage3);
  const s4Map = buildStageMaps(stage4);

  const summaries = [stage0Summary, stage1Summary, stage2Summary, stage3Summary, stage4Summary];
  const cellClassFns = [stage0CellClass, stage1CellClass, stage2CellClass, stage3CellClass, stage4CellClass];

  exportRows.forEach(({ label, plyIndex }, rowIdx) => {
    const rowNum = 5 + rowIdx;
    const row = sheet.getRow(rowNum);
    const s0 = s0Map.get(plyIndex);
    const s1 = s1Map.get(plyIndex);
    const s2 = s2Map.get(plyIndex);
    const s3 = s3Map.get(plyIndex);
    const s4 = s4Map.get(plyIndex);

    const isSac = Boolean(s0?.is_sacrifice_candidate);
    const baseFill = isSac ? PALETTE.sacRow : rowIdx % 2 === 0 ? PALETTE.cream : PALETTE.altRow;

    const isStage1Eligible = Boolean(s0?.proceed_to_stage1);
    const isStage2Eligible = Boolean(s1?.proceed_to_stage2);
    const isStage3Eligible = Boolean(s1?.proceed_to_stage2 && s2?.proceed_to_stage3);
    const isStage4Eligible = Boolean(s3?.proceed_to_stage4);
    const eligibility = [true, isStage1Eligible, isStage2Eligible, isStage3Eligible, isStage4Eligible];

    const moveCell = row.getCell(1);
    moveCell.value = label;
    applyCellStyle(moveCell, {
      fill: solidFill(baseFill),
      font: { color: { argb: PALETTE.moveFont }, bold: true },
    }, { wrap: false });

    for (let stageIdx = 0; stageIdx < 5; stageIdx += 1) {
      const moves = [s0, s1, s2, s3, s4];
      const move = moves[stageIdx];
      const eligible = eligibility[stageIdx];
      const text = eligible ? summaries[stageIdx](move) : '—';
      const cellClass = eligible ? cellClassFns[stageIdx](move) : 'tp-cell-muted';
      const cell = row.getCell(stageIdx + 2);
      cell.value = text;
      applyCellStyle(cell, styleFromCellClass(cellClass, baseFill));
    }

    row.height = 32;
  });

  sheet.columns = [
    { width: 14 },
    { width: 42 },
    { width: 38 },
    { width: 34 },
    { width: 34 },
    { width: 36 },
  ];

  const filename = sanitizeFilename(
    `brilliance-report_${white}-vs-${black}_${date}.xlsx`
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
