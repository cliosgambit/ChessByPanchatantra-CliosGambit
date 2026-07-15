import {
  FiGrid,
  FiDatabase,
  FiZap,
  FiLayers,
  FiBook,
  FiBookOpen,
  FiUsers,
  FiSettings,
  FiHome,
} from 'react-icons/fi';

/** Legacy top-bar height — top nav removed; kept at 0 for existing layout math. */
export const NAVBAR_HEIGHT = 0;

export const SIDEBAR_WIDTH = 200;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: FiHome, end: true, roles: null },
  { label: 'Modules', path: '/modules', icon: FiBook, end: false, roles: null },
  { label: 'Library', path: '/library', icon: FiBookOpen, end: false, roles: ['admin'] },
  { label: 'Puzzles', path: '/puzzles', icon: FiGrid, end: false, roles: null },
  { label: 'Students', path: '/students', icon: FiUsers, end: false, roles: ['admin'] },
  { label: 'Brilliant Moves', path: '/brilliant-moves', icon: FiZap, end: false, roles: ['admin'] },
  { label: 'All Games', path: '/all-games', icon: FiLayers, end: false, roles: ['admin'] },
  { label: 'Tables', path: '/tables', icon: FiDatabase, end: false, roles: ['admin'] },
  { label: 'Settings', path: '/settings', icon: FiSettings, end: false, roles: null },
];

export function filterNavByRole(items, user) {
  const role = (user?.role || 'guest').toLowerCase();
  return items.filter((item) => {
    if (!item.roles) return true;
    if (role === 'guest') return false;
    return item.roles.map((r) => r.toLowerCase()).includes(role);
  });
}
