import { FiGrid, FiTarget, FiUsers, FiZap, FiClipboard } from 'react-icons/fi';
import { GiCrossedSwords } from 'react-icons/gi';

export const NAVBAR_HEIGHT = 76;

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: FiGrid, end: true, roles: null },
  { label: 'Players', path: '/players', icon: FiUsers, roles: ['admin'] },
  { label: 'All Games', path: '/all-games', icon: GiCrossedSwords, roles: ['admin'] },
  { label: 'Brilliant Moves', path: '/brilliant-moves', icon: FiZap, roles: ['admin'] },
  { label: 'Puzzles', path: '/puzzles', icon: FiTarget, roles: ['admin'] },
  { label: 'Test', path: '/test', icon: FiClipboard, roles: ['admin'] },
];

export function filterNavByRole(items, user) {
  const role = (user?.role || 'guest').toLowerCase();
  return items.filter((item) => {
    if (!item.roles) return true;
    if (role === 'guest') return false;
    return item.roles.map((r) => r.toLowerCase()).includes(role);
  });
}
