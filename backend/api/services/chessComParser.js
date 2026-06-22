function countryCodeFromUrl(countryUrl) {
  if (!countryUrl) return null;
  const code = String(countryUrl).split('/').pop();
  return code ? code.toUpperCase() : null;
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
    selfResult === 'insufficient' ||
    selfResult === '50move' ||
    selfResult === 'timevsinsufficient'
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

function parseProfile(raw, safeName) {
  const joinedDate = raw.joined ? new Date(raw.joined * 1000) : null;
  const countryCode = countryCodeFromUrl(raw.country);
  const lastOnlineTs = raw.last_online ? raw.last_online * 1000 : null;
  const isOnline = lastOnlineTs ? Date.now() - lastOnlineTs < 5 * 60 * 1000 : false;
  const statusLabels = {
    premium: 'Diamond Member',
    gold: 'Gold Member',
    basic: 'Member',
    closed: 'Closed',
  };

  return {
    avatar: raw.avatar || null,
    username: raw.username || safeName,
    name: raw.name || null,
    country: raw.country || null,
    countryCode,
    location: raw.location || null,
    joinedDate: joinedDate
      ? joinedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null,
    joinedAt: joinedDate,
    followers: raw.followers ?? null,
    league: raw.league || null,
    title: raw.title || null,
    status: raw.status || null,
    statusLabel: statusLabels[raw.status] || raw.status || null,
    verified: Boolean(raw.verified),
    isStreamer: Boolean(raw.is_streamer),
    twitchUrl: raw.twitch_url || null,
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
    lastOnlineAt: lastOnlineTs ? new Date(lastOnlineTs) : null,
    profileUrl: raw.url || `https://www.chess.com/member/${safeName}`,
    raw,
  };
}

function parseStats(raw) {
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
    raw,
  };
}

function parseRawGame(game, username) {
  const white = game.white?.username || '—';
  const black = game.black?.username || '—';
  const isWhite = white.toLowerCase() === username.toLowerCase();
  const self = isWhite ? game.white : game.black;
  const opponent = isWhite ? black : white;
  const { result, resultType } = selfGameOutcome(self?.result);

  const playedAt = game.end_time
    ? new Date(game.end_time * 1000)
    : game.start_time
      ? new Date(game.start_time * 1000)
      : null;

  return {
    chess_com_uuid: game.uuid,
    game_url: game.url || null,
    played_at: playedAt,
    time_class: game.time_class || null,
    time_control: Number(game.time_control) || null,
    time_control_label: formatTimeControlLabel(game),
    rated: Boolean(game.rated),
    pgn: game.pgn || '',
    white_username: white,
    black_username: black,
    white_rating: game.white?.rating ?? null,
    black_rating: game.black?.rating ?? null,
    white_result: game.white?.result ?? null,
    black_result: game.black?.result ?? null,
    white_accuracy: game.accuracies?.white ?? null,
    black_accuracy: game.accuracies?.black ?? null,
    white_country_code: countryCodeFromUrl(game.white?.country),
    black_country_code: countryCodeFromUrl(game.black?.country),
    white_score: playerScoreFromResult(game.white?.result),
    black_score: playerScoreFromResult(game.black?.result),
    self_color: isWhite ? 'white' : 'black',
    self_result: result,
    self_result_type: resultType,
    result_notation: resultNotationForUser(game, username),
    opponent_username: opponent,
    move_count: countMovesFromPgn(game.pgn),
    game_json: game,
    // UI shape
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
    hasAccuracy: game.accuracies?.white != null && game.accuracies?.black != null,
    moves: countMovesFromPgn(game.pgn),
    gameUrl: game.url || null,
    date: playedAt
      ? playedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—',
    timeControl: formatTimeControlLabel(game),
    uuid: game.uuid || null,
  };
}

function archiveMetaFromUrl(url) {
  const match = String(url).match(/(\d{4})\/(\d{2})$/);
  if (!match) {
    return { month: url, label: url, path: url.replace('https://api.chess.com', ''), year: null, monthNum: null };
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
    year,
    monthNum: Number(match[2]),
  };
}

function mapDbGameRow(row) {
  const isWhite = row.self_color === 'white';
  return {
    uuid: row.chess_com_uuid,
    chessComId: row.chess_com_id,
    playedAt: row.played_at ? new Date(row.played_at).toISOString() : null,
    opponent: row.opponent_username,
    opponentRating: isWhite ? row.black_rating : row.white_rating,
    selfRating: isWhite ? row.white_rating : row.black_rating,
    white: row.white_username,
    black: row.black_username,
    whiteRating: row.white_rating,
    blackRating: row.black_rating,
    isWhite,
    result: row.self_result,
    resultType: row.self_result_type,
    resultNotation: row.result_notation,
    accuracySelf: isWhite ? row.white_accuracy : row.black_accuracy,
    accuracyOpponent: isWhite ? row.black_accuracy : row.white_accuracy,
    whiteAccuracy: row.white_accuracy,
    blackAccuracy: row.black_accuracy,
    whiteCountryCode: row.white_country_code,
    blackCountryCode: row.black_country_code,
    whiteScore: row.white_score,
    blackScore: row.black_score,
    hasAccuracy: row.white_accuracy != null && row.black_accuracy != null,
    moves: row.move_count,
    gameUrl: row.game_url,
    rated: row.rated,
    date: row.played_at
      ? new Date(row.played_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—',
    timeControl: row.time_control_label || '—',
    timeClass: row.time_class,
    pgn: row.pgn,
  };
}

function mapDbMoveRow(row) {
  return {
    ply: row.ply,
    moveNumber: row.move_number,
    color: row.color,
    san: row.san,
    from: row.from_square,
    to: row.to_square,
    piece: row.piece,
    captured: row.captured,
    promotion: row.promotion,
    before: row.fen_before,
    after: row.fen_after,
    isCheck: row.is_check,
    isMate: row.is_mate,
    isCapture: row.is_capture,
    isCastle: row.is_castle,
    isEnPassant: row.is_en_passant,
    isPromotion: row.is_promotion,
  };
}

function mapDbProfileRow(row) {
  if (!row) return null;
  const profileJson = row.profile_json || {};
  const statsJson = row.stats_json || {};
  const statusLabels = {
    premium: 'Diamond Member',
    gold: 'Gold Member',
    basic: 'Member',
    closed: 'Closed',
  };

  return {
    profile: {
      avatar: row.avatar_url,
      username: row.username,
      name: row.name,
      country: row.country_url,
      countryCode: row.country_code,
      location: row.location,
      joinedDate: row.joined_at
        ? new Date(row.joined_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : profileJson.joinedDate || null,
      followers: row.followers,
      league: row.league,
      title: row.title,
      status: row.membership_status,
      statusLabel: statusLabels[row.membership_status] || row.membership_status,
      verified: row.verified,
      isStreamer: row.is_streamer,
      twitchUrl: row.twitch_url,
      isOnline: row.is_online,
      lastOnline: row.last_online_at
        ? new Date(row.last_online_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : null,
      profileUrl: row.profile_url,
    },
    stats: statsJson && Object.keys(statsJson).length ? statsJson : null,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    totalGames: row.total_games_estimate || 0,
  };
}

module.exports = {
  countryCodeFromUrl,
  parseProfile,
  parseStats,
  parseRawGame,
  archiveMetaFromUrl,
  mapDbGameRow,
  mapDbMoveRow,
  mapDbProfileRow,
  formatTimeControlLabel,
};
