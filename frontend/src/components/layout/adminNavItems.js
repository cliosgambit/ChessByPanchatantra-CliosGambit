import { FiGrid } from 'react-icons/fi';

export const NAVBAR_HEIGHT = 72;

export const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: FiGrid, end: true, roles: null },
];

export function filterNavByRole(items, user) {
  const role = (user?.role || 'guest').toLowerCase();
  return items.filter((item) => {
    if (!item.roles) return true;
    if (role === 'guest') return false;
    return item.roles.map((r) => r.toLowerCase()).includes(role);
  });
}
