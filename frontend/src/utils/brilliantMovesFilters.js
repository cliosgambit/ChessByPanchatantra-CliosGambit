import { filterGamesByDay, VALID_DAY_FILTER_KEYS } from './allGamesFilters';

export const REVIEW_FILTER_OPTIONS = [
  { key: 'all', label: 'All reviews' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'not_reviewed', label: 'Not reviewed' },
];

export const BRILLIANT_FILTER_OPTIONS = [
  { key: 'all', label: 'All moves' },
  { key: 'brilliant', label: 'Brilliant' },
  { key: 'not_brilliant', label: 'Not brilliant' },
];

const VALID_REVIEW = new Set(REVIEW_FILTER_OPTIONS.map((f) => f.key));
const VALID_BRILLIANT = new Set(BRILLIANT_FILTER_OPTIONS.map((f) => f.key));

export function isRowReviewed(row) {
  const status = row?.verificationStatus || 'pending';
  return Boolean(row?.isReviewed) || status === 'approved' || status === 'rejected';
}

export function isRowHumanBrilliant(row) {
  return (row?.verificationStatus || 'pending') === 'approved';
}

export function resolveReviewFilter(searchParams) {
  const value = searchParams?.get?.('review') || searchParams?.review;
  return VALID_REVIEW.has(value) ? value : 'all';
}

export function resolveBrilliantFilter(searchParams) {
  const value = searchParams?.get?.('brilliant') || searchParams?.brilliant;
  return VALID_BRILLIANT.has(value) ? value : 'all';
}

export function resolveBrilliantDayFilter(searchParams) {
  const day = searchParams?.get?.('day') || searchParams?.day;
  // Match /all-games: missing day means today.
  return VALID_DAY_FILTER_KEYS.has(day) ? day : 'today';
}

export function filterBrilliantMoveRows(
  rows,
  { dayFilter = 'today', reviewFilter = 'all', brilliantFilter = 'all' } = {}
) {
  let next = filterGamesByDay(rows || [], dayFilter);

  if (reviewFilter === 'reviewed') {
    next = next.filter(isRowReviewed);
  } else if (reviewFilter === 'not_reviewed') {
    next = next.filter((row) => !isRowReviewed(row));
  }

  if (brilliantFilter === 'brilliant') {
    next = next.filter(isRowHumanBrilliant);
  } else if (brilliantFilter === 'not_brilliant') {
    next = next.filter((row) => !isRowHumanBrilliant(row));
  }

  return next;
}

/** Build query string for brilliant list/detail navigation (omits defaults). */
export function buildBrilliantMovesSearchParams({
  day = 'today',
  review = 'all',
  brilliant = 'all',
  view = null,
} = {}) {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  if (day && day !== 'today') params.set('day', day);
  if (review && review !== 'all') params.set('review', review);
  if (brilliant && brilliant !== 'all') params.set('brilliant', brilliant);
  return params;
}

export function brilliantMoveDetailPath(moveId, filters = {}) {
  const params = buildBrilliantMovesSearchParams(filters);
  const qs = params.toString();
  return qs ? `/brilliant-moves/${moveId}?${qs}` : `/brilliant-moves/${moveId}`;
}

export function brilliantMovesListPath(filters = {}) {
  const params = buildBrilliantMovesSearchParams({ ...filters, view: 'brilliant' });
  const qs = params.toString();
  return qs ? `/all-games?${qs}` : '/all-games?view=brilliant';
}
