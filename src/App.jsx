import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import AdminTodos from './pages/AdminTodos'
import AdminSchedule from './pages/AdminSchedule'
import AdminStaff from './pages/AdminStaff'
import AdminRacks from './pages/AdminRacks'
import Profile from './pages/Profile'
import StaffEvents from './pages/StaffEvents'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
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
        path="/admin-todos"
        element={
          <ProtectedRoute>
            <AdminTodos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff-todos"
        element={
          <ProtectedRoute>
            <AdminTodos />
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
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="bottom-center" />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
