import {
  fetchChessComAchievements,
  fetchChessComGameStatsForRange,
  fetchChessComGamesForRange,
} from '../services/chessComDbService';
import { computeSinceDate } from '../components/userProfile/RatingProgressChart';

const PALETTE = {
  titleBg: 'FF111827',
  titleFg: 'FFFFFFFF',
  headerBg: 'FFF1F5F9',
  altRow: 'FFF8FAFC',
  border: 'FFE2E8F0',
  ink: 'FF1E293B',
  muted: 'FF64748B',
  win: 'FF047857',
  loss: 'FFDC2626',
};

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(color = PALETTE.border) {
  const edge = { style: 'thin', color: { argb: color } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyCellStyle(cell, { fill, font, bold = false } = {}) {
  if (fill) cell.fill = fill;
  cell.font = { name: 'Calibri', size: 11, color: { argb: font || PALETTE.ink }, bold };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  cell.border = thinBorder();
}

function sanitizeFilename(name) {
  return String(name || 'report')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function recordText(record) {
  if (!record) return '0W / 0L / 0D';
  return `${record.wins || 0}W / ${record.losses || 0}L / ${record.draws || 0}D`;
}

function winRate(totals) {
  const wins = Number(totals?.wins) || 0;
  const losses = Number(totals?.losses) || 0;
  const draws = Number(totals?.draws) || 0;
  const total = wins + losses + draws;
  if (!total) return '0%';
  return `${(Math.round((wins / total) * 1000) / 10).toString()}%`;
}

function formatDelta(delta) {
  if (delta == null || !Number.isFinite(Number(delta))) return '—';
  const n = Number(delta);
  if (n > 0) return `+${n}`;
  return String(n);
}

async function fetchAllGamesForRange(username, { since, all = false }) {
  const pageSize = 200;
  let offset = 0;
  let total = Infinity;
  const games = [];

  while (offset < total && games.length < 2000) {
    const data = await fetchChessComGamesForRange(username, {
      since,
      all,
      limit: pageSize,
      offset,
    });
    const batch = data.games || [];
    total = Number(data.total ?? batch.length);
    games.push(...batch);
    if (!batch.length) break;
    offset += batch.length;
  }

  return games;
}

/**
 * @param {object} options
 * @param {string} options.username
 * @param {'joining'|'1m'} options.rangeKey
 * @param {string|null} options.joiningDate
 * @param {string} [options.playerName]
 */
export async function downloadPlayerReport({
  username,
  rangeKey,
  joiningDate = null,
  playerName = '',
}) {
  const safeUsername = String(username || '').trim();
  if (!safeUsername) throw new Error('Missing Chess.com username.');

  if (rangeKey === 'joining' && !joiningDate) {
    throw new Error('No joining date available for this player.');
  }

  const since = computeSinceDate(rangeKey, joiningDate);
  const periodLabel = rangeKey === 'joining' ? 'From Joining Date' : 'Last One Month';
  const periodSlug = rangeKey === 'joining' ? 'joining' : '1month';

  const [stats, achievements, games] = await Promise.all([
    fetchChessComGameStatsForRange(safeUsername, { since, all: false }),
    fetchChessComAchievements(safeUsername, { since, all: false }).catch(() => null),
    fetchAllGamesForRange(safeUsername, { since, all: false }),
  ]);

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CLIO';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { width: 22 },
    { width: 36 },
    { width: 18 },
    { width: 18 },
  ];

  const titleRow = summary.addRow(['Player Report']);
  summary.mergeCells(1, 1, 1, 4);
  applyCellStyle(titleRow.getCell(1), {
    fill: solidFill(PALETTE.titleBg),
    font: PALETTE.titleFg,
    bold: true,
  });
  titleRow.height = 28;

  [
    ['Player', playerName || safeUsername],
    ['Chess.com ID', safeUsername],
    ['Period', periodLabel],
    ['From date', since ? formatDate(since) : '—'],
    ['Generated', formatDate(new Date())],
  ].forEach(([label, value]) => {
    const row = summary.addRow([label, value]);
    applyCellStyle(row.getCell(1), { fill: solidFill(PALETTE.headerBg), bold: true });
    applyCellStyle(row.getCell(2), {});
  });

  summary.addRow([]);
  const statsHeader = summary.addRow(['Results', 'Value']);
  applyCellStyle(statsHeader.getCell(1), { fill: solidFill(PALETTE.headerBg), bold: true });
  applyCellStyle(statsHeader.getCell(2), { fill: solidFill(PALETTE.headerBg), bold: true });

  const totals = stats?.totals || { wins: 0, losses: 0, draws: 0 };
  [
    ['Total games', stats?.totalGames ?? 0],
    ['Wins', totals.wins ?? 0],
    ['Losses', totals.losses ?? 0],
    ['Draws', totals.draws ?? 0],
    ['Win rate', winRate(totals)],
    ['Rapid record', recordText(stats?.records?.rapid)],
    ['Blitz record', recordText(stats?.records?.blitz)],
    ['Bullet record', recordText(stats?.records?.bullet)],
    ['Daily record', recordText(stats?.records?.daily)],
    ['Best win streak', achievements?.winStreak?.highest ?? '—'],
    ['Brilliant moves', achievements?.brilliantMoves?.count ?? 0],
    ['Pioneer wins', achievements?.pioneerWins?.count ?? 0],
  ].forEach(([label, value], index) => {
    const row = summary.addRow([label, value]);
    const fill = index % 2 ? solidFill(PALETTE.altRow) : undefined;
    applyCellStyle(row.getCell(1), { fill, bold: true });
    applyCellStyle(row.getCell(2), { fill });
  });

  summary.addRow([]);
  const ratingHeader = summary.addRow(['Time class', 'Baseline', 'Current', 'Change']);
  for (let i = 1; i <= 4; i += 1) {
    applyCellStyle(ratingHeader.getCell(i), {
      fill: solidFill(PALETTE.headerBg),
      bold: true,
    });
  }

  ['bullet', 'blitz', 'rapid', 'daily'].forEach((tc, index) => {
    const block = achievements?.eloGain?.byTimeClass?.[tc] || {};
    const change = formatDelta(block.delta);
    const row = summary.addRow([
      tc.charAt(0).toUpperCase() + tc.slice(1),
      block.baseline ?? '—',
      block.current ?? '—',
      change,
    ]);
    const fill = index % 2 ? solidFill(PALETTE.altRow) : undefined;
    for (let i = 1; i <= 4; i += 1) applyCellStyle(row.getCell(i), { fill });
    if (String(change).startsWith('+')) {
      row.getCell(4).font = { ...row.getCell(4).font, color: { argb: PALETTE.win }, bold: true };
    } else if (String(change).startsWith('-')) {
      row.getCell(4).font = { ...row.getCell(4).font, color: { argb: PALETTE.loss }, bold: true };
    }
  });

  const milestones = achievements?.winStreak?.milestones || [];
  if (milestones.length) {
    summary.addRow([]);
    const achHeader = summary.addRow(['Win streak badge', 'Times earned']);
    applyCellStyle(achHeader.getCell(1), { fill: solidFill(PALETTE.headerBg), bold: true });
    applyCellStyle(achHeader.getCell(2), { fill: solidFill(PALETTE.headerBg), bold: true });
    milestones.forEach((m, index) => {
      const row = summary.addRow([m.label || 'Milestone', m.achieved ? m.times || 1 : 0]);
      const fill = index % 2 ? solidFill(PALETTE.altRow) : undefined;
      applyCellStyle(row.getCell(1), { fill });
      applyCellStyle(row.getCell(2), { fill });
    });
  }

  const gamesSheet = workbook.addWorksheet('Games');
  gamesSheet.columns = [
    { width: 16 },
    { width: 12 },
    { width: 10 },
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 28 },
  ];

  const gamesTitle = gamesSheet.addRow([`Games — ${periodLabel}`]);
  gamesSheet.mergeCells(1, 1, 1, 8);
  applyCellStyle(gamesTitle.getCell(1), {
    fill: solidFill(PALETTE.titleBg),
    font: PALETTE.titleFg,
    bold: true,
  });
  gamesTitle.height = 26;

  const gamesHeader = gamesSheet.addRow([
    'Date',
    'Time class',
    'Color',
    'Opponent',
    'Result',
    'Rating',
    'Accuracy',
    'URL',
  ]);
  for (let i = 1; i <= 8; i += 1) {
    applyCellStyle(gamesHeader.getCell(i), {
      fill: solidFill(PALETTE.headerBg),
      bold: true,
    });
  }

  games.forEach((game, index) => {
    const fill = index % 2 ? solidFill(PALETTE.altRow) : undefined;
    const opponent = game.isWhite ? game.black : game.white;
    const selfRating = game.isWhite ? game.whiteRating : game.blackRating;
    const selfAccuracy = game.isWhite ? game.whiteAccuracy : game.blackAccuracy;
    const row = gamesSheet.addRow([
      game.date || formatDate(game.playedAt),
      game.timeClass || '—',
      game.isWhite ? 'White' : 'Black',
      opponent || '—',
      game.resultType || '—',
      selfRating ?? '—',
      selfAccuracy ?? '—',
      game.url || '',
    ]);
    for (let i = 1; i <= 8; i += 1) applyCellStyle(row.getCell(i), { fill });
    const result = String(game.resultType || '').toLowerCase();
    if (result === 'win') {
      row.getCell(5).font = { ...row.getCell(5).font, color: { argb: PALETTE.win }, bold: true };
    } else if (result === 'loss') {
      row.getCell(5).font = { ...row.getCell(5).font, color: { argb: PALETTE.loss }, bold: true };
    }
  });

  if (!games.length) {
    const empty = gamesSheet.addRow(['No games found for this period.']);
    gamesSheet.mergeCells(empty.number, 1, empty.number, 8);
    applyCellStyle(empty.getCell(1), { font: PALETTE.muted });
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(
    `player-report_${safeUsername}_${periodSlug}_${today}.xlsx`
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

  return { filename, gameCount: games.length, stats };
}
