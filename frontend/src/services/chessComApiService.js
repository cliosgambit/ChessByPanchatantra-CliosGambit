const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cacheKey(path) {
  return path;
}

function getCached(path) {
  const entry = cache.get(cacheKey(path));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(cacheKey(path));
    return null;
  }
  return entry.data;
}

function setCached(path, data) {
  cache.set(cacheKey(path), { data, ts: Date.now() });
}

async function fetchChessComJson(path) {
  const cached = getCached(path);
  if (cached) return cached;

  const response = await fetch(`https://api.chess.com${path}`, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) {
    const notFound = { notFound: true };
    setCached(path, notFound);
    return notFound;
  }

  if (!response.ok) {
    throw new Error(`Chess.com API error (${response.status})`);
  }

  const data = await response.json();
  setCached(path, data);
  return data;
}

function pickRecord(statsBlock) {
  const record = statsBlock?.record || {};
  return {
    wins: Number(record.win) || 0,
    losses: Number(record.loss) || 0,
    draws: Number(record.draw) || 0,
  };
}

function sumRecord(record) {
  return record.wins + record.losses + record.draws;
}

function winPercentage(record) {
  const total = sumRecord(record);
  if (!total) return 0;
  return Math.round((record.wins / total) * 100);
}

function formatRatingBlock(statsBlock) {
  if (!statsBlock) return null;
  return {
    current: statsBlock.last?.rating ?? null,
    best: statsBlock.best?.rating ?? null,
    record: pickRecord(statsBlock),
  };
}

function parseArchiveGames(archiveJson, username, limit = 10) {
  const games = archiveJson?.games || [];
  const lowerUser = username.toLowerCase();

  return games
    .slice()
    .reverse()
    .slice(0, limit)
    .map((game) => {
      const white = game.white?.username || '—';
      const black = game.black?.username || '—';
      const isWhite = white.toLowerCase() === lowerUser;
      const self = isWhite ? game.white : game.black;
      const opponent = isWhite ? black : white;
      let result = '—';
      if (self?.result === 'win') result = 'Win';
      else if (self?.result === 'lose') result = 'Loss';
      else if (self?.result === 'agreed' || self?.result === 'repetition' || self?.result === 'stalemate') {
        result = 'Draw';
      }

      const playedAt = game.end_time
        ? new Date(game.end_time * 1000)
        : game.start_time
          ? new Date(game.start_time * 1000)
          : null;

      return {
        opponent,
        result,
        date: playedAt
          ? playedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—',
        timeControl: game.time_class
          ? game.time_class.charAt(0).toUpperCase() + game.time_class.slice(1)
          : game.time_control || '—',
      };
    });
}

export async function fetchChessComProfile(username) {
  if (!username?.trim()) {
    return { linked: false, profile: null, error: null };
  }

  const safeName = username.trim();

  try {
    const profile = await fetchChessComJson(`/pub/player/${encodeURIComponent(safeName)}`);
    if (profile?.notFound) {
      return { linked: false, profile: null, error: 'Chess.com player not found.' };
    }

    const joinedDate = profile.joined
      ? new Date(profile.joined * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    return {
      linked: true,
      profile: {
        avatar: profile.avatar || null,
        username: profile.username || safeName,
        name: profile.name || null,
        country: profile.country || null,
        joinedDate,
        followers: profile.followers ?? null,
        league: profile.league || null,
        title: profile.title || null,
        lastOnline: profile.last_online
          ? new Date(profile.last_online * 1000).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : null,
        profileUrl: profile.url || `https://www.chess.com/member/${safeName}`,
      },
      error: null,
    };
  } catch (err) {
    return { linked: true, profile: null, error: err.message || 'Failed to load Chess.com profile.' };
  }
}

export async function fetchChessComStats(username) {
  if (!username?.trim()) {
    return { stats: null, error: null };
  }

  try {
    const raw = await fetchChessComJson(`/pub/player/${encodeURIComponent(username.trim())}/stats`);
    if (raw?.notFound) {
      return { stats: null, error: 'Chess.com stats not found.' };
    }

    const rapid = formatRatingBlock(raw.chess_rapid);
    const blitz = formatRatingBlock(raw.chess_blitz);
    const bullet = formatRatingBlock(raw.chess_bullet);
    const daily = formatRatingBlock(raw.chess_daily);
    const puzzle = raw.tactics?.highest ? { score: raw.tactics.highest.rating } : null;

    const totals = [rapid, blitz, bullet, daily].filter(Boolean).reduce(
      (acc, block) => {
        acc.wins += block.record.wins;
        acc.losses += block.record.losses;
        acc.draws += block.record.draws;
        return acc;
      },
      { wins: 0, losses: 0, draws: 0 }
    );

    return {
      stats: {
        rapid,
        blitz,
        bullet,
        daily,
        puzzleRush: raw.puzzle_rush?.best?.score ?? null,
        puzzleScore: puzzle?.score ?? null,
        totals,
        totalGames: sumRecord(totals),
        winPercentage: winPercentage(totals),
        records: {
          rapid: rapid?.record || { wins: 0, losses: 0, draws: 0 },
          blitz: blitz?.record || { wins: 0, losses: 0, draws: 0 },
          bullet: bullet?.record || { wins: 0, losses: 0, draws: 0 },
        },
        achievements: {
          highestRapid: rapid?.best ?? null,
          highestBlitz: blitz?.best ?? null,
          highestBullet: bullet?.best ?? null,
          highestPuzzle: puzzle?.score ?? raw.tactics?.highest?.rating ?? null,
        },
      },
      error: null,
    };
  } catch (err) {
    return { stats: null, error: err.message || 'Failed to load Chess.com stats.' };
  }
}

export async function fetchChessComRecentGames(username, limit = 10) {
  if (!username?.trim()) return { games: [], error: null };

  try {
    const archives = await fetchChessComJson(`/pub/player/${encodeURIComponent(username.trim())}/games/archives`);
    if (archives?.notFound || !archives?.archives?.length) {
      return { games: [], error: null };
    }

    const latestArchiveUrl = archives.archives[archives.archives.length - 1];
    const archivePath = latestArchiveUrl.replace('https://api.chess.com', '');
    const monthGames = await fetchChessComJson(archivePath);

    return {
      games: parseArchiveGames(monthGames, username.trim(), limit),
      error: null,
    };
  } catch (err) {
    return { games: [], error: err.message || 'Failed to load recent games.' };
  }
}

export async function fetchChessComBundle(username) {
  const profileRes = await fetchChessComProfile(username);
  const apiUsername = profileRes.profile?.username || username?.trim();

  const [statsRes, gamesRes] = await Promise.all([
    fetchChessComStats(apiUsername),
    fetchChessComRecentGames(apiUsername),
  ]);

  const errors = [profileRes.error, statsRes.error, gamesRes.error].filter(Boolean);

  return {
    ...profileRes,
    stats: statsRes.stats,
    recentGames: gamesRes.games,
    apiError: errors.length ? errors[0] : null,
  };
}
