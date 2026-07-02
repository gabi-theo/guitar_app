import { useEffect } from "react";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";

import Challenges from "./pages/Challenges";
import Dashboard from "./pages/Dashboard";
import ExerciseEditor from "./pages/ExerciseEditor";
import ExerciseLibrary from "./pages/ExerciseLibrary";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import PracticeSession from "./pages/PracticeSession";
import Progress from "./pages/Progress";
import Register from "./pages/Register";
import Tuner from "./pages/Tuner";
import { useAuth } from "./store/auth";

function ProtectedLayout() {
  const { isAuthenticated, user, logout, loadUser } = useAuth();

  useEffect(() => {
    if (isAuthenticated && !user) loadUser();
  }, [isAuthenticated, user, loadUser]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <>
      <nav className="topnav">
        <span className="brand">🎸 ShredTrainer</span>
        <NavLink to="/" end>
          Exercises
        </NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/tuner">Tuner</NavLink>
        <NavLink to="/leaderboard">Leaderboard</NavLink>
        <NavLink to="/challenges">Challenges</NavLink>
        <NavLink to="/history">History</NavLink>
        <span className="spacer" />
        <span className="muted">{user?.display_name || user?.username}</span>
        <button onClick={logout}>Log out</button>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<ExerciseLibrary />} />
          <Route path="/dashboard" element={<Progress />} />
          <Route path="/exercises/new" element={<ExerciseEditor />} />
          <Route path="/exercises/:id/edit" element={<ExerciseEditor />} />
          <Route path="/practice/:id" element={<PracticeSession />} />
          <Route path="/tuner" element={<Tuner />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/history" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
