import { useState, useEffect, useCallback } from "react";
import { Activity, Pause, X, Play } from "lucide-react";
import { taskApi, type BackgroundTask } from "../../lib/api";

export function TaskIndicator({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  const refresh = useCallback(async () => {
    try {
      const result = await taskApi.listProjectTasks(projectId);
      setTasks(result);
    } catch {
      setTasks([]);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (tasks.length === 0) return null;

  const handleCancel = async (taskId: string) => {
    try {
      await taskApi.cancelTask(taskId);
      refresh();
    } catch {}
  };

  const handlePause = async (taskId: string) => {
    try {
      await taskApi.pauseTask(taskId);
      refresh();
    } catch {}
  };

  const handleResume = async (taskId: string) => {
    try {
      await taskApi.resumeTask(taskId);
      refresh();
    } catch {}
  };

  return (
    <div className="mt-2 space-y-1">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2 text-xs">
          <Activity
            size={12}
            className={
              task.status === "running" ? "text-blue-500 animate-pulse" : "text-yellow-500"
            }
          />
          <span className="text-gray-600 truncate flex-1">{task.label}</span>
          <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${task.status === "running" ? "bg-blue-500" : "bg-yellow-500"}`}
              style={{ width: `${task.progress * 100}%` }}
            />
          </div>
          <span className="text-gray-400 w-8 text-right">{Math.round(task.progress * 100)}%</span>
          {task.status === "running" && (
            <button
              onClick={() => handlePause(task.id)}
              className="p-0.5 hover:text-yellow-600"
              title="暂停"
            >
              <Pause size={10} />
            </button>
          )}
          {task.status === "paused" && (
            <button
              onClick={() => handleResume(task.id)}
              className="p-0.5 hover:text-green-600"
              title="恢复"
            >
              <Play size={10} />
            </button>
          )}
          <button
            onClick={() => handleCancel(task.id)}
            className="p-0.5 hover:text-red-600"
            title="取消"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Badge for bookshelf cards showing active task count
export function TaskBadge({ projectId }: { projectId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      try {
        const result = await taskApi.listProjectTasks(projectId);
        setCount(result.length);
      } catch {
        setCount(0);
      }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [projectId]);

  if (count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
      <Activity size={10} className="animate-pulse" />
      {count}个任务
    </span>
  );
}
