import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/Layout/Layout';
import LoadingScreen from './components/ui/LoadingScreen';
import { useAuthStore } from './stores/authStore';

// Lazy-loaded route components for code-splitting
const GrievancePortal = lazy(() => import('./pages/GrievancePortal'));
const SimulationEngine = lazy(() => import('./pages/SimulationEngine'));
const AuthorityDashboard = lazy(() => import('./pages/AuthorityDashboard'));
const PatternDetection = lazy(() => import('./pages/PatternDetection'));
const TrackComplaint = lazy(() => import('./pages/TrackComplaint'));
const IntegrityVerifier = lazy(() => import('./pages/IntegrityVerifier'));
const Settings = lazy(() => import('./pages/Settings'));

function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, role } = useAuthStore();
  
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/" replace />;
  
  return children;
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<GrievancePortal />} />
          <Route path="/track/:tokenHash?" element={<TrackComplaint />} />
          <Route path="/simulation" element={<SimulationEngine />} />
          <Route path="/verify" element={<IntegrityVerifier />} />
          
          {/* Authority Routes */}
          <Route path="/authority" element={
            <ProtectedRoute requiredRole="authority">
              <AuthorityDashboard />
            </ProtectedRoute>
          } />
          
          {/* Analytics Routes */}
          <Route path="/patterns" element={<PatternDetection />} />
          
          {/* Settings */}
          <Route path="/settings" element={<Settings />} />
          
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
