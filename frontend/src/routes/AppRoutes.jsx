import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import Stopwatch from '../components/Stopwatch';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import StudentDashboard from '../pages/StudentDashboard';
import CoachDashboard from '../pages/CoachDashboard';
import Users from '../pages/Users';
import PlayerDetails from '../pages/PlayerDetails';
import Curriculum from '../pages/Curriculum';
import Principles from '../pages/Principles';
import PrincipleDetails from '../pages/PrincipleDetails';
import ChessPuzzles from '../pages/ChessPuzzles';
import ClioStories from '../pages/ClioStories';
import ModuleAccess from '../pages/ModuleAccess';
import ActivityTracker from '../pages/ActivityTracker';
import Classes from '../pages/Classes';
import ChaptersPage from '../pages/ChaptersPage';
import StoriesPage from '../pages/StoriesPage';
import StoryDetails from '../pages/StoryDetails';
import MappingDetails from '../pages/MappingDetails';
import CatchAllRedirect from './CatchAllRedirect';

function AppRoutesContent() {
  const { user } = useAuth();
  const location = useLocation();
  const showStopwatch =
    user?.role === 'coach' &&
    /^\/api\/story\/[^/]+\/mapping\/[^/]+$/.test(location.pathname);

  return (
    <Box>
      {showStopwatch && <Stopwatch />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route element={<ProtectedRoute requireAuth />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/student-dashboard" element={<StudentDashboard />} />
            <Route path="/coach-dashboard" element={<CoachDashboard />} />

            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/curriculum" element={<Curriculum />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['admin', 'coach', 'student']} />}>
              <Route path="/clio-stories" element={<ClioStories />} />
              <Route path="/api/module/:moduleId" element={<ChaptersPage />} />
              <Route path="/api/stories/:chapterId" element={<StoriesPage />} />
              <Route path="/api/story/:storyId" element={<StoryDetails />} />
              <Route path="/api/story/:storyId/mapping/:mappingId" element={<MappingDetails />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/users" element={<Users />} />
              <Route path="/principles" element={<Principles />} />
              <Route path="/principles/:principleId" element={<PrincipleDetails />} />
              <Route path="/module-access" element={<ModuleAccess />} />
              <Route path="/activity-tracker" element={<ActivityTracker />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['admin', 'coach']} />}>
              <Route path="/player-details" element={<PlayerDetails />} />
              <Route path="/classes" element={<Classes />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['student', 'admin', 'coach']} />}>
              <Route path="/chess-puzzles" element={<ChessPuzzles />} />
            </Route>

            <Route path="/api/access-control" element={<Navigate to="/module-access" replace />} />
            <Route path="/api/activity-tracker" element={<Navigate to="/activity-tracker" replace />} />
            <Route path="/api/chess" element={<Navigate to="/chess-puzzles" replace />} />
            <Route path="/admin/users" element={<Navigate to="/users" replace />} />
            <Route path="/admin/player-details" element={<Navigate to="/player-details" replace />} />
            <Route path="/admin/principles" element={<Navigate to="/principles" replace />} />
            <Route path="/admin/classes" element={<Navigate to="/classes" replace />} />
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
