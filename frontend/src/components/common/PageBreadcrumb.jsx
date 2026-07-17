import React from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import './PageBreadcrumb.css';

const DEFAULT_MAX_CHARS = 15;

function truncateLabel(label, maxChars = DEFAULT_MAX_CHARS) {
  const text = String(label || '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/**
 * Folder-style breadcrumb trail. Parents are clickable links; the last item is the current page.
 * Long labels are truncated with an ellipsis; full text is available via title tooltip.
 * @param {{ items: Array<{ label: string, to?: string }> , className?: string, maxChars?: number }} props
 */
function PageBreadcrumb({ items = [], className = '', maxChars = DEFAULT_MAX_CHARS }) {
  const crumbs = (items || []).filter((item) => item?.label);
  if (!crumbs.length) return null;

  return (
    <nav className={`page-breadcrumb ${className}`.trim()} aria-label="Breadcrumb">
      <ol className="page-breadcrumb-list">
        {crumbs.map((item, index) => {
          const isLast = index === crumbs.length - 1;
          const fullLabel = String(item.label).trim();
          const displayLabel = truncateLabel(fullLabel, maxChars);
          const title = displayLabel !== fullLabel ? fullLabel : undefined;

          return (
            <li key={`${fullLabel}-${index}`} className="page-breadcrumb-item">
              {index > 0 ? (
                <FiChevronRight className="page-breadcrumb-sep" aria-hidden />
              ) : null}
              {isLast || !item.to ? (
                <span
                  className="page-breadcrumb-current"
                  aria-current={isLast ? 'page' : undefined}
                  title={title}
                >
                  {displayLabel}
                </span>
              ) : (
                <Link to={item.to} className="page-breadcrumb-link" title={title}>
                  {displayLabel}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default PageBreadcrumb;
