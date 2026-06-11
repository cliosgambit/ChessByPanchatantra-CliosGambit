import { countTable, fetchTable } from '../lib/supabase/crud';
import { col } from '../lib/supabase/columnMapper';
import { withRetry } from '../utils/retry';

const ROLE_COLORS = {
  Students: '#0f1729',
  Coaches: '#c9a227',
  Admins: '#5a6b8a',
  Paused: '#94a3b8',
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Recently';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins || 1} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export async function fetchDashboardStats() {
  const [
    totalUsers,
    totalStories,
    totalPuzzles,
    brilliantMoves,
    loginRows,
    recentBrilliant,
    recentStories,
  ] = await withRetry(() =>
    Promise.all([
      countTable('Login'),
      countTable('story'),
      countTable('chess_puzzle'),
      countTable('brilliant_moves'),
      fetchTable('Login', { select: 'Role' }),
      fetchTable('brilliant_moves', { select: 'player_name, created_at, move_san', orderBy: 'created_at', ascending: false }).catch(() => []),
      fetchTable('story', { select: 'title, status', orderBy: 'story_id', ascending: false }).catch(() => []),
    ])
  );

  const roleCounts = { student: 0, coach: 0, admin: 0, paused: 0 };
  for (const row of loginRows) {
    const role = (col(row, 'Role', 'role') || 'student').toLowerCase();
    if (roleCounts[role] != null) roleCounts[role] += 1;
    else roleCounts.student += 1;
  }

  const activeStudents = roleCounts.student;

  const roleDistribution = [
    { name: 'Students', value: roleCounts.student, color: ROLE_COLORS.Students },
    { name: 'Coaches', value: roleCounts.coach, color: ROLE_COLORS.Coaches },
    { name: 'Admins', value: roleCounts.admin, color: ROLE_COLORS.Admins },
  ].filter((r) => r.value > 0);

  const recentActivity = [];

  for (const row of (recentBrilliant || []).slice(0, 3)) {
    recentActivity.push({
      id: `bm-${col(row, 'player_name')}-${col(row, 'created_at')}`,
      text: `Brilliant move by ${col(row, 'player_name')} (${col(row, 'move_san')})`,
      time: formatRelativeTime(col(row, 'created_at')),
      type: 'achievement',
    });
  }

  for (const row of (recentStories || []).slice(0, 2)) {
    recentActivity.push({
      id: `story-${col(row, 'title')}`,
      text: `Story: ${col(row, 'title')} (${col(row, 'status') || 'published'})`,
      time: 'Recently',
      type: 'story',
    });
  }

  if (recentActivity.length === 0) {
    recentActivity.push({
      id: 'sync',
      text: `${totalUsers} users in academy`,
      time: 'Live',
      type: 'student',
    });
  }

  const growthData = buildGrowthEstimate(totalUsers);

  return {
    statCards: [
      { key: 'users', label: 'Total Users', value: String(totalUsers), growth: 'Live', icon: 'users' },
      { key: 'students', label: 'Active Students', value: String(activeStudents), growth: 'Live', icon: 'students' },
      { key: 'stories', label: 'Total Stories', value: String(totalStories), growth: 'Live', icon: 'stories' },
      { key: 'puzzles', label: 'Total Puzzles', value: String(totalPuzzles), growth: 'Live', icon: 'puzzles' },
      { key: 'achievements', label: 'Brilliant Moves', value: String(brilliantMoves), growth: 'Live', icon: 'achievements' },
    ],
    roleDistribution,
    recentActivity: recentActivity.slice(0, 5),
    growthData,
    totalUsers,
    activeStudents,
    totalStories,
    totalPuzzles,
    brilliantMoves,
  };
}

function buildGrowthEstimate(totalUsers) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const step = totalUsers / months.length;
  return months.map((month, i) => ({
    month,
    users: Math.round(step * (i + 1)),
  }));
}
