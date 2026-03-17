import { HomeIcon, Users, Activity, AlertTriangle, Settings, Shield } from "lucide-react";
import Index from "./pages/Index.jsx";
import Residents from "./pages/Residents.jsx";
import HealthData from "./pages/HealthData.jsx";
import Alerts from "./pages/Alerts.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

/**
 * Central place for defining the navigation items. Used for navigation components and routing.
 */
export const navItems = [
  {
    title: "Dashboard",
    to: "/",
    icon: <HomeIcon className="h-4 w-4" />,
    page: <Index />,
  },
  {
    title: "Admin Dashboard",
    to: "/admin",
    icon: <Shield className="h-4 w-4" />,
    page: <AdminDashboard />,
  },
  {
    title: "Residents",
    to: "/residents",
    icon: <Users className="h-4 w-4" />,
    page: <Residents />,
  },
  {
    title: "Health Data",
    to: "/health-data",
    icon: <Activity className="h-4 w-4" />,
    page: <HealthData />,
  },
  {
    title: "Alerts",
    to: "/alerts",
    icon: <AlertTriangle className="h-4 w-4" />,
    page: <Alerts />,
  },
];
