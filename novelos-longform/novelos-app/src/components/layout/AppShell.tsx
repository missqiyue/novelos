import { NavLink, useParams, useNavigate, useLocation, useOutlet } from "react-router-dom";
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
  Sparkles,
} from "lucide-react";

const navItems = [
  { to: "dashboard", label: "看板", icon: LayoutDashboard },
  { to: "canon", label: "正典", icon: ScrollText },
  { to: "book-outline", label: "全书大纲", icon: BookOpen },
  { to: "outline", label: "剧情树", icon: GitBranch },
  { to: "chapter-outline", label: "章节大纲", icon: FileText },
  { to: "chapters", label: "章节", icon: FileText },
  { to: "characters", label: "角色", icon: Users },
  { to: "ledger", label: "账本", icon: Library },
  { to: "global-resources", label: "资源库", icon: Sparkles },
  { to: "retcon-approval", label: "修史审批", icon: Shield },
  { to: "compliance-shield", label: "合规盾", icon: ShieldAlert },
  { to: "settings", label: "设置", icon: Settings },
];

const PATH_MEMORY_SECTIONS = new Set([
  "dashboard",
  "canon",
  "book-outline",
  "outline",
  "chapter-outline",
  "chapters",
  "chapter",
  "characters",
  "ledger",
  "global-resources",
  "retcon-approval",
  "compliance-shield",
  "settings",
]);

// Keep-alive is intentionally narrower than path memory.
// macOS 26's system WebKit has shown instability around hidden scroll-heavy pages,
// so we only preserve the chapter workbench across route switches for now.
const KEEP_ALIVE_SECTIONS = new Set(["chapter"]);

function getSectionKey(projectId: string | undefined, pathname: string): string | null {
  if (!projectId) return null;
  const prefix = `/project/${projectId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const section = rest.split("/")[0];
  return section || null;
}

function getDefaultNavPath(projectId: string | undefined, to: string): string {
  return `/project/${projectId}/${to}`;
}

export function AppShell() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const { project, fetch, switchProject } = useProjectStore();
  const { items, fetch: fetchBookshelf, openProject } = useBookshelfStore();
  const { zenMode } = useUiStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cachedOutlets, setCachedOutlets] = useState<
    Record<string, { path: string; node: React.ReactNode }>
  >({});
  const [lastVisitedPaths, setLastVisitedPaths] = useState<Record<string, string>>({});
  const switcherRef = useRef<HTMLDivElement>(null);
  const currentSection = getSectionKey(projectId, location.pathname);

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

  useEffect(() => {
    if (!currentSection || !projectId) return;
    if (!PATH_MEMORY_SECTIONS.has(currentSection)) return;

    setLastVisitedPaths((prev) => {
      if (prev[currentSection] === location.pathname) return prev;
      return { ...prev, [currentSection]: location.pathname };
    });

    if (!KEEP_ALIVE_SECTIONS.has(currentSection)) return;

    setCachedOutlets((prev) => {
      const existing = prev[currentSection];
      if (existing?.path === location.pathname) return prev;
      return {
        ...prev,
        [currentSection]: {
          path: location.pathname,
          node: outlet,
        },
      };
    });
  }, [currentSection, location.pathname, outlet, projectId]);

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
          <ErrorBoundary>{outlet}</ErrorBoundary>
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
              to={lastVisitedPaths[to.split("/")[0]] || getDefaultNavPath(projectId, to)}
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
            <>
              {Object.entries(cachedOutlets).map(([section, entry]) => {
                const isVisible = section === currentSection;
                return (
                  <div
                    key={section}
                    className="h-full"
                    style={{ display: isVisible ? "block" : "none" }}
                    aria-hidden={!isVisible}
                  >
                    {entry.node}
                  </div>
                );
              })}
              {(!currentSection || !KEEP_ALIVE_SECTIONS.has(currentSection)) && (
                <div className="h-full">{outlet}</div>
              )}
            </>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
