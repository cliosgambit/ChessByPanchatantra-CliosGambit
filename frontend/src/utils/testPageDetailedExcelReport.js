import {
  DETAILED_STAGE_SCHEMA,
  buildAllStageRowsForMove,
  rowsToLookup,
  formatOkValue,
  getStageGateLabel,
} from './brillianceStageScoreRows';

const PALETTE = {
  navy: 'FF1A2332',
  white: 'FFFFFFFF',
  cream: 'FFFAF8F5',
  altRow: 'FFF8FAFC',
  sacRow: 'FFFFE08A',
  border: 'FFE5E7EB',
  metaBg: 'FFF1F5F9',
  passFill: 'FF34D399',
  passFont: 'FF064E3B',
  failFill: 'FFF87171',
  failFont: 'FF7F1D1D',
  warnFill: 'FFFDE68A',
  warnFont: 'FF92400E',
  mutedFill: 'FFE2E8F0',
  mutedFont: 'FF64748B',
  highlightFill: 'FF93C5FD',
  stagePassedFill: 'FF4ADE80',
  headerBg: 'FFCBD5E1',
  headerFont: 'FF1E293B',
  titleBg: 'FFF8FAFC',
  titleFont: 'FF1E293B',
  gatePassFill: 'FF34D399',
  gateStopFill: 'FFF87171',
  gateSkipFill: 'FFE2E8F0',
  moveFont: 'FF1E293B',
  checkHeader: 'FF334155',
};

/** Darker stage header band colors for the Excel sheet. */
const STAGE_BAND_FILL = {
  0: 'FFC7D2FE',
  1: 'FFC4B5FD',
  2: 'FF93C5FD',
  3: 'FF7DD3FC',
  4: 'FFFCD34D',
};

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(color = PALETTE.border) {
  const edge = { style: 'thin', color: { argb: color } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyCellStyle(cell, style, { wrap = true, align = 'left' } = {}) {
  cell.fill = style.fill;
  cell.font = { name: 'Calibri', size: 9, ...(style.font || {}) };
  cell.alignment = { vertical: 'top', horizontal: align, wrapText: wrap };
  cell.border = thinBorder();
}

function colLetter(colNum) {
  let n = colNum;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
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

function okCellStyle(row, baseFill) {
  if (!row) {
    return { fill: solidFill(PALETTE.mutedFill), font: { color: { argb: PALETTE.mutedFont } } };
  }
  if (row.na) {
    return { fill: solidFill(PALETTE.mutedFill), font: { color: { argb: PALETTE.mutedFont } } };
  }
  if (row.pass == null) {
    return { fill: solidFill(baseFill), font: { color: { argb: 'FF64748B' } } };
  }
  if (row.pass) {
    return { fill: solidFill(PALETTE.passFill), font: { color: { argb: PALETTE.passFont }, bold: true } };
  }
  return { fill: solidFill(PALETTE.failFill), font: { color: { argb: PALETTE.failFont }, bold: true } };
}

function gateCellStyle(gateLabel) {
  if (gateLabel.startsWith('→')) {
    return { fill: solidFill(PALETTE.gatePassFill), font: { color: { argb: PALETTE.passFont }, bold: true } };
  }
  if (gateLabel === 'Stop') {
    return { fill: solidFill(PALETTE.gateStopFill), font: { color: { argb: PALETTE.failFont }, bold: true } };
  }
  if (gateLabel === 'Skip') {
    return { fill: solidFill(PALETTE.gateSkipFill), font: { color: { argb: PALETTE.mutedFont } } };
  }
  if (gateLabel === 'BRILLIANT' || gateLabel === 'great_sacrifice') {
    return { fill: solidFill(PALETTE.warnFill), font: { color: { argb: PALETTE.warnFont }, bold: true } };
  }
  return { fill: solidFill(PALETTE.cream), font: { color: { argb: PALETTE.checkHeader }, bold: true } };
}

function buildColumnPlan() {
  const columns = [
    { key: 'move', label: 'Move', width: 14, kind: 'fixed' },
    { key: 'ply', label: 'Ply', width: 6, kind: 'fixed' },
  ];

  for (const stageDef of DETAILED_STAGE_SCHEMA) {
    columns.push({
      key: `S${stageDef.stage}_gate`,
      label: 'Gate',
      width: 10,
      kind: 'gate',
      stage: stageDef.stage,
      stageTitle: stageDef.title,
      stageFill: stageDef.fill,
    });
    for (const check of stageDef.checks) {
      for (const sub of ['got', 'need', 'ok']) {
        columns.push({
          key: `S${stageDef.stage}_${check}_${sub}`,
          label: sub === 'got' ? 'Got' : sub === 'need' ? 'Need' : 'OK',
          check,
          sub,
          width: sub === 'ok' ? 7 : 14,
          kind: 'feature',
          stage: stageDef.stage,
          stageTitle: stageDef.title,
          stageFill: stageDef.fill,
        });
      }
    }
  }

  return columns;
}

function stageEligible(stageNum, s0, s1, s2, s3) {
  switch (stageNum) {
    case 0: return true;
    case 1: return Boolean(s0?.proceed_to_stage1);
    case 2: return Boolean(s1?.proceed_to_stage2);
    case 3: return Boolean(s1?.proceed_to_stage2 && s2?.proceed_to_stage3);
    case 4: return Boolean(s3?.proceed_to_stage4);
    default: return false;
  }
}

function stagePassed(stageNum, s0, s1, s2, s3) {
  switch (stageNum) {
    case 0: return Boolean(s0?.proceed_to_stage1);
    case 1: return Boolean(s1?.proceed_to_stage2);
    case 2: return Boolean(s2?.proceed_to_stage3);
    case 3: return Boolean(s3?.proceed_to_stage4);
    case 4: return Boolean(s3?.proceed_to_stage4);
    default: return false;
  }
}

export async function downloadBrillianceFeatureExcelReport({
  moveListLabels = [],
  rows = null,
  stage0 = null,
  stage1 = null,
  stage2 = null,
  stage3 = null,
  stage4 = null,
  gameMeta = {},
  gameInfo = null,
  pgnText = '',
}) {
  const exportRows = rows?.length
    ? rows
    : moveListLabels.map((label, plyIndex) => ({ label, plyIndex }));

  if (!exportRows.length) {
    throw new Error('Load a PGN with moves before downloading the feature report.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CLIO Brilliance Test';
  workbook.created = new Date();

  const columns = buildColumnPlan();

  const sheet = workbook.addWorksheet('Feature Report', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }],
  });

  const meta = gameMeta || {};
  const white = meta.White || 'White';
  const black = meta.Black || 'Black';
  const date = meta.Date || new Date().toISOString().slice(0, 10);
  const pgn = String(pgnText || gameInfo?.clean_pgn || gameInfo?.pgn_text || '').trim();

  const pgnCell = sheet.getCell('A1');
  pgnCell.value = pgn || '(PGN not available)';
  applyCellStyle(pgnCell, {
    fill: solidFill(PALETTE.cream),
    font: { color: { argb: PALETTE.titleFont }, size: 10 },
  }, { align: 'left', wrap: true });
  sheet.getRow(1).height = pgn ? Math.min(120, 18 + Math.ceil(pgn.length / 80) * 12) : 22;
  sheet.getColumn(1).width = 48;

  // Row 2–4: stage band merges
  sheet.mergeCells('A2:A4');
  sheet.getCell('A2').value = 'Move';
  applyCellStyle(sheet.getCell('A2'), {
    fill: solidFill(PALETTE.headerBg),
    font: { color: { argb: PALETTE.headerFont }, bold: true, size: 10 },
  }, { align: 'center', wrap: false });

  sheet.mergeCells('B2:B4');
  sheet.getCell('B2').value = 'Ply';
  applyCellStyle(sheet.getCell('B2'), {
    fill: solidFill(PALETTE.headerBg),
    font: { color: { argb: PALETTE.headerFont }, bold: true, size: 10 },
  }, { align: 'center', wrap: false });

  let colIdx = 3;
  for (const stageDef of DETAILED_STAGE_SCHEMA) {
    const stageColCount = 1 + stageDef.checks.length * 3;
    const startCol = colIdx;
    const endCol = colIdx + stageColCount - 1;
    const startLetter = colLetter(startCol);
    const endLetter = colLetter(endCol);

    sheet.mergeCells(`${startLetter}2:${endLetter}2`);
    const stageCell = sheet.getCell(`${startLetter}2`);
    stageCell.value = stageDef.title;
    applyCellStyle(stageCell, {
      fill: solidFill(STAGE_BAND_FILL[stageDef.stage] || stageDef.fill),
      font: { color: { argb: PALETTE.headerFont }, bold: true, size: 11 },
    }, { align: 'center', wrap: false });

    sheet.mergeCells(`${startLetter}3:${startLetter}4`);
    const gateHeader = sheet.getCell(`${startLetter}3`);
    gateHeader.value = 'Gate';
    applyCellStyle(gateHeader, {
      fill: solidFill(PALETTE.headerBg),
      font: { color: { argb: PALETTE.headerFont }, bold: true, size: 9 },
    }, { align: 'center', wrap: false });

    colIdx += 1;
    for (const check of stageDef.checks) {
      const checkStart = colIdx;
      const checkEnd = colIdx + 2;
      const cs = colLetter(checkStart);
      const ce = colLetter(checkEnd);
      sheet.mergeCells(`${cs}3:${ce}3`);
      const checkCell = sheet.getCell(`${cs}3`);
      checkCell.value = check;
      applyCellStyle(checkCell, {
        fill: solidFill(STAGE_BAND_FILL[stageDef.stage] || stageDef.fill),
        font: { color: { argb: PALETTE.headerFont }, bold: true, size: 9 },
      }, { align: 'center', wrap: true });

      for (const sub of ['Got', 'Need', 'OK']) {
        const subCell = sheet.getRow(4).getCell(colIdx);
        subCell.value = sub;
        applyCellStyle(subCell, {
          fill: solidFill(PALETTE.headerBg),
          font: { color: { argb: PALETTE.headerFont }, bold: true, size: 8 },
        }, { align: 'center', wrap: false });
        colIdx += 1;
      }
    }
  }

  sheet.getRow(2).height = 20;
  sheet.getRow(3).height = 28;
  sheet.getRow(4).height = 16;

  columns.forEach((col, i) => {
    if (i === 0) return;
    sheet.getColumn(i + 1).width = col.width;
  });

  const s0Map = buildStageMaps(stage0);
  const s1Map = buildStageMaps(stage1);
  const s2Map = buildStageMaps(stage2);
  const s3Map = buildStageMaps(stage3);
  const s4Map = buildStageMaps(stage4);

  const dataStartRow = 5;

  exportRows.forEach(({ label, plyIndex }, rowIdx) => {
    const rowNum = dataStartRow + rowIdx;
    const row = sheet.getRow(rowNum);
    const s0 = s0Map.get(plyIndex);
    const s1 = s1Map.get(plyIndex);
    const s2 = s2Map.get(plyIndex);
    const s3 = s3Map.get(plyIndex);
    const s4 = s4Map.get(plyIndex);

    const isSac = Boolean(s0?.is_sacrifice_candidate);
    const rowBaseFill = isSac ? PALETTE.sacRow : rowIdx % 2 === 0 ? PALETTE.cream : PALETTE.altRow;
    const stage4Passed = stagePassed(4, s0, s1, s2, s3);

    const allRows = buildAllStageRowsForMove(s0, s1, s2, s3, s4);
    const lookups = {
      0: rowsToLookup(allRows[0]),
      1: rowsToLookup(allRows[1]),
      2: rowsToLookup(allRows[2]),
      3: rowsToLookup(allRows[3]),
      4: rowsToLookup(allRows[4]),
    };

    const moveBaseFill = stage4Passed ? PALETTE.stagePassedFill : rowBaseFill;

    row.getCell(1).value = label;
    applyCellStyle(row.getCell(1), {
      fill: solidFill(moveBaseFill),
      font: { color: { argb: PALETTE.moveFont }, bold: true },
    }, { wrap: false });

    row.getCell(2).value = plyIndex;
    applyCellStyle(row.getCell(2), {
      fill: solidFill(moveBaseFill),
      font: { color: { argb: 'FF64748B' } },
    }, { align: 'center', wrap: false });

    let c = 3;
    for (const stageDef of DETAILED_STAGE_SCHEMA) {
      const eligible = stageEligible(stageDef.stage, s0, s1, s2, s3);
      const passed = stagePassed(stageDef.stage, s0, s1, s2, s3);
      const stageFill = passed ? PALETTE.stagePassedFill : rowBaseFill;
      const gateLabel = getStageGateLabel(stageDef.stage, s0, s1, s2, s3, s4);
      const gateCell = row.getCell(c);
      gateCell.value = eligible ? gateLabel : 'Skip';
      const gateStyle = eligible ? gateCellStyle(gateLabel) : gateCellStyle('Skip');
      if (passed && eligible && gateLabel.startsWith('→')) {
        gateStyle.fill = solidFill(PALETTE.gatePassFill);
        gateStyle.font = { color: { argb: PALETTE.passFont }, bold: true };
      } else if (eligible && gateLabel === 'Stop') {
        gateStyle.fill = solidFill(PALETTE.gateStopFill);
        gateStyle.font = { color: { argb: PALETTE.failFont }, bold: true };
      } else if (passed) {
        gateStyle.fill = solidFill(PALETTE.stagePassedFill);
      }
      applyCellStyle(gateCell, gateStyle, { align: 'center', wrap: false });
      c += 1;

      for (const check of stageDef.checks) {
        const featureRow = eligible ? lookups[stageDef.stage].get(check) : null;
        const highlight = Boolean(featureRow?.highlight);
        const cellFill = passed ? PALETTE.stagePassedFill : highlight ? PALETTE.highlightFill : rowBaseFill;

        const gotCell = row.getCell(c);
        gotCell.value = eligible && featureRow ? String(featureRow.got) : '—';
        applyCellStyle(gotCell, {
          fill: solidFill(cellFill),
          font: { color: { argb: PALETTE.headerFont }, bold: highlight },
        });
        c += 1;

        const needCell = row.getCell(c);
        needCell.value = eligible && featureRow ? String(featureRow.need) : '—';
        applyCellStyle(needCell, {
          fill: solidFill(cellFill),
          font: { color: { argb: 'FF64748B' }, bold: highlight },
        });
        c += 1;

        const okCell = row.getCell(c);
        okCell.value = eligible && featureRow ? formatOkValue(featureRow) : '—';
        const okStyle = eligible && featureRow ? okCellStyle(featureRow, cellFill) : {
          fill: solidFill(PALETTE.mutedFill),
          font: { color: { argb: PALETTE.mutedFont } },
        };
        applyCellStyle(okCell, okStyle, { align: 'center', wrap: false });
        c += 1;
      }
    }

    row.height = 18;
  });

  const filename = sanitizeFilename(
    `brilliance-features_${white}-vs-${black}_${date}.xlsx`
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
