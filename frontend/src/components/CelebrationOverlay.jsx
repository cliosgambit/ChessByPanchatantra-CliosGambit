import React, { useCallback, useEffect, useRef, useState } from 'react';
import Confetti from 'react-confetti';
import useWindowSize from '../hooks/useWindowSize';
import './CelebrationOverlay.css';

const EMOJIS = ['🎉', '🎊', '✨', '⭐', '🌟', '💫', '🥳', '🎈', '🏆', '💥'];
const CELEBRATION_MS = 6500;
const EMOJI_COUNT = 48;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function spawnEmojis() {
  return Array.from({ length: EMOJI_COUNT }, (_, i) => ({
    id: `${Date.now()}-${i}`,
    emoji: EMOJIS[i % EMOJIS.length],
    left: Math.random() * 92 + 2,
    top: Math.random() * 88 + 4,
    delay: Math.random() * 0.55,
    size: 1.4 + Math.random() * 1.8,
    drift: (Math.random() - 0.5) * 80,
    spin: (Math.random() > 0.5 ? 1 : -1) * (280 + Math.random() * 420),
  }));
}

function CelebrationOverlay() {
  const { width, height } = useWindowSize();
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [emojis, setEmojis] = useState([]);
  const [burstKey, setBurstKey] = useState(0);
  const timeoutRef = useRef(null);

  const clearCelebrationTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const triggerCelebration = useCallback(() => {
    setEmojis(spawnEmojis());
    setBurstKey((k) => k + 1);
    setIsCelebrating(true);

    clearCelebrationTimer();
    timeoutRef.current = setTimeout(() => {
      setIsCelebrating(false);
      setEmojis([]);
      timeoutRef.current = null;
    }, CELEBRATION_MS);
  }, [clearCelebrationTimer]);

  useEffect(() => () => clearCelebrationTimer(), [clearCelebrationTimer]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      triggerCelebration();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerCelebration]);

  if (!isCelebrating || !width || !height) return null;

  return (
    <div className="celebration-overlay" aria-hidden="true">
      <Confetti
        key={`main-${burstKey}`}
        width={width}
        height={height}
        recycle
        numberOfPieces={420}
        gravity={0.18}
        initialVelocityY={18}
        tweenDuration={4200}
        style={{ position: 'fixed', inset: 0, zIndex: 3000, pointerEvents: 'none' }}
      />
      <Confetti
        key={`burst-a-${burstKey}`}
        width={width}
        height={height}
        recycle={false}
        numberOfPieces={220}
        confettiSource={{ x: 0, y: height * 0.35, w: 12, h: 12 }}
        initialVelocityX={18}
        initialVelocityY={-12}
        gravity={0.22}
        style={{ position: 'fixed', inset: 0, zIndex: 3001, pointerEvents: 'none' }}
      />
      <Confetti
        key={`burst-b-${burstKey}`}
        width={width}
        height={height}
        recycle={false}
        numberOfPieces={220}
        confettiSource={{ x: width - 12, y: height * 0.35, w: 12, h: 12 }}
        initialVelocityX={-18}
        initialVelocityY={-12}
        gravity={0.22}
        style={{ position: 'fixed', inset: 0, zIndex: 3001, pointerEvents: 'none' }}
      />
      <Confetti
        key={`burst-c-${burstKey}`}
        width={width}
        height={height}
        recycle={false}
        numberOfPieces={180}
        confettiSource={{ x: width / 2 - 20, y: height * 0.15, w: 40, h: 12 }}
        initialVelocityY={-8}
        gravity={0.2}
        style={{ position: 'fixed', inset: 0, zIndex: 3001, pointerEvents: 'none' }}
      />

      <div className="celebration-overlay__emojis">
        {emojis.map((item) => (
          <span
            key={item.id}
            className="celebration-overlay__emoji"
            style={{
              left: `${item.left}%`,
              top: `${item.top}%`,
              fontSize: `${item.size}rem`,
              animationDelay: `${item.delay}s`,
              '--drift': `${item.drift}px`,
              '--spin': `${item.spin}deg`,
            }}
          >
            {item.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

export default CelebrationOverlay;
