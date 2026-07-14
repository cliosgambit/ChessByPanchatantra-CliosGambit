import { FiGrid, FiDatabase, FiZap, FiLayers } from 'react-icons/fi';

export const NAVBAR_HEIGHT = 76;

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: FiGrid, end: true, roles: null },
  { label: 'Brilliant Moves', path: '/brilliant-moves', icon: FiZap, end: false, roles: ['admin'] },
  { label: 'All Games', path: '/all-games', icon: FiLayers, end: false, roles: ['admin'] },
  { label: 'Tables', path: '/tables', icon: FiDatabase, end: false, roles: ['admin'] },
];

export function filterNavByRole(items, user) {
  const role = (user?.role || 'guest').toLowerCase();
  return items.filter((item) => {
    if (!item.roles) return true;
    if (role === 'guest') return false;
    return item.roles.map((r) => r.toLowerCase()).includes(role);
  });
}
