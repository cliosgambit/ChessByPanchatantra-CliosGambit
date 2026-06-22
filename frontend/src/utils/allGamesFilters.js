export const DEFAULT_ALL_GAMES_TIME_ZONE = 'Asia/Kolkata';

export const DAY_FILTER_OPTIONS = [
  { key: 'today', labelPrefix: "Today's Games" },
  { key: 'yesterday', labelPrefix: "Yesterday's Games" },
  { key: 'day_before', labelPrefix: 'Day Before Yesterday' },
  { key: 'all', labelPrefix: 'All Days Games' },
];

export const VALID_DAY_FILTER_KEYS = new Set(DAY_FILTER_OPTIONS.map((filter) => filter.key));

export function resolveDayFilter(searchParams) {
  const day = searchParams.get('day');
  return VALID_DAY_FILTER_KEYS.has(day) ? day : 'all';
}

export function dayFilterButtonLabel(filter, filterLabels) {
  if (filter.key === 'all') return filterLabels.all;
  const date = filterLabels[filter.key];
  return date ? `${filter.labelPrefix} (${date})` : filter.labelPrefix;
}

export function panelTitleForDayFilter(filterKey, filterLabels) {
  const match =
    DAY_FILTER_OPTIONS.find((filter) => filter.key === filterKey) ||
    DAY_FILTER_OPTIONS[DAY_FILTER_OPTIONS.length - 1];
  return dayFilterButtonLabel(match, filterLabels);
}

export function formatDayLabelInTz(timeZone, daysAgo = 0) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const local = new Date(get('year'), get('month') - 1, get('day') - daysAgo);
  return local.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildFilterLabels(timeZone = DEFAULT_ALL_GAMES_TIME_ZONE) {
  return {
    today: formatDayLabelInTz(timeZone, 0),
    yesterday: formatDayLabelInTz(timeZone, 1),
    day_before: formatDayLabelInTz(timeZone, 2),
    all: 'All Days',
  };
}

function getDateKeyInTz(iso, timeZone) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-CA', { timeZone });
}

function getTargetDateKey(timeZone, daysAgo) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const local = new Date(get('year'), get('month') - 1, get('day') - daysAgo);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function filterItemsByDay(items, filterKey, dateField = 'playedAt', timeZone = DEFAULT_ALL_GAMES_TIME_ZONE) {
  if (!items?.length) return [];
  if (filterKey === 'all') return items;

  const daysAgo = filterKey === 'today' ? 0 : filterKey === 'yesterday' ? 1 : 2;
  const targetKey = getTargetDateKey(timeZone, daysAgo);

  return items.filter((item) => getDateKeyInTz(item?.[dateField], timeZone) === targetKey);
}

/** @deprecated Use filterItemsByDay */
export function filterGamesByDay(allGames, filterKey, timeZone = DEFAULT_ALL_GAMES_TIME_ZONE) {
  return filterItemsByDay(allGames, filterKey, 'playedAt', timeZone);
}

export function mergeAllGames(existingGames, incomingGames) {
  const byUuid = new Map();

  for (const game of existingGames || []) {
    if (game?.uuid) byUuid.set(game.uuid, game);
  }

  for (const game of incomingGames || []) {
    if (game?.uuid) byUuid.set(game.uuid, game);
  }

  return Array.from(byUuid.values()).sort((a, b) => {
    const aTime = a.playedAt ? new Date(a.playedAt).getTime() : 0;
    const bTime = b.playedAt ? new Date(b.playedAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function filterLabelForKey(filterKey, filterLabels) {
  if (filterKey === 'all') return filterLabels.all;
  return filterLabels[filterKey] || filterLabels.all;
}
