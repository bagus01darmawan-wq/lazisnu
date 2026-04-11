import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

// Pages - Auth
import LoginPage from './pages/LoginPage';

// Pages - Admin Ranting
import AdminBranchDashboard from './pages/admin/AdminBranchDashboard';
import CansPage from './pages/admin/CansPage';
import CanDetailPage from './pages/admin/CanDetailPage';
import OfficersPage from './pages/admin/OfficersPage';
import AssignmentsPage from './pages/admin/AssignmentsPage';
import ReportsPage from './pages/admin/ReportsPage';

// Pages - Admin Kecamatan
import AdminDistrictDashboard from './pages/admin/AdminDistrictDashboard';
import AllBranchesPage from './pages/admin/AllBranchesPage';

// Pages - Bendahara
import BendaharaDashboard from './pages/bendahara/BendaharaDashboard';
import TransactionsPage from './pages/bendahara/TransactionsPage';
import ExportPage from './pages/bendahara/ExportPage';

// Components
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected Routes - Admin Ranting */}
      <Route path="/admin/branch" element={
        <PrivateRoute roles={['ADMIN_RANTING']}>
          <DashboardLayout />
        </PrivateRoute>
      }>
        <Route index element={<AdminBranchDashboard />} />
        <Route path="cans" element={<CansPage />} />
        <Route path="cans/:id" element={<CanDetailPage />} />
        <Route path="officers" element={<OfficersPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      {/* Protected Routes - Admin Kecamatan */}
      <Route path="/admin/district" element={
        <PrivateRoute roles={['ADMIN_KECAMATAN']}>
          <DashboardLayout />
        </PrivateRoute>
      }>
        <Route index element={<AdminDistrictDashboard />} />
        <Route path="branches" element={<AllBranchesPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      {/* Protected Routes - Bendahara */}
      <Route path="/bendahara" element={
        <PrivateRoute roles={['BENDAHARA']}>
          <DashboardLayout />
        </PrivateRoute>
      }>
        <Route index element={<BendaharaDashboard />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="export" element={<ExportPage />} />
      </Route>

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;