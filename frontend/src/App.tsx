import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import WorkflowsPage from '@/pages/WorkflowsPage'
import WorkflowDetailPage from '@/pages/WorkflowDetailPage'
import CreateWorkflowPage from '@/pages/CreateWorkflowPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/workflows"
            element={
              <PrivateRoute>
                <WorkflowsPage />
              </PrivateRoute>
            }
          />
          {/* /workflows/new MUST be before /workflows/:id so React Router
              doesn't treat "new" as a dynamic workflow ID */}
          <Route
            path="/workflows/new"
            element={
              <PrivateRoute>
                <CreateWorkflowPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/workflows/:id"
            element={
              <PrivateRoute>
                <WorkflowDetailPage />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
