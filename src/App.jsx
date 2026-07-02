import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, LoadingScreen } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { hasSupabaseConfig } from './supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import AdminSchedule from './pages/AdminSchedule'
import AdminStaff from './pages/AdminStaff'
import AdminRacks from './pages/AdminRacks'
import Profile from './pages/Profile'
import StaffEvents from './pages/StaffEvents'
import Mission from './pages/Mission'
import MissionGroupForm from './pages/MissionGroupForm'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <Inventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-schedule"
        element={
          <ProtectedRoute>
            <AdminSchedule />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-staff"
        element={
          <ProtectedRoute>
            <AdminStaff />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-racks"
        element={
          <ProtectedRoute>
            <AdminRacks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <StaffEvents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mission"
        element={
          <ProtectedRoute>
            <Mission />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mission/groups/new"
        element={
          <ProtectedRoute>
            <MissionGroupForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mission/groups/:groupId/edit"
        element={
          <ProtectedRoute>
            <MissionGroupForm />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function ConfigErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5 py-8">
      <div className="brutal-card max-w-[560px] bg-white p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Setup Error</p>
        <h1 className="mt-1 text-[24px] font-extrabold">LinenTrack is not configured</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#3D3D3D]">
          This deployment is missing Supabase environment variables. Add{' '}
          <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> in Vercel,
          then redeploy.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!hasSupabaseConfig) {
    return <ConfigErrorScreen />
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="bottom-center" />
        <ErrorBoundary>
          <Suspense fallback={<LoadingScreen />}>
            <AppRoutes />
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
