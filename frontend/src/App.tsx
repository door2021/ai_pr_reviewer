import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import Login from '@/pages/auth/Login';
import Signup from '@/pages/auth/Signup';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import Dashboard from '@/pages/Dashboard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStore();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;