import React, { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FaCrown } from 'react-icons/fa';
import {
  FiLogOut,
  FiMenu,
  FiX,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { getRoleHomePath } from '../../services/authService';
import {
  PRIMARY_NAV_ITEMS,
  SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
  filterNavByRole,
} from './adminNavItems';
import './SideNav.css';

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH };

function SideNav({ collapsed, expanded, onToggleCollapse, onHoverChange }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNavItems = useMemo(() => filterNavByRole(PRIMARY_NAV_ITEMS, user), [user]);
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Admin';
  const roleLabel = (user?.role || 'admin').replace(/^\w/, (c) => c.toUpperCase());

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeMobile = () => setMobileOpen(false);

  const sidebar = (
    <aside
      className={[
        'side-nav',
        collapsed ? 'side-nav--collapsed' : '',
        collapsed && expanded ? 'side-nav--flyout' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Main navigation"
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <div className="side-nav__top">
        <NavLink
          to={getRoleHomePath(user?.role)}
          className="side-nav__brand"
          onClick={closeMobile}
          aria-label="Chess by Panchatantra home"
          title="Chess by Panchatantra"
        >
          <span className="side-nav__brand-icon" aria-hidden>
            <FaCrown />
          </span>
          <span className="side-nav__brand-text">
            Chess by
            <br />
            Panchatantra
          </span>
        </NavLink>

        <button
          type="button"
          className="side-nav__collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
        </button>
      </div>

      <nav className="side-nav__links">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={`${item.path}-${item.label}`}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `side-nav__link${isActive ? ' side-nav__link--active' : ''}`
              }
              onClick={closeMobile}
              title={item.label}
            >
              <Icon size={15} aria-hidden />
              <span className="side-nav__link-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="side-nav__footer">
        <div className="side-nav__art" aria-hidden>
          <img
            src="/dashboard/sidenav-animals.png"
            alt=""
            className="side-nav__art-img"
          />
        </div>

        {isAuthenticated && (
          <div className="side-nav__user">
            <div className="side-nav__avatar" aria-hidden>
              {(displayName || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="side-nav__user-meta">
              <div className="side-nav__user-name">{displayName}</div>
              <div className="side-nav__user-role">{roleLabel}</div>
            </div>
            <button
              type="button"
              className="side-nav__logout"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <FiLogOut />
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <button
        type="button"
        className="side-nav__mobile-toggle"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <FiX size={22} /> : <FiMenu size={22} />}
      </button>

      <div className="side-nav__desktop">{sidebar}</div>

      {mobileOpen && (
        <div className="side-nav__mobile-overlay" onClick={closeMobile} role="presentation">
          <div className="side-nav__mobile-drawer" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}

export default SideNav;
