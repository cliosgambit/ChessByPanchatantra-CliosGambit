import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Box, Center, Spinner } from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import Login from '../pages/Login';
import ForgotPassword from '../pages/ForgotPassword';
import Puzzles from '../pages/Puzzles';
import GmPuzzles from '../pages/GmPuzzles';
import GmPuzzleView from '../pages/GmPuzzleView';
import LichessPuzzles from '../pages/LichessPuzzles';
import LichessPuzzleView from '../pages/LichessPuzzleView';
import ChessComPuzzles from '../pages/ChessComPuzzles';
import BrilliantMovePuzzles from '../pages/BrilliantMovePuzzles';
import ViewPuzzle from '../pages/ViewPuzzle';
import Students from '../pages/Students';
import BatchDetailPage from '../pages/BatchDetailPage';
import UserProfilePage from '../pages/UserProfilePage';
import ChessComGamePage from '../pages/ChessComGamePage';
import BrilliantMoves from '../pages/BrilliantMoves';
import ViewBrilliantMove from '../pages/ViewBrilliantMove';
import Achievements from '../pages/Achievements';
import AllGames from '../pages/AllGames';
import PioneerWins from '../pages/PioneerWins';
import AnalyzeCustomGame from '../pages/AnalyzeCustomGame';
import Settings from '../pages/Settings';
import CatchAllRedirect from './CatchAllRedirect';

const ModulesPage = React.lazy(() => import('../pages/ModulesPage'));
const ModuleDetailPage = React.lazy(() => import('../pages/ModuleDetailPage'));
const ChapterDetailPage = React.lazy(() => import('../pages/ChapterDetailPage'));
const ModuleStoryViewPage = React.lazy(() => import('../pages/ModuleStoryViewPage'));
const Library = React.lazy(() => import('../pages/Library'));
const LibraryStoryForm = React.lazy(() => import('../pages/LibraryStoryForm'));
const LibraryStoryView = React.lazy(() => import('../pages/LibraryStoryView'));
const LibraryMoralPuzzles = React.lazy(() => import('../pages/LibraryMoralPuzzles'));

function PageLoader() {
  return (
    <Center minH="50vh">
      <Spinner size="xl" color="gold.500" thickness="3px" />
    </Center>
  );
}

function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={getRoleHomePath(user?.role)} replace />;
}

function LibraryEditRedirect() {
  const { storyId } = useParams();
  return <Navigate to={`/library/${storyId}`} replace state={{ edit: true }} />;
}

function PlayerProfileCanonicalRedirect() {
  const { userId } = useParams();
  return <Navigate to={`/players/${encodeURIComponent(userId)}`} replace />;
}

function AppRoutesContent() {
  return (
    <Box p={0} m={0} w="100%" h="100%">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/" element={<RoleHomeRedirect />} />

          <Route element={<ProtectedRoute requireAuth />}>
            <Route element={<AdminLayout />}>
              {/* Dashboard hidden for now — Modules is the post-login home */}
              <Route path="/dashboard" element={<Navigate to="/modules" replace />} />
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/workers" element={<Settings />} />
                <Route path="/settings" element={<Navigate to="/workers" replace />} />
              </Route>
              <Route path="/modules" element={<ModulesPage />} />
              <Route path="/modules/:moduleId" element={<ModuleDetailPage />} />
              <Route
                path="/modules/:moduleId/chapters/:chapterId"
                element={<ChapterDetailPage />}
              />
              <Route
                path="/modules/:moduleId/chapters/:chapterId/stories/:storyId"
                element={<ModuleStoryViewPage />}
              />
              <Route
                path="/modules/:moduleId/chapters/:chapterId/stories/:storyId/morals/:moralId"
                element={<LibraryMoralPuzzles />}
              />
              <Route path="/puzzles" element={<Puzzles />} />
              <Route path="/puzzles/gm" element={<GmPuzzles />} />
              <Route path="/puzzles/gm/:puzzleId" element={<GmPuzzleView />} />
              <Route path="/puzzles/lichess" element={<LichessPuzzles />} />
              <Route path="/puzzles/lichess/:puzzleId" element={<LichessPuzzleView />} />
              <Route path="/puzzles/chesscom" element={<ChessComPuzzles />} />
              <Route path="/puzzles/chesscom/:puzzleId" element={<ViewPuzzle />} />
              <Route path="/puzzles/brilliant" element={<BrilliantMovePuzzles />} />
              <Route path="/puzzles/brilliant/:puzzleId" element={<ViewPuzzle />} />
              <Route path="/players/:userId/game/:gameId" element={<ChessComGamePage />} />
              <Route path="/players/:userId/report" element={<UserProfilePage />} />
              <Route path="/players/:userId/new" element={<PlayerProfileCanonicalRedirect />} />
              <Route path="/players/:userId/legacy" element={<PlayerProfileCanonicalRedirect />} />
              <Route path="/players/:userId" element={<UserProfilePage />} />
              <Route element={<ProtectedRoute allowedRoles={['admin', 'coach']} />}>
                <Route path="/students" element={<Students />} />
                <Route path="/students/batches/:batchId" element={<BatchDetailPage />} />
                <Route path="/brilliant-moves" element={<BrilliantMoves />} />
                <Route path="/brilliant-moves/:moveId" element={<ViewBrilliantMove />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/all-games" element={<AllGames />} />
                <Route path="/pioneer-wins" element={<PioneerWins />} />
                <Route path="/analyze" element={<AnalyzeCustomGame />} />
                <Route path="/library" element={<Library />} />
                <Route path="/library/new" element={<LibraryStoryForm />} />
                <Route path="/library/:storyId/edit" element={<LibraryEditRedirect />} />
                <Route path="/library/:storyId" element={<LibraryStoryView />} />
                <Route
                  path="/library/:storyId/morals/:moralId"
                  element={<LibraryMoralPuzzles />}
                />
              </Route>
              <Route path="/student-dashboard" element={<Navigate to="/modules" replace />} />
              <Route path="/coach-dashboard" element={<Navigate to="/modules" replace />} />
              <Route path="*" element={<Navigate to="/modules" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<CatchAllRedirect />} />
        </Routes>
      </Suspense>
    </Box>
  );
}

function AppRoutes() {
  return (
    <HashRouter>
      <AppRoutesContent />
    </HashRouter>
  );
}

export default AppRoutes;
