const db = require('../config/database');

// Update activity_tracker for a player
exports.updateActivityTracker = async (req, res) => {
  const playerId = req.params.id;
  const { activity_tracker } = req.body;
  if (!activity_tracker) {
    return res.status(400).json({ error: 'Missing activity_tracker data' });
  }
  try {
    const result = await db.query(
      'UPDATE players SET activity_tracker = $1 WHERE "Chess_com_ID" = $2 RETURNING *',
      [activity_tracker, playerId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json({ message: 'Activity tracker updated', player: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
};

// Add this function to fetch all players for the activity tracker
exports.getAllPlayersForTracker = async (req, res) => {
  try {
    const result = await db.query('SELECT "Chess_com_ID", "Player_Name", activity_tracker FROM players ORDER BY "Player_Name" ASC');
    res.json({ players: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
}; 