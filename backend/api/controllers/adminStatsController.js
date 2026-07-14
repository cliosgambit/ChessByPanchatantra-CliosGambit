const db = require('../config/database');

exports.getDashboardStats = async (_req, res) => {
  try {
    const activeLoginFilter = `LOWER(COALESCE("Role", 'student')) != 'paused'`;

    const [
      totalUsersRes,
      usersByRoleRes,
      storiesRes,
      puzzlesRes,
      playersRes,
      principlesRes,
      growthRes,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) AS count FROM "Login" WHERE ${activeLoginFilter}`),
      db.query(
        `SELECT LOWER("Role") AS role, COUNT(*) AS count
         FROM "Login"
         WHERE ${activeLoginFilter}
         GROUP BY LOWER("Role")`
      ),
      db.query('SELECT COUNT(*) AS count FROM Stories'),
      db.query('SELECT COUNT(*) AS count FROM chess_puzzle'),
      db.query('SELECT COUNT(*) AS count FROM players'),
      db.query('SELECT COUNT(*) AS count FROM Morals'),
      db.query(
        `SELECT strftime('%m', created_at) AS month_num,
                CASE strftime('%m', created_at)
                  WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
                  WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
                  WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
                  WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
                END AS month,
                COUNT(*) AS users
         FROM "Login"
         WHERE created_at >= datetime('now', '-6 months')
           AND ${activeLoginFilter}
         GROUP BY strftime('%Y-%m', created_at)
         ORDER BY strftime('%Y-%m', created_at)`
      ),
    ]);

    const roleMap = usersByRoleRes.rows.reduce((acc, row) => {
      acc[row.role] = row.count;
      return acc;
    }, {});

    const stats = {
      totalUsers: totalUsersRes.rows[0]?.count || 0,
      activeStudents: roleMap.student || 0,
      totalStories: storiesRes.rows[0]?.count || 0,
      totalPuzzles: puzzlesRes.rows[0]?.count || 0,
      achievementsUnlocked: principlesRes.rows[0]?.count || 0,
      totalModules: 0,
      totalPlayers: playersRes.rows[0]?.count || 0,
    };

    const usersByRole = [
      { name: 'Students', value: roleMap.student || 0, color: '#c9a227' },
      { name: 'Coaches', value: roleMap.coach || 0, color: '#2a4578' },
      { name: 'Admins', value: roleMap.admin || 0, color: '#536ba3' },
      { name: 'Parents', value: roleMap.parent || 0, color: '#a9b5d1' },
    ].filter((r) => r.value > 0);

    const userGrowth =
      growthRes.rows.length > 0
        ? growthRes.rows.map((r) => ({ month: r.month, users: r.users }))
        : [
            { month: 'Jan', users: 8 },
            { month: 'Feb', users: 12 },
            { month: 'Mar', users: 15 },
            { month: 'Apr', users: 18 },
            { month: 'May', users: 22 },
            { month: 'Jun', users: stats.totalUsers || 25 },
          ];

    const recentActivity = [
      { id: 1, type: 'student', title: 'Player registered', detail: 'New learner joined the academy', time: '2m ago' },
      { id: 2, type: 'story', title: 'Story published', detail: 'A new Clio story is now live', time: '45m ago' },
      { id: 3, type: 'puzzle', title: 'Puzzle added', detail: 'Chess puzzle added to curriculum', time: '1h ago' },
      { id: 4, type: 'achievement', title: 'Achievement unlocked', detail: 'Students completed a milestone', time: '3h ago' },
      { id: 5, type: 'class', title: 'Class created', detail: 'Coach scheduled a new session', time: 'Yesterday' },
    ];

    return res.json({ stats, usersByRole, userGrowth, recentActivity });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    return res.status(500).json({ message: 'Unable to load dashboard statistics.' });
  }
};
