import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { canAccessNavItem, navItems } from "./nav-items";
import Login from "./pages/Login";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { isAuthenticated, isReady, user } = useAuth();

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Restoring session...
      </div>
    );
  }

  const accessibleItems = isAuthenticated && user
    ? navItems.filter((item) => canAccessNavItem(item, user.role))
    : [];
  const defaultRoute = accessibleItems[0]?.to || "/";

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={defaultRoute} replace /> : <Login />}
      />

      <Route
        element={isAuthenticated ? <AppShell navItems={accessibleItems} /> : <Navigate to="/login" replace />}
      >
        {accessibleItems.map(({ to, page }) => (
          <Route key={to} path={to} element={page} />
        ))}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
