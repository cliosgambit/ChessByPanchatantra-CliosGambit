import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiBook,
  FiBookOpen,
  FiGrid,
  FiUsers,
  FiZap,
  FiArrowRight,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import StudentDashboard from './StudentDashboard';
import './Dashboard.css';

const FEATURE_CARDS = [
  {
    key: 'modules',
    title: 'Modules',
    description: 'Structured chess lessons inspired by timeless Panchatantra wisdom.',
    cta: 'Explore Modules',
    path: '/modules',
    icon: FiBook,
    image: '/dashboard/modules.png',
  },
  {
    key: 'library',
    title: 'Library',
    description: 'Stories, morals, and narratives that connect chess with life lessons.',
    cta: 'Browse Library',
    path: '/library',
    icon: FiBookOpen,
    image: '/dashboard/library.png',
  },
  {
    key: 'puzzles',
    title: 'Puzzles',
    description: 'Challenge yourself with puzzles designed to sharpen tactical vision.',
    cta: 'Solve Puzzles',
    path: '/puzzles',
    icon: FiGrid,
    image: '/dashboard/puzzles.png',
  },
  {
    key: 'students',
    title: 'Students',
    description: 'Manage student progress, access, and learning journeys in one place.',
    cta: 'View Students',
    path: '/students',
    icon: FiUsers,
    image: '/dashboard/students.png',
  },
  {
    key: 'brilliant-moves',
    title: 'Brilliant Moves',
    description: 'Discover and celebrate the most creative chess moments from your students.',
    cta: 'Explore Now',
    path: '/all-games?view=brilliant',
    icon: FiZap,
    image: '/dashboard/brilliant-moves.png',
  },
];

const OVERVIEW_STATS = [
  { label: 'Modules', value: '24', icon: FiBook },
  { label: 'Stories', value: '128', icon: FiBookOpen },
  { label: 'Puzzles', value: '356', icon: FiGrid },
  { label: 'Students', value: '152', icon: FiUsers },
];

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();

  if (role === 'student') {
    return <StudentDashboard />;
  }

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Admin';

  return (
    <div className="admin-dash">
      <div className="admin-dash__main">
        <header className="admin-dash__welcome">
          <div className="admin-dash__welcome-copy">
            <h1>Welcome back, {displayName}!</h1>
            <p>Ready to inspire young minds through the wisdom of chess and stories?</p>
          </div>
          <div className="admin-dash__welcome-art" aria-hidden>
            <img
              src="/dashboard/welcome-king.png"
              alt=""
              className="admin-dash__welcome-img"
            />
          </div>
        </header>

        <section className="admin-dash__features" aria-label="Feature areas">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.key}
                className="admin-dash__feature-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(card.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(card.path);
                  }
                }}
              >
                <div className="admin-dash__feature-icon">
                  <Icon aria-hidden />
                </div>
                <div className="admin-dash__feature-media" aria-hidden>
                  {card.image ? (
                    <img
                      src={card.image}
                      alt=""
                      className="admin-dash__feature-img"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                </div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
                <span className="admin-dash__feature-cta">
                  {card.cta} <FiArrowRight aria-hidden />
                </span>
              </article>
            );
          })}
        </section>

        <section className="admin-dash__lower">
          <article className="admin-dash__overview">
            <h2>Overview</h2>
            <div className="admin-dash__overview-grid">
              {OVERVIEW_STATS.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="admin-dash__stat">
                    <div className="admin-dash__stat-icon">
                      <Icon aria-hidden />
                    </div>
                    <div>
                      <div className="admin-dash__stat-value">{stat.value}</div>
                      <div className="admin-dash__stat-label">{stat.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <footer className="admin-dash__quote">
          <p>
            &ldquo;Chess is not just a game, it&apos;s a journey of wisdom.&rdquo; — Inspired by
            Panchatantra
          </p>
        </footer>
      </div>
    </div>
  );
}

export default Dashboard;
