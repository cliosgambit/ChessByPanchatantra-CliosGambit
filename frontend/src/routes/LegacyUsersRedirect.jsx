import { Navigate, useParams } from 'react-router-dom';

export function LegacyUsersRedirect() {
  const { userId, gameId } = useParams();
  if (userId && gameId) {
    return <Navigate to={`/players/${encodeURIComponent(userId)}/game/${encodeURIComponent(gameId)}`} replace />;
  }
  if (userId) {
    return <Navigate to={`/players/${encodeURIComponent(userId)}`} replace />;
  }
  return <Navigate to="/players" replace />;
}
