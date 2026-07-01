import React from 'react';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';

function DashboardSectionCard({
  label,
  description,
  bgColor,
  iconBg,
  textColor,
  icon: Icon,
  index = 0,
  onClick,
}) {
  return (
    <motion.div
      className="dashboard-feature-card"
      style={{ background: bgColor, color: textColor }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.28 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="dashboard-feature-card-icon" style={{ background: iconBg }}>
        {Icon ? <Icon aria-hidden /> : null}
      </div>
      <h3 className="dashboard-feature-card-title">{label}</h3>
      <p className="dashboard-feature-card-desc">{description}</p>
      <button
        type="button"
        className="dashboard-feature-card-arrow"
        aria-label={`Open ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        <FiArrowRight aria-hidden />
      </button>
    </motion.div>
  );
}

export default DashboardSectionCard;
