import { Outlet, NavLink, useParams, useNavigate, useLocation } from "react-router-dom";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { useTheme } from "../../lib/theme";
import { useGlobalShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useProjectStore, useBookshelfStore } from "../../stores";
import { useEffect, useState, useRef } from "react";
import {
  BookOpen,
  LayoutDashboard,
  ScrollText,
  GitBranch,
  FileText,
  Users,
  Settings,
  ArrowLeft,
  ChevronDown,
  Library,
  Shield,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
} from "lucide-react";

const navItems = [
  { to: "dashboard", label: "看板", icon: LayoutDashboard },
  { to: "canon", label: "正典", icon: ScrollText },
  { to: "outline", label: "剧情树", icon: GitBranch },
  { to: "chapter/1", label: "章节", icon: FileText },
  { to: "characters", label: "角色", icon: Users },
  { to: "ledger", label: "账本", icon: Library },
  { to: "retcon-approval", label: "修史审批", icon: Shield },
  { to: "settings", label: "设置", icon: Settings },
];

interface RecentVisit {
  path: string;
  label: string;
  navTo: string;
  visitedAt: number;
}

const RECENT_VISITS_KEY = "novelos_recent_visits";
const MAX_RECENT = 3;

function getRecentVisits(): RecentVisit[] {
  try {
    const raw = localStorage.getItem(RECENT_VISITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function recordVisit(visit: RecentVisit) {
  try {
    const visits = getRecentVisits();
    // Remove duplicate of same path
    const filtered = visits.filter((v) => v.path !== visit.path);
    filtered.unshift(visit);
    // Keep only MAX_RECENT
    localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

export function AppShell() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, fetch, switchProject } = useProjectStore();
  const { items, fetch: fetchBookshelf, openProject } = useBookshelfStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>(getRecentVisits());
  const switcherRef = useRef<HTMLDivElement>(null);

  const { theme, toggle: toggleTheme } = useTheme();
  useGlobalShortcuts();

  useEffect(() => {
    fetch();
    fetchBookshelf();
  }, [fetch, fetchBookshelf]);

  useEffect(() => {
    if (!switcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [switcherOpen]);

  // Track page visits for "recent visits" sidebar section
  useEffect(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    // Path format: /project/:projectId/:page
    if (segments.length < 3) return;
    const pageSegment = segments[2];
    // Map segment to nav label
    const match = navItems.find((item) => {
      const itemSeg = item.to.split("/")[0];
      return pageSegment === itemSeg;
    });
    if (!match) return;
    const visit: RecentVisit = {
      path: `/project/${projectId}/${match.to}`,
      label: match.label,
      navTo: match.to,
      visitedAt: Date.now(),
    };
    recordVisit(visit);
    setRecentVisits(getRecentVisits());
  }, [location.pathname, projectId]);

  const handleSwitch = async (id: string) => {
    setSwitcherOpen(false);
    if (id === projectId) return;
    await openProject(id);
    navigate(`/project/${id}/dashboard`);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? "w-14" : "w-56"
        }`}
      >
        <div className="p-4 border-b border-gray-100">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm mb-3"
          >
            <ArrowLeft size={16} />
            {!sidebarCollapsed && "返回书架"}
          </button>

          {/* Book context switcher */}
          <div className="relative" ref={switcherRef}>
            <button
              onClick={() => setSwitcherOpen(!switcherOpen)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <BookOpen size={18} className="text-indigo-600 shrink-0" />
              {!sidebarCollapsed && (
                <span className="font-semibold text-gray-900 truncate text-sm">
                  {project?.title || "加载中..."}
                </span>
              )}
              <ChevronDown size={14} className="text-gray-400 shrink-0 ml-auto" />
            </button>
            {switcherOpen && (
              <div className="absolute left-0 top-full mt-1 w-full min-w-[200px] bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSwitch(item.project_id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 ${
                      item.project_id === projectId
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-700"
                    }`}
                  >
                    <BookOpen size={14} className="shrink-0" />
                    <span className="truncate">{item.title}</span>
                    <span
                      className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${
                        item.status === "active"
                          ? "bg-green-100 text-green-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {project && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
              {project.status}
            </span>
          )}
        </div>

        {/* Recent visits */}
        {!sidebarCollapsed && recentVisits.length > 0 && (
          <div className="px-2 pt-2 pb-1 border-b border-gray-100">
            <p className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              最近访问
            </p>
            {recentVisits.map((visit) => {
              const match = navItems.find((n) => n.to === visit.navTo);
              const Icon = match?.icon || FileText;
              return (
                <button
                  key={visit.path}
                  onClick={() => navigate(visit.path)}
                  className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  <Icon size={14} />
                  <span className="truncate">{visit.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <nav className="flex-1 p-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={`/project/${projectId}/${to}`}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <Icon size={18} />
              {!sidebarCollapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-gray-100">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title={sidebarCollapsed ? "展开侧栏" : "折叠侧栏"}
          >
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-end gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
          <GlobalSearch />
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
            title={theme === "dark" ? "切换亮色主题" : "切换深色主题"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <NotificationBell />
        </div>
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
