import { HomeIcon, Users, Activity, AlertTriangle, Shield, MapPin, Cuboid } from "lucide-react";
import Index from "./pages/Index.jsx";
import Residents from "./pages/Residents.jsx";
import HealthData from "./pages/HealthData.jsx";
import Alerts from "./pages/Alerts.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import IndoorPosition from "./pages/IndoorPosition.jsx";
import ElderModel3D from "./pages/ElderModel3D.jsx";

/**
 * Central place for defining the navigation items. Used for navigation components and routing.
 */
export const navItems = [
  {
    title: "Dashboard",
    to: "/",
    icon: <HomeIcon className="h-4 w-4" />,
    page: <Index />,
    roles: ["ADMIN", "RESIDENT_VIEWER"],
  },
  {
    title: "Admin Dashboard",
    to: "/admin",
    icon: <Shield className="h-4 w-4" />,
    page: <AdminDashboard />,
    roles: ["ADMIN"],
  },
  {
    title: "Residents",
    to: "/residents",
    icon: <Users className="h-4 w-4" />,
    page: <Residents />,
    roles: ["ADMIN", "RESIDENT_VIEWER"],
  },
  {
    title: "Health Data",
    to: "/health-data",
    icon: <Activity className="h-4 w-4" />,
    page: <HealthData />,
    roles: ["ADMIN", "RESIDENT_VIEWER"],
  },
  {
    title: "Alerts",
    to: "/alerts",
    icon: <AlertTriangle className="h-4 w-4" />,
    page: <Alerts />,
    roles: ["ADMIN", "RESIDENT_VIEWER"],
  },
  {
    title: "Indoor Position",
    to: "/indoor-position",
    icon: <MapPin className="h-4 w-4" />,
    page: <IndoorPosition />,
    roles: ["ADMIN", "RESIDENT_VIEWER"],
  },
  {
    title: "3D Elder Model",
    to: "/elder-model-3d",
    icon: <Cuboid className="h-4 w-4" />,
    page: <ElderModel3D />,
    roles: ["ADMIN", "RESIDENT_VIEWER"],
  },
];

export const canAccessNavItem = (item, role) => item.roles.includes(role);
