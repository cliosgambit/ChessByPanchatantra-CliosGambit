import React from 'react';
import { motion } from 'framer-motion';

/* Opacity-only — transform on this wrapper breaks position:sticky descendants. */
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

function PageTransition({ children }) {
  return (
    <motion.div
      className="page-transition"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
