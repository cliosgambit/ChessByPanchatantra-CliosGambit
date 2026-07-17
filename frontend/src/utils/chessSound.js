import { Chess } from 'chess.js';

const SOUND_FILES = {
  move: '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  check: '/sounds/check.mp3',
  castle: '/sounds/castle.mp3',
  promote: '/sounds/promote.mp3',
  gameEnd: '/sounds/game-end.mp3',
};

const STORAGE_KEY = 'chessSoundEnabled';
const DEFAULT_SOUND_OPTIONS = { rate: 1, volume: 1 };
export const UNDO_SOUND_OPTIONS = { rate: 1.5, volume: 0.45 };
const UNDO_STAGGER_MS = 75;
const RESET_STAGGER_MS = 65;

let audioContext = null;
const audioCache = Object.create(null);
let audioUnlocked = false;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

export function isChessSoundEnabled() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== 'false';
  } catch {
    return true;
  }
}

export function setChessSoundEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // ignore
  }
}

function getAudioTemplate(type) {
  if (!audioCache[type]) {
    audioCache[type] = new Audio(SOUND_FILES[type]);
    audioCache[type].preload = 'auto';
  }
  return audioCache[type];
}

function createAudioPlayback(type) {
  const template = getAudioTemplate(type);
  if (typeof template.cloneNode === 'function') {
    const clone = template.cloneNode();
    clone.preload = 'auto';
    return clone;
  }
  return new Audio(SOUND_FILES[type]);
}

export function unlockChessAudio() {
  if (!isChessSoundEnabled() || audioUnlocked) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.frequency.value = 220;
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.02);
    audioUnlocked = true;
  } catch {
    // Browser audio can still be locked until the next user gesture.
  }
}

function playSynthSound(type, options = DEFAULT_SOUND_OPTIONS) {
  const { rate = 1, volume = 1 } = options;
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  const playTone = (freq, start, duration, toneVolume = 0.12) => {
    const osc = ctx.createOscillator();
    osc.type = type === 'capture' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, start);
    const scaledDuration = duration / rate;
    const scaledVolume = toneVolume * volume;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(scaledVolume, start + 0.01 / rate);
    gain.gain.exponentialRampToValueAtTime(0.001, start + scaledDuration);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + scaledDuration);
  };

  switch (type) {
    case 'capture':
      playTone(180, now, 0.12, 0.16);
      playTone(120, now + 0.04 / rate, 0.1, 0.1);
      break;
    case 'check':
      playTone(520, now, 0.1, 0.14);
      playTone(680, now + 0.08 / rate, 0.12, 0.12);
      break;
    case 'castle':
      playTone(280, now, 0.08, 0.12);
      playTone(340, now + 0.07 / rate, 0.08, 0.1);
      break;
    case 'promote':
      playTone(320, now, 0.08, 0.12);
      playTone(480, now + 0.07 / rate, 0.1, 0.12);
      playTone(620, now + 0.14 / rate, 0.12, 0.1);
      break;
    case 'gameEnd':
      playTone(392, now, 0.2, 0.1);
      playTone(494, now + 0.05 / rate, 0.2, 0.09);
      playTone(587, now + 0.1 / rate, 0.25, 0.08);
      break;
    case 'move':
    default:
      playTone(320, now, 0.07, 0.1);
      break;
  }
}

export function playChessSound(type, options = DEFAULT_SOUND_OPTIONS) {
  if (!isChessSoundEnabled()) return;

  const { rate = 1, volume = 1 } = options;
  unlockChessAudio();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const audio = createAudioPlayback(type);
  audio.playbackRate = rate;
  audio.volume = Math.min(1, Math.max(0, volume));
  audio.currentTime = 0;
  audio.play().catch(() => playSynthSound(type, options));
}

export function getSoundTypeForPosition(chess, move) {
  if (chess.isCheckmate() || chess.isStalemate() || chess.isDraw()) return 'gameEnd';
  if (chess.inCheck()) return 'check';
  if (move?.flags?.includes('k') || move?.flags?.includes('q')) return 'castle';
  if (move?.flags?.includes('p')) return 'promote';
  if (move?.flags?.includes('c')) return 'capture';
  return 'move';
}

export function playSoundForVerboseMove(move, chessAfterMove, options = DEFAULT_SOUND_OPTIONS) {
  if (!move) return;
  const soundType = getSoundTypeForPosition(chessAfterMove, move);
  playChessSound(soundType, options);
}

function resolveSan(entry) {
  return typeof entry === 'string' ? entry : entry?.san;
}

/** Replay one SAN from a position and play the matching move sound. */
export function playSoundForSanMove(initialFen, sansBeforeMove, san, options = DEFAULT_SOUND_OPTIONS) {
  const sanText = resolveSan(san);
  if (!sanText) return;
  try {
    const game = new Chess(initialFen);
    for (const entry of sansBeforeMove) {
      const next = resolveSan(entry);
      if (!next || !game.move(next)) return;
    }
    const moveResult = game.move(sanText);
    if (moveResult) playSoundForVerboseMove(moveResult, game, options);
  } catch {
    // ignore invalid replay positions
  }
}

/** Play the standard pawn/move sound repeatedly (undo / reset). */
export function playPawnMoveSounds(
  count,
  options = DEFAULT_SOUND_OPTIONS,
  staggerMs = UNDO_STAGGER_MS
) {
  if (!count || !isChessSoundEnabled()) return;

  for (let i = 0; i < count; i += 1) {
    window.setTimeout(() => playChessSound('move', options), i * staggerMs);
  }
}

export function playUndoSounds(count, options = UNDO_SOUND_OPTIONS, staggerMs = UNDO_STAGGER_MS) {
  playPawnMoveSounds(count, options, staggerMs);
}

export function playResetBoardSounds(count, options = DEFAULT_SOUND_OPTIONS, staggerMs = RESET_STAGGER_MS) {
  playPawnMoveSounds(count, options, staggerMs);
}

export function playSoundForHistoryIndex(history, index) {
  if (index < 0 || index >= history.length) return;

  const chess = new Chess();
  let lastMove = null;
  for (let i = 0; i <= index; i += 1) {
    const san = resolveSan(history[i]);
    if (!san) return;
    lastMove = chess.move(san);
  }

  playSoundForVerboseMove(lastMove, chess);
}

export function preloadChessSounds() {
  Object.keys(SOUND_FILES).forEach((type) => {
    getAudioTemplate(type).load();
  });
}
