import React from 'react';
import { FaChessKnight, FaChessRook, FaCrown, FaDragon, FaLock, FaShieldAlt, FaStar } from 'react-icons/fa';
import { GiBroadsword, GiDeerHead, GiFlamer, GiLaurelCrown, GiQueenCrown } from 'react-icons/gi';

const STREAK_BADGE_THEMES = [
  { theme: 'purple', Icon: FaChessKnight, name: 'Opening Fire', seal: 'Hidden' },
  { theme: 'teal', Icon: GiBroadsword, name: 'Sharp Edge', seal: 'Sealed' },
  { theme: 'blue', Icon: FaCrown, name: 'Hot Hand', seal: 'Veiled' },
  { theme: 'crimson', Icon: GiFlamer, name: 'On a Tear', seal: 'Hidden' },
  { theme: 'violet', Icon: FaStar, name: 'Unbroken', seal: 'Sealed' },
  { theme: 'bronze', Icon: FaChessRook, name: 'Fortress', seal: 'Veiled' },
  { theme: 'ocean', Icon: FaShieldAlt, name: 'Iron Form', seal: 'Hidden' },
  { theme: 'plum', Icon: GiQueenCrown, name: 'Royal Run', seal: 'Sealed' },
  { theme: 'forest', Icon: GiDeerHead, name: 'Wild Hunt', seal: 'Veiled' },
  { theme: 'obsidian', Icon: FaDragon, name: 'Dragon Spree', seal: 'Mythic' },
];

function formatStreakEarnedLabel(times) {
  const n = Number(times) || 0;
  if (n <= 0) return 'Just unlocked';
  if (n === 1) return 'Earned once';
  return `Earned ${n}×`;
}

function WinStreakBadges({
  milestones = [],
  title = 'Win Streak Badges',
  subtitle = 'String wins together and claim a named badge for each exact streak length. Every seal hides a new chapter of your form.',
  footer = 'One more win can rewrite the board.',
  emptyLabel = 'No streak badges yet.',
  className = '',
}) {
  const list = Array.isArray(milestones) ? milestones : [];

  if (!list.length) {
    return <div className="chess-streak-milestones-empty">{emptyLabel}</div>;
  }

  return (
    <div
      className={`chess-ach-milestones${className ? ` ${className}` : ''}`}
      data-pdf-part="streaks"
    >
      <div className="chess-ach-milestones-head">
        <div className="chess-ach-milestones-emblem" aria-hidden>
          <GiLaurelCrown />
        </div>
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>

      <div className="chess-ach-milestone-grid" role="list" aria-label="Win streak badges">
        {list.map((m, index) => {
          const badge = STREAK_BADGE_THEMES[index % STREAK_BADGE_THEMES.length];
          const BadgeIcon = badge.Icon;
          return (
            <div
              key={m.length}
              role="listitem"
              className={`chess-ach-milestone chess-ach-milestone--${badge.theme}${
                m.achieved ? ' is-unlocked' : ' is-locked'
              }`}
              title={
                m.achieved
                  ? `${badge.name} · ${m.length} wins in a row · ${formatStreakEarnedLabel(m.times)}`
                  : 'Still sealed — keep the streak alive to reveal this badge'
              }
            >
              {m.achieved ? (
                <>
                  <div className="chess-ach-milestone-aura" aria-hidden />
                  <div className="chess-ach-milestone-icon" aria-hidden>
                    <BadgeIcon />
                  </div>
                  <div className="chess-ach-milestone-plaque">
                    <div className="chess-ach-milestone-name">{badge.name}</div>
                    <div className="chess-ach-milestone-label">
                      <span className="chess-ach-milestone-num">{m.length}</span>
                      <span className="chess-ach-milestone-unit">straight wins</span>
                    </div>
                    <div className="chess-ach-milestone-times">
                      <span className="chess-ach-milestone-earned">
                        {formatStreakEarnedLabel(m.times)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="chess-ach-milestone-seal">
                  <span className="chess-ach-milestone-seal-ring" aria-hidden>
                    <FaLock />
                  </span>
                  <span className="chess-ach-milestone-seal-label">{badge.seal}</span>
                  <span className="chess-ach-milestone-seal-hint">Keep winning</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footer ? (
        <div className="chess-ach-milestones-foot">
          <span className="chess-ach-milestones-rule" aria-hidden />
          <p>
            <FaCrown aria-hidden />
            {footer}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default WinStreakBadges;
