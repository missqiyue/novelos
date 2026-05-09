import { Outlet, NavLink, useParams, useNavigate, useLocation } from "react-router-dom";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { useTheme } from "../../lib/theme";
import { useGlobalShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useProjectStore, useBookshelfStore, useUiStore } from "../../stores";
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
  ShieldAlert,
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
  { to: "compliance-shield", label: "合规盾", icon: ShieldAlert },
  { to: "settings", label: "设置", icon: Settings },
];



export function AppShell() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { project, fetch, switchProject } = useProjectStore();
  const { items, fetch: fetchBookshelf, openProject } = useBookshelfStore();
  const { zenMode } = useUiStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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



  const handleSwitch = async (id: string) => {
    setSwitcherOpen(false);
    if (id === projectId) return;
    await openProject(id);
    navigate(`/project/${id}/dashboard`);
  };

  if (zenMode) {
    return (
      <div className="h-screen bg-gray-50">
        <main className="h-full">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    );
  }

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
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
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
