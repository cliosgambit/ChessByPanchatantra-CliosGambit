import { FiBookOpen, FiCompass, FiFeather, FiUsers } from 'react-icons/fi';

/** Dashboard feature cards — colors and copy match the Panchatantra admin design. */
export const DASHBOARD_SECTIONS = [
  {
    id: 'chronicles',
    label: 'Chronicles',
    description: 'Browse modules, stories, principles, and puzzles in one curriculum hub.',
    path: '/chronicles',
    bgColor: '#FCE7F3',
    iconBg: '#DB2777',
    textColor: '#9D174D',
    icon: FiFeather,
    roles: ['admin'],
  },
  {
    id: 'curriculum',
    label: 'Curriculum',
    description: 'Manage learning paths, game rules levels, and step-by-step chess courses.',
    path: '/curriculum',
    bgColor: '#EDE9FE',
    iconBg: '#7C3AED',
    textColor: '#5B21B6',
    icon: FiBookOpen,
    roles: ['admin'],
  },
  {
    id: 'principles',
    label: 'Principles',
    description: 'Configure strategic tactical guidelines derived from historic Panchatantra texts.',
    path: '/principles',
    bgColor: '#FEF3C7',
    iconBg: '#EA580C',
    textColor: '#9A3412',
    icon: FiCompass,
    roles: ['admin'],
  },
  {
    id: 'users',
    label: 'Players',
    description: 'View player database roster, tracking progression ratings, and match histories.',
    path: '/players',
    bgColor: '#E0F2FE',
    iconBg: '#0284C7',
    textColor: '#0C4A6E',
    icon: FiUsers,
    roles: ['admin'],
  },
];
