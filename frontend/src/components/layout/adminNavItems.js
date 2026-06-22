import { FiCalendar, FiGrid, FiTarget, FiUsers, FiZap } from 'react-icons/fi';

export const NAVBAR_HEIGHT = 72;

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: FiGrid, end: true, roles: null },
  { label: 'Players', path: '/players', icon: FiUsers, roles: ['admin'] },
  { label: 'All Games', path: '/all-games', icon: FiCalendar, roles: ['admin'] },
  { label: 'Brilliant Moves', path: '/brilliant-moves', icon: FiZap, roles: ['admin'] },
  { label: 'Puzzles', path: '/puzzles', icon: FiTarget, roles: ['admin'] },
];

export function filterNavByRole(items, user) {
  const role = (user?.role || 'guest').toLowerCase();
  return items.filter((item) => {
    if (!item.roles) return true;
    if (role === 'guest') return false;
    return item.roles.map((r) => r.toLowerCase()).includes(role);
  });
}
