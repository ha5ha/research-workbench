import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExperimentSummary,
  ExperimentFileDiff,
  StoredExperiment as ExperimentRecord,
  LoopOverview,
  ResearchScope
} from "@research-workbench/contracts";
export type DetailTab = "overview" | "seeds" | "files" | "plan" | "code";
export interface ExperimentRecordsProps {
  currentScope: ResearchScope;
  onOpenInIde: (path: string) => void;
  onLocateConversation: (scope: unknown) => void;
  onCountChange: (count: number) => void;
  onRecordsChange: (
    records: Array<Pick<ExperimentSummary, "id" | "scope">>
  ) => void;
  onOpenManagedRun: (id: string) => void;
}

export function useExperimentRecords({
  currentScope,
  onCountChange,
  onRecordsChange
}: ExperimentRecordsProps) {
  const loadVersion = useRef(0);
  const [records, setRecords] = useState<ExperimentSummary[]>([]);
  const [managed, setManaged] = useState<LoopOverview | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExperimentRecord | null>(null);
  const [selectedFile, setSelectedFile] = useState<ExperimentFileDiff | null>(
    null
  );
  const [tab, setTab] = useState<DetailTab>("overview");
  const [diffMode, setDiffMode] = useState<"split" | "unified">("split");
  const [onlyCurrentTask, setOnlyCurrentTask] = useState(true);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conclusionDraft, setConclusionDraft] = useState("");
  const [reusableDraft, setReusableDraft] = useState({
    kind: "",
    description: "",
    path: ""
  });
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    goal: "",
    metrics: "",
    conclusion: ""
  });

  const visibleRecords = useMemo(() => {
    if (!onlyCurrentTask || !currentScope.taskId) return records;
    return records.filter(
      (record) => record.scope?.taskId === currentScope.taskId
    );
  }, [records, onlyCurrentTask, currentScope.taskId]);

  const loadRecords = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const [next, overview] = await Promise.all([
        window.rw.request("experiments.list"),
        window.rw.request("loop.overview")
      ]);
      if (version !== loadVersion.current) return;
      setRecords(next);
      setManaged(overview);
      onCountChange(next.length);
      onRecordsChange(next);
    } catch (failure) {
      if (version === loadVersion.current)
        setError(
          failure instanceof Error ? failure.message : "读取实验记录失败"
        );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [onCountChange, onRecordsChange]);

  useEffect(() => {
    const version = loadVersion;
    void loadRecords();
    return () => {
      version.current++;
    };
  }, [loadRecords]);

  const saveRecord = async (patch: {
    conclusion?: string;
    reusable?: { kind: string; description: string; path?: string } | null;
    confirmed?: boolean;
  }) => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await window.rw.request("experiments.update", {
        id: selected.id,
        ...patch
      });
      setSelected((current) =>
        current?.id === updated.id ? updated : current
      );
      setNotice("记录已保存");
      await loadRecords();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存记录失败");
    } finally {
      setSaving(false);
    }
  };

  const createRecord = async () => {
    const title = createDraft.title.trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    try {
      await window.rw.request("experiments.create", {
        title,
        goal: createDraft.goal.trim(),
        metrics: createDraft.metrics.trim() || undefined,
        conclusion: createDraft.conclusion.trim() || undefined,
        seeds: 0,
        scope: currentScope
      });
      setCreateOpen(false);
      setCreateDraft({ title: "", goal: "", metrics: "", conclusion: "" });
      await loadRecords();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "新建记录失败");
    } finally {
      setSaving(false);
    }
  };

  // Keep the selection inside the filtered list, otherwise the detail panel can
  // show a record the user cannot see in the rows above it.
  useEffect(() => {
    if (!selectedId && visibleRecords.length === 0) return;
    if (selectedId && visibleRecords.some((item) => item.id === selectedId)) {
      return;
    }
    setSelectedId(visibleRecords[0]?.id ?? null);
  }, [visibleRecords, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setSelectedFile(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    setError(null);
    void window.rw
      .request("experiments.get", { id: selectedId })
      .then((record) => {
        if (!alive) return;
        setSelected(record);
        setSelectedFile(record.files[0] ?? null);
        setConclusionDraft(record.conclusion ?? "");
        setReusableDraft({
          kind: record.reusable?.kind ?? "",
          description: record.reusable?.description ?? "",
          path: record.reusable?.path ?? ""
        });
        setTab("overview");
      })
      .catch((failure) => {
        if (!alive) return;
        setError(
          failure instanceof Error ? failure.message : "读取实验详情失败"
        );
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  return {
    records,
    setRecords,
    managed,
    setManaged,
    notice,
    setNotice,
    selectedId,
    setSelectedId,
    selected,
    setSelected,
    selectedFile,
    setSelectedFile,
    tab,
    setTab,
    diffMode,
    setDiffMode,
    onlyCurrentTask,
    setOnlyCurrentTask,
    loading,
    setLoading,
    detailLoading,
    setDetailLoading,
    error,
    setError,
    conclusionDraft,
    setConclusionDraft,
    reusableDraft,
    setReusableDraft,
    saving,
    setSaving,
    createOpen,
    setCreateOpen,
    createDraft,
    setCreateDraft,
    visibleRecords,
    loadRecords,
    saveRecord,
    createRecord
  };
}
export type ExperimentRecordsModel = ReturnType<typeof useExperimentRecords>;
