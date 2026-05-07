import { useState, useEffect, useRef } from "react";
import { ledgerApi, type NotificationInfo as Notif } from "../../lib/api";
import { Bell, AlertTriangle, Info, CheckCircle, X, Circle } from "lucide-react";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<(Notif & { _parsed?: any })[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const all = await ledgerApi.listNotifications();
      setNotifs(all);
      setUnread(all.filter((n) => !n.read_status).length);
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: string) => {
    await ledgerApi.markNotificationRead(id);
    await load();
  };

  const severityIcon = (s: string) => {
    switch (s) {
      case "error":
        return <AlertTriangle size={12} className="text-red-500" />;
      case "warning":
        return <AlertTriangle size={12} className="text-amber-500" />;
      case "success":
        return <CheckCircle size={12} className="text-green-500" />;
      default:
        return <Info size={12} className="text-blue-500" />;
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-medium">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-900">通知</span>
            {unread > 0 && <span className="text-xs text-indigo-600">{unread} 条未读</span>}
          </div>
          {notifs.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">暂无通知</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifs.map((n) => (
                <div
                  key={n.id}
                  className={`px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${
                    !n.read_status ? "bg-indigo-50/50" : ""
                  }`}
                  onClick={() => markRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    {severityIcon(n.severity)}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 text-xs leading-relaxed">{n.message}</p>
                      <span className="text-[10px] text-gray-400">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                      </span>
                    </div>
                    {!n.read_status && (
                      <Circle size={8} className="text-indigo-500 fill-current shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
