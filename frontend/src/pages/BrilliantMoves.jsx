import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy /brilliant-moves list → merged All Games page (Brilliant Moves view). */
function BrilliantMoves() {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('view', 'brilliant');
  const qs = next.toString();
  return <Navigate to={qs ? `/all-games?${qs}` : '/all-games?view=brilliant'} replace />;
}

export default BrilliantMoves;
