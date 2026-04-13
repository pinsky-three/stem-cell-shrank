import React, { useState, useEffect, useRef, useCallback } from "react";
import { PromptInputBox } from "./ui/ai-prompt-box";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

const POLL_INTERVAL_MS = 2_000;
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

interface SpawnResult {
  project_id: string;
  job_id: string;
  status: string;
}

interface BuildJobStatus {
  id: string;
  status: string;
  error_message: string;
  duration_ms: number;
  logs: string;
}

function statusLabel(status: string) {
  switch (status) {
    case "running":
      return "Building…";
    case "succeeded":
      return "Build succeeded";
    case "failed":
      return "Build failed";
    case "queued":
      return "Queued";
    default:
      return status;
  }
}

function statusClasses(status: string) {
  switch (status) {
    case "succeeded":
      return "border-green-700/30 bg-green-950/20 text-green-300";
    case "failed":
      return "border-red-700/30 bg-red-950/20 text-red-300";
    default:
      return "border-indigo-700/30 bg-indigo-950/20 text-indigo-300";
  }
}

function LogViewer({ logs }: { logs: string }) {
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  if (!logs) return null;

  return (
    <pre
      ref={containerRef}
      className="mt-2 max-h-72 overflow-y-auto rounded-lg bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-green-400 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
    >
      {logs}
    </pre>
  );
}

export default function HeroPrompt() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SpawnResult | null>(null);
  const [jobStatus, setJobStatus] = useState<BuildJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/build_jobs/${jobId}`);
        if (!res.ok) return;
        const data: BuildJobStatus = await res.json();
        setJobStatus(data);
        if (TERMINAL_STATUSES.has(data.status)) {
          stopPolling();
          setIsLoading(false);
        }
      } catch {
        /* network blip — keep polling */
      }
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      pollJob(jobId);
      timerRef.current = setInterval(() => pollJob(jobId), POLL_INTERVAL_MS);
    },
    [pollJob, stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  const handleSend = async (message: string, _files?: File[]) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setJobStatus(null);

    try {
      const res = await fetch("/api/systems/spawn_environment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: DEFAULT_ORG_ID,
          user_id: DEFAULT_USER_ID,
          prompt: message,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }

      const data: SpawnResult = await res.json();
      setResult(data);
      startPolling(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  };

  const displayStatus = jobStatus?.status ?? result?.status ?? null;

  return (
    <div className="w-full space-y-3">
      <PromptInputBox
        placeholder="Ask Stem Cell to create a landing page for my..."
        onSend={handleSend}
        isLoading={isLoading}
      />

      {result && displayStatus && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm transition-colors duration-300 ${statusClasses(displayStatus)}`}
        >
          <div className="flex items-center gap-2">
            {!TERMINAL_STATUSES.has(displayStatus) && (
              <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
            )}
            <p className="font-medium">{statusLabel(displayStatus)}</p>
          </div>

          <p className="mt-1 font-mono text-xs opacity-70">
            project: {result.project_id} · job: {result.job_id}
            {jobStatus?.duration_ms
              ? ` · ${(jobStatus.duration_ms / 1000).toFixed(1)}s`
              : ""}
          </p>

          {jobStatus?.status === "failed" && jobStatus.error_message && (
            <p className="mt-2 text-xs opacity-80 break-all">
              {jobStatus.error_message.slice(0, 300)}
            </p>
          )}

          {jobStatus?.logs && <LogViewer logs={jobStatus.logs} />}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-700/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          <p className="font-medium">Failed to spawn</p>
          <p className="mt-1 text-xs text-red-400/70">{error}</p>
        </div>
      )}
    </div>
  );
}
