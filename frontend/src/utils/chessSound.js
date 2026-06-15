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

let audioContext = null;
const audioCache = Object.create(null);

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

function getAudio(type) {
  if (!audioCache[type]) {
    audioCache[type] = new Audio(SOUND_FILES[type]);
    audioCache[type].preload = 'auto';
  }
  return audioCache[type];
}

function playSynthSound(type) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  const playTone = (freq, start, duration, volume = 0.12) => {
    const osc = ctx.createOscillator();
    osc.type = type === 'capture' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  };

  switch (type) {
    case 'capture':
      playTone(180, now, 0.12, 0.16);
      playTone(120, now + 0.04, 0.1, 0.1);
      break;
    case 'check':
      playTone(520, now, 0.1, 0.14);
      playTone(680, now + 0.08, 0.12, 0.12);
      break;
    case 'castle':
      playTone(280, now, 0.08, 0.12);
      playTone(340, now + 0.07, 0.08, 0.1);
      break;
    case 'promote':
      playTone(320, now, 0.08, 0.12);
      playTone(480, now + 0.07, 0.1, 0.12);
      playTone(620, now + 0.14, 0.12, 0.1);
      break;
    case 'gameEnd':
      playTone(392, now, 0.2, 0.1);
      playTone(494, now + 0.05, 0.2, 0.09);
      playTone(587, now + 0.1, 0.25, 0.08);
      break;
    case 'move':
    default:
      playTone(320, now, 0.07, 0.1);
      break;
  }
}

export function playChessSound(type) {
  if (!isChessSoundEnabled()) return;

  const audio = getAudio(type);
  audio.currentTime = 0;
  audio.play().catch(() => playSynthSound(type));
}

export function getSoundTypeForPosition(chess, move) {
  if (chess.isCheckmate() || chess.isStalemate() || chess.isDraw()) return 'gameEnd';
  if (chess.inCheck()) return 'check';
  if (move?.flags?.includes('k') || move?.flags?.includes('q')) return 'castle';
  if (move?.flags?.includes('p')) return 'promote';
  if (move?.flags?.includes('c')) return 'capture';
  return 'move';
}

export function playSoundForVerboseMove(move, chessAfterMove) {
  if (!move) return;
  const soundType = getSoundTypeForPosition(chessAfterMove, move);
  playChessSound(soundType);
}

export function playSoundForHistoryIndex(history, index) {
  if (index < 0 || index >= history.length) return;

  const chess = new Chess();
  for (let i = 0; i <= index; i += 1) {
    chess.move(history[i].san);
  }

  playSoundForVerboseMove(history[index], chess);
}

export function preloadChessSounds() {
  Object.keys(SOUND_FILES).forEach((type) => {
    getAudio(type).load();
  });
}
