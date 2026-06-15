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

function formatTimeControlLabel(game) {
  const timeClass = game.time_class || '';
  const seconds = Number(game.time_control);
  if (timeClass === 'daily' || seconds >= 86400) {
    const days = seconds >= 86400 ? Math.round(seconds / 86400) : 1;
    return `${days} d`;
  }
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  if (seconds > 0) return `${seconds} sec`;
  if (timeClass) return timeClass.charAt(0).toUpperCase() + timeClass.slice(1);
  return '—';
}

function countMovesFromPgn(pgn) {
  if (!pgn) return null;
  const movetext = pgn.split('\n\n').pop() || '';
  const pairs = movetext.match(/\d+\.\s*[^\s]+\s+[^\s]+/g);
  return pairs ? pairs.length : null;
}

function selfGameOutcome(selfResult) {
  if (selfResult === 'win') return { result: 'Win', resultType: 'win' };
  if (
    selfResult === 'lose' ||
    selfResult === 'resigned' ||
    selfResult === 'timeout' ||
    selfResult === 'abandoned' ||
    selfResult === 'checkmated'
  ) {
    return { result: 'Loss', resultType: 'loss' };
  }
  if (
    selfResult === 'agreed' ||
    selfResult === 'repetition' ||
    selfResult === 'stalemate' ||
    selfResult === 'draw' ||
    selfResult === 'insufficient'
  ) {
    return { result: 'Draw', resultType: 'draw' };
  }
  return { result: '—', resultType: 'neutral' };
}

function resultNotationForUser(game, username) {
  const lowerUser = username.toLowerCase();
  const isWhite = game.white?.username?.toLowerCase() === lowerUser;
  const self = isWhite ? game.white : game.black;
  const { resultType } = selfGameOutcome(self?.result);
  if (resultType === 'win') return isWhite ? '1-0' : '0-1';
  if (resultType === 'loss') return isWhite ? '0-1' : '1-0';
  if (resultType === 'draw') return '½-½';
  return '—';
}

function playerScoreFromResult(result) {
  if (result === 'win') return '1';
  if (
    result === 'lose' ||
    result === 'checkmated' ||
    result === 'timeout' ||
    result === 'resigned' ||
    result === 'abandoned'
  ) {
    return '0';
  }
  if (
    result === 'agreed' ||
    result === 'repetition' ||
    result === 'stalemate' ||
    result === 'draw' ||
    result === 'insufficient' ||
    result === '50move' ||
    result === 'timevsinsufficient'
  ) {
    return '½';
  }
  return '—';
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
      const { result, resultType } = selfGameOutcome(self?.result);

      const playedAt = game.end_time
        ? new Date(game.end_time * 1000)
        : game.start_time
          ? new Date(game.start_time * 1000)
          : null;

      return {
        opponent,
        opponentRating: isWhite ? game.black?.rating : game.white?.rating,
        selfRating: self?.rating ?? null,
        white,
        black,
        whiteRating: game.white?.rating ?? null,
        blackRating: game.black?.rating ?? null,
        isWhite,
        result,
        resultType,
        resultNotation: resultNotationForUser(game, username),
        accuracySelf: isWhite ? game.accuracies?.white : game.accuracies?.black,
        accuracyOpponent: isWhite ? game.accuracies?.black : game.accuracies?.white,
        whiteAccuracy: game.accuracies?.white ?? null,
        blackAccuracy: game.accuracies?.black ?? null,
        whiteCountryCode: countryCodeFromUrl(game.white?.country),
        blackCountryCode: countryCodeFromUrl(game.black?.country),
        whiteScore: playerScoreFromResult(game.white?.result),
        blackScore: playerScoreFromResult(game.black?.result),
        hasAccuracy:
          game.accuracies?.white != null && game.accuracies?.black != null,
        moves: countMovesFromPgn(game.pgn),
        gameUrl: game.url || null,
        rated: Boolean(game.rated),
        date: playedAt
          ? playedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—',
        timeControl: formatTimeControlLabel(game),
        timeClass: game.time_class || null,
        pgn: game.pgn || null,
        uuid: game.uuid || null,
      };
    });
}

function countryCodeFromUrl(countryUrl) {
  if (!countryUrl) return null;
  const code = String(countryUrl).split('/').pop();
  return code ? code.toUpperCase() : null;
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

    const countryCode = countryCodeFromUrl(profile.country);
    const lastOnlineTs = profile.last_online ? profile.last_online * 1000 : null;
    const isOnline = lastOnlineTs ? Date.now() - lastOnlineTs < 5 * 60 * 1000 : false;

    const statusLabels = {
      premium: 'Diamond Member',
      gold: 'Gold Member',
      basic: 'Member',
      closed: 'Closed',
    };

    return {
      linked: true,
      profile: {
        avatar: profile.avatar || null,
        username: profile.username || safeName,
        name: profile.name || null,
        country: profile.country || null,
        countryCode,
        location: profile.location || null,
        joinedDate,
        followers: profile.followers ?? null,
        league: profile.league || null,
        title: profile.title || null,
        status: profile.status || null,
        statusLabel: statusLabels[profile.status] || profile.status || null,
        verified: Boolean(profile.verified),
        isStreamer: Boolean(profile.is_streamer),
        twitchUrl: profile.twitch_url || null,
        isOnline,
        lastOnline: lastOnlineTs
          ? new Date(lastOnlineTs).toLocaleString('en-US', {
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

export async function fetchChessComRecentGames(username, limit = 25) {
  if (!username?.trim()) return { games: [], totalGames: 0, error: null };

  try {
    const archives = await fetchChessComJson(`/pub/player/${encodeURIComponent(username.trim())}/games/archives`);
    if (archives?.notFound || !archives?.archives?.length) {
      return { games: [], totalGames: 0, error: null };
    }

    const recentArchiveUrls = archives.archives.slice(-3).reverse();
    const collected = [];

    for (const archiveUrl of recentArchiveUrls) {
      if (collected.length >= limit) break;
      const archivePath = archiveUrl.replace('https://api.chess.com', '');
      const monthGames = await fetchChessComJson(archivePath);
      const parsed = parseArchiveGames(monthGames, username.trim(), limit - collected.length);
      collected.push(...parsed);
    }

    const totalGames = archives.archives.length
      ? await countTotalGames(username.trim(), archives.archives)
      : 0;

    return {
      games: collected.slice(0, limit),
      totalGames,
      error: null,
    };
  } catch (err) {
    return { games: [], totalGames: 0, error: err.message || 'Failed to load recent games.' };
  }
}

async function countTotalGames(username, archiveUrls) {
  const recent = archiveUrls.slice(-6);
  let total = 0;
  await Promise.all(
    recent.map(async (url) => {
      const path = url.replace('https://api.chess.com', '');
      const data = await fetchChessComJson(path);
      total += data?.games?.length ?? 0;
    })
  );
  if (archiveUrls.length > 6) {
    total = Math.round((total / 6) * archiveUrls.length);
  }
  return total;
}

export async function fetchChessComClubs(username) {
  if (!username?.trim()) return { clubs: [], error: null };

  try {
    const raw = await fetchChessComJson(`/pub/player/${encodeURIComponent(username.trim())}/clubs`);
    if (raw?.notFound) return { clubs: [], error: null };

    const clubs = (raw.clubs || []).map((club) => ({
      name: club.name,
      url: club.url,
      icon: club.icon || null,
      members: club.members ?? null,
    }));

    return { clubs, error: null };
  } catch (err) {
    return { clubs: [], error: err.message || 'Failed to load clubs.' };
  }
}

function archiveMetaFromUrl(url) {
  const match = String(url).match(/(\d{4})\/(\d{2})$/);
  if (!match) {
    return { month: url, label: url, path: url.replace('https://api.chess.com', '') };
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    month: `${match[1]}-${match[2]}`,
    label: new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
    path: url.replace('https://api.chess.com', ''),
  };
}

export async function fetchChessComArchives(username) {
  if (!username?.trim()) {
    return { archives: [], error: null };
  }

  try {
    const raw = await fetchChessComJson(
      `/pub/player/${encodeURIComponent(username.trim())}/games/archives`
    );
    if (raw?.notFound) {
      return { archives: [], error: 'Monthly archives not found.' };
    }

    const archives = (raw.archives || []).map((url) => ({
      url,
      ...archiveMetaFromUrl(url),
    }));

    return { archives, error: null };
  } catch (err) {
    return { archives: [], error: err.message || 'Failed to load monthly archives.' };
  }
}

export async function fetchChessComMonthlyGames(username, maxMonths = 12) {
  if (!username?.trim()) {
    return { months: [], error: null };
  }

  try {
    const { archives, error: archivesError } = await fetchChessComArchives(username);
    if (archivesError) {
      return { months: [], error: archivesError };
    }
    if (!archives.length) {
      return { months: [], error: null };
    }

    const recent = archives.slice(-maxMonths).reverse();
    const months = await Promise.all(
      recent.map(async (archive) => {
        const data = await fetchChessComJson(archive.path);
        const games = parseArchiveGames(data, username.trim(), 200);
        return {
          month: archive.month,
          label: archive.label,
          archiveUrl: archive.url,
          gameCount: data?.games?.length ?? 0,
          games,
        };
      })
    );

    return { months, error: null };
  } catch (err) {
    return { months: [], error: err.message || 'Failed to load month-wise games.' };
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
