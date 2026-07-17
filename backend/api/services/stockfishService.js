const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const STOCKFISH_EXE = path.join(__dirname, '../../../stockfish/stockfish-windows-x86-64-avx2.exe');

class PersistentStockfish {
  constructor() {
    this.exePath = STOCKFISH_EXE;
    this.proc = null;
    this.queue = [];
    this.isProcessing = false;
    this.stdoutBuffer = '';
    this.currentTask = null;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.proc && !this.proc.killed) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      if (!fs.existsSync(this.exePath)) {
        return reject(new Error(`Stockfish not found at ${this.exePath}`));
      }

      this.proc = spawn(this.exePath);
      this.proc.stdin.setEncoding('utf-8');

      this.proc.stdout.on('data', (data) => {
        this.stdoutBuffer += data.toString();
        this.processBuffer();
      });

      this.proc.on('error', (err) => {
        if (this.currentTask) {
          this.currentTask.reject(err);
          this.cleanupTask();
        }
      });

      this.proc.on('exit', () => {
        this.proc = null;
        this.initPromise = null;
        if (this.currentTask) {
          this.currentTask.reject(new Error('Engine exited unexpectedly'));
          this.cleanupTask();
        }
      });

      this.send('uci');
      this.send('isready');

      const checkReady = (data) => {
        if (data.toString().includes('readyok')) {
          this.proc.stdout.removeListener('data', checkReady);
          resolve();
        }
      };
      this.proc.stdout.on('data', checkReady);
    });

    return this.initPromise;
  }

  send(cmd) {
    if (this.proc && this.proc.stdin.writable) {
      this.proc.stdin.write(`${cmd}\n`);
    }
  }

  processBuffer() {
    if (!this.currentTask) return;

    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop();

    for (const line of lines) {
      if (!line) continue;
      this.currentTask.lines.push(line);

      if (line.startsWith('bestmove')) {
        try {
          const result = parseEngineLines(this.currentTask.lines);
          this.currentTask.resolve(result);
        } catch (e) {
          this.currentTask.reject(e);
        }
        this.cleanupTask();
        this.processQueue();
        return;
      }
    }
  }

  cleanupTask() {
    if (this.currentTask?.timer) clearTimeout(this.currentTask.timer);
    this.currentTask = null;
    this.isProcessing = false;
  }

  async runAnalysis(opts) {
    return new Promise((resolve, reject) => {
      this.queue.push({ opts, resolve, reject, lines: [] });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    try {
      await this.ensureInitialized();
      this.currentTask = this.queue.shift();

      const { fen, depth, movetime, multipv, searchmoves, moves } = this.currentTask.opts;

      this.send('ucinewgame');
      this.send('isready');

      if (parseInt(multipv || 0, 10) > 1) {
        this.send(`setoption name MultiPV value ${parseInt(multipv, 10)}`);
      } else {
        this.send('setoption name MultiPV value 1');
      }

      if (moves) {
        this.send(`position startpos moves ${moves}`);
      } else if (fen) {
        this.send(`position fen ${fen}`);
      }

      const goCmd = movetime
        ? `go movetime ${movetime} ${searchmoves ? `searchmoves ${searchmoves}` : ''}`
        : `go depth ${depth || 20} ${searchmoves ? `searchmoves ${searchmoves}` : ''}`;

      const timerMs = movetime
        ? Math.max(3000, parseInt(movetime, 10) + 3000)
        : Math.max(15000, parseInt(depth || 20, 10) * 1000);

      this.currentTask.timer = setTimeout(() => {
        if (this.currentTask) {
          this.currentTask.reject(new Error(`Engine timeout after ${timerMs}ms`));
          this.cleanupTask();
          this.processQueue();
        }
      }, timerMs);

      this.send(goCmd);
    } catch (e) {
      if (this.currentTask) this.currentTask.reject(e);
      this.cleanupTask();
      this.processQueue();
    }
  }
}

const sfEngine = new PersistentStockfish();
const sfBackgroundEngine = new PersistentStockfish();
const analysisCache = new Map();

function parseEngineLines(lines) {
  let score = null;
  let outDepth = 0;
  let bestmove = null;
  let ponder = null;
  let pv = null;
  const multi = {};

  for (const line of lines) {
    if (!line) continue;
    const parts = line.split(/\s+/);

    if (line.startsWith('bestmove')) {
      bestmove = parts[1] === '(none)' ? null : parts[1];
      ponder = parts[3] && parts[2] === 'ponder' ? parts[3] : null;
      continue;
    }

    if (!line.startsWith('info ')) continue;

    const mpIdx = parts.indexOf('multipv');
    const hasMulti = mpIdx !== -1 && mpIdx + 1 < parts.length;
    const mp = hasMulti ? parseInt(parts[mpIdx + 1], 10) : 1;

    const dIdx = parts.indexOf('depth');
    if (dIdx !== -1 && dIdx + 1 < parts.length) {
      const dVal = parseInt(parts[dIdx + 1], 10);
      if (!isNaN(dVal)) {
        outDepth = Math.max(outDepth, dVal);
        if (hasMulti) {
          multi[mp] = multi[mp] || {};
          multi[mp].depth = dVal;
        }
      }
    }

    const sIdx = parts.indexOf('score');
    if (sIdx !== -1 && sIdx + 2 < parts.length) {
      const type = parts[sIdx + 1];
      const value = parseInt(parts[sIdx + 2], 10);
      if (!isNaN(value)) {
        const sc = { type, value };
        if (hasMulti) {
          multi[mp] = multi[mp] || {};
          multi[mp].score = sc;
        } else {
          score = sc;
        }
      }
    }

    const pvIdx = parts.indexOf('pv');
    if (pvIdx !== -1 && pvIdx + 1 < parts.length) {
      const pvStr = parts.slice(pvIdx + 1).join(' ');
      if (hasMulti) {
        multi[mp] = multi[mp] || {};
        multi[mp].pv = pvStr;
      } else {
        pv = pvStr;
      }
    }
  }

  const linesOut = Object.keys(multi)
    .map((k) => ({ multipv: parseInt(k, 10), ...multi[k] }))
    .filter((l) => l.score && l.pv)
    .sort((a, b) => a.multipv - b.multipv);

  if (linesOut.length > 0) {
    if (!score) score = linesOut[0].score;
    if (!pv) pv = linesOut[0].pv;
  }

  return {
    bestmove,
    ponder,
    score: score || { type: 'cp', value: 0 },
    depth: outDepth,
    pv,
    lines: linesOut,
  };
}

function scoreToWhiteWinProbability(score, turnForPosition) {
  if (!score || typeof score.value !== 'number') return 50;
  let v = score.type === 'cp' ? score.value / 100 : score.value;
  if (turnForPosition === 'b') v = -v;
  if (score.type === 'mate') {
    if (v > 0) return 100;
    if (v < 0) return 0;
    return turnForPosition === 'w' ? 0 : 100;
  }
  if (v >= 8) return 100;
  if (v >= 4) return 90 + ((v - 4) / 4) * 10;
  if (v >= 0) return 50 + (v / 4) * 40;
  if (v >= -4) return 10 + ((v + 4) / 4) * 40;
  if (v >= -8) return ((v + 8) / 4) * 10;
  return 0;
}

function runEngineDirect(opts, useBackground = false) {
  const engine = useBackground ? sfBackgroundEngine : sfEngine;
  return engine.runAnalysis(opts);
}

async function runEngineWithFallbacks(primaryOpts, fallbackOptsList = [], useBackground = false) {
  const attempts = [primaryOpts, ...fallbackOptsList].filter(Boolean);
  let lastErr = null;

  for (const opts of attempts) {
    try {
      return await runEngineDirect(opts, useBackground);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Engine analysis failed');
}

async function computeFirstMoveScores({ previousFen, lines }) {
  if (!previousFen || !Array.isArray(lines) || lines.length === 0) return {};

  const firstMoves = [
    ...new Set(
      lines
        .map((line) => String(line?.pv || '').trim().split(/\s+/)[0])
        .filter(Boolean)
    ),
  ];

  const tieredTimes = [200, 150, 100];

  const entries = await Promise.all(
    firstMoves.map(async (mv, index) => {
      const movetime = tieredTimes[index] || 100;
      try {
        const result = await runEngineWithFallbacks(
          { fen: previousFen, moves: mv, movetime, multipv: 1 },
          [
            { fen: previousFen, moves: mv, movetime: Math.max(50, Math.floor(movetime * 0.5)), multipv: 1 },
            { fen: previousFen, moves: mv, depth: 10, movetime: 1500, multipv: 1 },
          ],
          true
        );
        return [mv, result?.score || null];
      } catch {
        return [mv, null];
      }
    })
  );

  return Object.fromEntries(entries);
}

async function analyzePosition({ currentFen, previousFen, multipv = 3 }) {
  const cacheKey = `${currentFen}|${previousFen}|${multipv}`;
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey);
  }

  const requestedMultiPv = Math.max(1, Math.min(10, parseInt(multipv || 3, 10)));
  const scanTime = 80;
  const playedMoveTime = 200;

  const [currentSettled, previousSettled] = await Promise.allSettled([
    runEngineWithFallbacks(
      { fen: currentFen, movetime: playedMoveTime },
      [
        { fen: currentFen, movetime: 100, multipv: 1 },
        { fen: currentFen, depth: 10, movetime: 1500, multipv: 1 },
      ]
    ),
    runEngineWithFallbacks(
      { fen: previousFen, movetime: scanTime, multipv: requestedMultiPv },
      [
        { fen: previousFen, movetime: 50, multipv: Math.min(3, requestedMultiPv) },
        { fen: previousFen, depth: 10, movetime: 1500, multipv: 1 },
      ]
    ),
  ]);

  const currentResult = currentSettled.status === 'fulfilled' ? currentSettled.value : null;
  const previousResult = previousSettled.status === 'fulfilled' ? previousSettled.value : null;

  const turnToken = String(currentFen).trim().split(/\s+/)[1];
  const currentTurn = turnToken === 'b' ? 'b' : 'w';
  const whiteWin = scoreToWhiteWinProbability(currentResult?.score, currentTurn);

  const currentFallbackScore = { type: 'cp', value: 0 };
  const baseLines = Array.isArray(previousResult?.lines) ? previousResult.lines : [];
  const firstMoveScoreMap = await computeFirstMoveScores({
    previousFen,
    lines: baseLines,
  });

  const responseLines = baseLines.map((line) => {
    const firstMove = String(line?.pv || '').trim().split(/\s+/)[0] || null;
    return {
      ...line,
      firstMoveScore: firstMove ? firstMoveScoreMap[firstMove] || null : null,
    };
  });

  const fallbackBestMoveFromLines = responseLines?.[0]?.pv
    ? responseLines[0].pv.split(' ')[0]
    : null;

  const warnings = [];
  if (currentSettled.status !== 'fulfilled') {
    warnings.push(`current analysis fallback failed: ${currentSettled.reason?.message || String(currentSettled.reason)}`);
  }
  if (previousSettled.status !== 'fulfilled') {
    warnings.push(`bestlines analysis fallback failed: ${previousSettled.reason?.message || String(previousSettled.reason)}`);
  }

  const response = {
    bestmove: currentResult?.bestmove || fallbackBestMoveFromLines || null,
    ponder: currentResult?.ponder || null,
    score: currentResult?.score || currentFallbackScore,
    depth: currentResult?.depth || 0,
    winProbability: {
      white: whiteWin,
      black: 100 - whiteWin,
    },
    lines: responseLines,
    previousFenBestmove: previousResult?.bestmove || fallbackBestMoveFromLines,
    warning: warnings.length > 0 ? warnings : undefined,
  };

  analysisCache.set(cacheKey, response);
  if (analysisCache.size > 100) {
    const firstKey = analysisCache.keys().next().value;
    analysisCache.delete(firstKey);
  }

  return response;
}

/** Single-position best move via local Stockfish binary. */
async function getBestMove(fen, depth = 15) {
  const cappedDepth = Math.min(Math.max(1, Number(depth) || 15), 25);
  const result = await runEngineWithFallbacks(
    { fen, depth: cappedDepth, multipv: 1 },
    [
      { fen, depth: Math.min(12, cappedDepth), multipv: 1 },
      { fen, movetime: 800, multipv: 1 },
    ],
    false
  );
  const bestmove = result?.bestmove || null;
  if (!bestmove) {
    throw new Error('Local Stockfish did not return a best move.');
  }
  const score = result?.score || { type: 'cp', value: 0 };
  return {
    success: true,
    bestmove: `bestmove ${bestmove}${result?.ponder ? ` ponder ${result.ponder}` : ''}`,
    evaluation: score.type === 'cp' ? score.value / 100 : null,
    mate: score.type === 'mate' ? score.value : null,
    source: 'local',
    depth: result?.depth || cappedDepth,
  };
}

module.exports = {
  analyzePosition,
  scoreToWhiteWinProbability,
  parseEngineLines,
  getBestMove,
};
