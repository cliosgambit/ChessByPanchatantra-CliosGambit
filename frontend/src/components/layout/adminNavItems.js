import {
  FiGrid,
  FiUsers,
  FiUser,
  FiBookOpen,
  FiLayers,
  FiTarget,
} from 'react-icons/fi';

export const NAVBAR_HEIGHT = 72;

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: FiGrid, end: true, roles: null },
  { label: 'Users', path: '/users', icon: FiUsers, roles: ['admin'] },
  { label: 'Player Details', path: '/player-details', icon: FiUser, roles: ['admin', 'coach'] },
  { label: 'Curriculum', path: '/curriculum', icon: FiBookOpen, roles: ['admin'] },
  { label: 'Principles', path: '/principles', icon: FiLayers, roles: ['admin'] },
  { label: 'Chess Puzzles', path: '/chess-puzzles', icon: FiTarget, roles: ['admin', 'coach', 'student'] },
];

export function filterNavByRole(items, user) {
  const role = (user?.role || 'guest').toLowerCase();
  return items.filter((item) => {
    if (!item.roles) return true;
    if (role === 'guest') return false;
    return item.roles.map((r) => r.toLowerCase()).includes(role);
  });
}
