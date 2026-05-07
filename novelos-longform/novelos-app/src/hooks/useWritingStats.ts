import { useState, useEffect, useCallback, useRef } from "react";
import { writingSessionApi, type WritingSessionInfo } from "../lib/api";

interface ActiveSession {
  id: string;
  startWordCount: number;
  startTime: number;
}

export function useWritingStats(projectId?: string, currentWordCount?: number) {
  const [todayWords, setTodayWords] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const activeSessionRef = useRef<ActiveSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load today's stats from backend
  useEffect(() => {
    if (!projectId) return;
    writingSessionApi
      .listSessions()
      .then((sessions) => {
        const today = new Date().toISOString().split("T")[0];
        const todaySessions = sessions.filter((s) => s.started_at.startsWith(today));
        setTodayWords(todaySessions.reduce((sum, s) => sum + s.words_written, 0));
        setTodayMinutes(
          Math.round(todaySessions.reduce((sum, s) => sum + s.duration_seconds, 0) / 60),
        );
      })
      .catch(() => {});
  }, [projectId]);

  // Auto-end session on unmount
  useEffect(() => {
    return () => {
      if (activeSessionRef.current && currentWordCount !== undefined) {
        endSessionInternal(activeSessionRef.current, currentWordCount);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startSession = useCallback(
    (wordCount: number) => {
      if (!projectId) return;

      writingSessionApi
        .startSession({ start_word_count: wordCount })
        .then((session) => {
          activeSessionRef.current = {
            id: session.id,
            startWordCount: wordCount,
            startTime: Date.now(),
          };
          setSessionActive(true);
          // Keep a timer to track approximate duration for UI display
          timerRef.current = setInterval(() => {
            // Timer is just for UI; real duration computed on end
          }, 1000);
        })
        .catch(() => {});
    },
    [projectId],
  );

  const endSessionInternal = async (active: ActiveSession, endWordCount: number) => {
    try {
      const result = await writingSessionApi.endSession({
        session_id: active.id,
        end_word_count: endWordCount,
      });
      setTodayWords((w) => w + result.words_written);
      setTodayMinutes((m) => m + Math.round(result.duration_seconds / 60));
    } catch {
      // Session end failed — data will be slightly off but not lost
    }
  };

  const endSession = useCallback(() => {
    if (!activeSessionRef.current) return;
    const active = activeSessionRef.current;
    activeSessionRef.current = null;
    setSessionActive(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    endSessionInternal(active, currentWordCount ?? 0);
  }, [currentWordCount]);

  // No-op: word count is now tracked on end session
  const updateWordCount = useCallback((_wordCount: number) => {}, []);

  return {
    todayWords,
    todayMinutes,
    sessionActive,
    startSession,
    updateWordCount,
    endSession,
  };
}
