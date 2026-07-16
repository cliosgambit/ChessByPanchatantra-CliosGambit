import React from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { getRoleHomePath } from '../services/authService';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import Login from '../pages/Login';
import ForgotPassword from '../pages/ForgotPassword';
import Dashboard from '../pages/Dashboard';
import ModulesPage from '../pages/ModulesPage';
import ModuleDetailPage from '../pages/ModuleDetailPage';
import ModuleStoryViewPage from '../pages/ModuleStoryViewPage';
import TablesBrowser from '../pages/TablesBrowser';
import Library from '../pages/Library';
import LibraryStoryForm from '../pages/LibraryStoryForm';
import LibraryStoryView from '../pages/LibraryStoryView';
import LibraryMoralPuzzles from '../pages/LibraryMoralPuzzles';
import Puzzles from '../pages/Puzzles';
import GmPuzzles from '../pages/GmPuzzles';
import GmPuzzleView from '../pages/GmPuzzleView';
import LichessPuzzles from '../pages/LichessPuzzles';
import LichessPuzzleView from '../pages/LichessPuzzleView';
import ChessComPuzzles from '../pages/ChessComPuzzles';
import ViewPuzzle from '../pages/ViewPuzzle';
import Students from '../pages/Students';
import UserProfilePage from '../pages/UserProfilePage';
import ChessComGamePage from '../pages/ChessComGamePage';
import BrilliantMoves from '../pages/BrilliantMoves';
import ViewBrilliantMove from '../pages/ViewBrilliantMove';
import AllGames from '../pages/AllGames';
import Settings from '../pages/Settings';
import CatchAllRedirect from './CatchAllRedirect';

function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={getRoleHomePath(user?.role)} replace />;
}

function LibraryEditRedirect() {
  const { storyId } = useParams();
  return <Navigate to={`/library/${storyId}`} replace state={{ edit: true }} />;
}

function AppRoutesContent() {
  return (
    <Box p={0} m={0} w="100%" h="100%">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/" element={<RoleHomeRedirect />} />

        <Route element={<ProtectedRoute requireAuth />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/modules" element={<ModulesPage />} />
            <Route path="/modules/:moduleId" element={<ModuleDetailPage />} />
            <Route
              path="/modules/:moduleId/stories/:storyId"
              element={<ModuleStoryViewPage />}
            />
            <Route
              path="/modules/:moduleId/stories/:storyId/morals/:moralId"
              element={<LibraryMoralPuzzles />}
            />
            <Route path="/puzzles" element={<Puzzles />} />
            <Route path="/puzzles/gm" element={<GmPuzzles />} />
            <Route path="/puzzles/gm/:puzzleId" element={<GmPuzzleView />} />
            <Route path="/puzzles/lichess" element={<LichessPuzzles />} />
            <Route path="/puzzles/lichess/:puzzleId" element={<LichessPuzzleView />} />
            <Route path="/puzzles/chesscom" element={<ChessComPuzzles />} />
            <Route path="/puzzles/chesscom/:puzzleId" element={<ViewPuzzle />} />
            <Route path="/players/:userId" element={<UserProfilePage />} />
            <Route path="/players/:userId/game/:gameId" element={<ChessComGamePage />} />
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/students" element={<Students />} />
              <Route path="/brilliant-moves" element={<BrilliantMoves />} />
              <Route path="/brilliant-moves/:moveId" element={<ViewBrilliantMove />} />
              <Route path="/all-games" element={<AllGames />} />
              <Route path="/tables" element={<TablesBrowser />} />
              <Route path="/tables/:tableName" element={<TablesBrowser />} />
              <Route path="/library" element={<Library />} />
              <Route path="/library/new" element={<LibraryStoryForm />} />
              <Route path="/library/:storyId/edit" element={<LibraryEditRedirect />} />
              <Route path="/library/:storyId" element={<LibraryStoryView />} />
              <Route
                path="/library/:storyId/morals/:moralId"
                element={<LibraryMoralPuzzles />}
              />
            </Route>
            <Route path="/student-dashboard" element={<Navigate to="/dashboard" replace />} />
            <Route path="/coach-dashboard" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
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
