import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceFile } from "@research-workbench/contracts";
import { requestError } from "../request-error";

export type OpenTab = {
  path: string;
  content: string;
  original: string;
  sha256?: string;
};

export function useEditorBuffers(
  workspaceRoot: string | null,
  onSaved: () => void
) {
  const key = workspaceRoot ? `rw.ide.tabs.${workspaceRoot}` : null;
  const [state, setState] = useState<{
    key: string | null;
    tabs: OpenTab[];
    activePath: string | null;
  }>({ key: null, tabs: [], activePath: null });
  const [fileBusy, setFileBusy] = useState(false);
  const busy = useRef(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState<WorkspaceFile | null>(null);
  const epoch = useRef(0);
  const tabs = state.key === key ? state.tabs : [];
  const activePath = state.key === key ? state.activePath : null;
  const active = tabs.find((tab) => tab.path === activePath) ?? null;
  useEffect(() => {
    epoch.current += 1;
    let saved: { tabs?: OpenTab[]; activePath?: string | null } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(key ?? "") ?? "{}");
    } catch {
      /* Keep unreadable cache separate from disk. */
    }
    setState({
      key,
      tabs: Array.isArray(saved.tabs) ? saved.tabs : [],
      activePath: saved.activePath ?? null
    });
    setConflict(null);
    setFileError(null);
  }, [key]);
  useEffect(() => {
    if (key && state.key === key)
      sessionStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  const setTabs = (update: (tabs: OpenTab[]) => OpenTab[]) =>
    setState((current) => ({ ...current, tabs: update(current.tabs) }));
  const setActivePath = (path: string | null) => {
    setState((current) => ({ ...current, activePath: path }));
    setConflict(null);
  };
  const openPath = useCallback(async (path: string) => {
    const requestEpoch = epoch.current;
    setFileError(null);
    setSaveNote(null);
    try {
      const file = await window.rw.request("workspace.read", { path });
      if (requestEpoch !== epoch.current) return;
      setState((current) => ({
        ...current,
        activePath: file.path,
        tabs: current.tabs.some((tab) => tab.path === file.path)
          ? current.tabs
          : [...current.tabs, { ...file, original: file.content }]
      }));
      setConflict(null);
    } catch (failure) {
      if (requestEpoch === epoch.current) setFileError(requestError(failure));
    }
  }, []);
  const closeTab = (path: string) => {
    const tab = tabs.find((item) => item.path === path);
    if (
      tab &&
      tab.content !== tab.original &&
      !window.confirm(`${path} 有未保存的修改，仍然关闭？`)
    )
      return;
    setState((current) => {
      const next = current.tabs.filter((item) => item.path !== path);
      return {
        ...current,
        tabs: next,
        activePath:
          current.activePath === path
            ? (next.at(-1)?.path ?? null)
            : current.activePath
      };
    });
    setConflict(null);
  };
  const saveFile = async (expected = active?.sha256) => {
    if (!active || busy.current) return;
    busy.current = true;
    setFileBusy(true);
    const requestEpoch = epoch.current;
    const submitted = active;
    setFileError(null);
    try {
      if (!expected)
        throw new Error(
          "FILE_CONFLICT: 恢复的旧缓冲区缺少文件版本，请先比较磁盘内容。"
        );
      const result = await window.rw.request("workspace.write", {
        path: submitted.path,
        content: submitted.content,
        expectedSha256: expected
      });
      if (requestEpoch !== epoch.current) return;
      // Edits typed during save stay dirty; only the submitted content became the baseline.
      setTabs((current) =>
        current.map((tab) =>
          tab.path === submitted.path
            ? { ...tab, original: submitted.content, sha256: result.sha256 }
            : tab
        )
      );
      setConflict(null);
      setSaveNote(`已保存 ${result.path} · ${result.size} B`);
      onSaved();
    } catch (failure) {
      if (requestEpoch !== epoch.current) return;
      const message = requestError(failure);
      const isConflict = message.includes("FILE_CONFLICT");
      setFileError(
        isConflict
          ? "文件已由其他编辑器或 Agent 更新，当前修改尚未保存。请比较磁盘版本后重新保存。"
          : message
      );
      if (isConflict) {
        try {
          const disk = await window.rw.request("workspace.read", {
            path: submitted.path
          });
          if (requestEpoch === epoch.current) setConflict(disk);
        } catch {
          /* A deleted file remains a conflict; never recreate it silently. */
        }
      }
    } finally {
      busy.current = false;
      setFileBusy(false);
    }
  };
  const reloadConflict = () => {
    if (
      !conflict ||
      active?.path !== conflict.path ||
      !window.confirm("重新载入磁盘版本会丢弃当前文件的未保存修改，继续？")
    )
      return;
    setTabs((current) =>
      current.map((tab) =>
        tab.path === conflict.path
          ? { ...conflict, original: conflict.content }
          : tab
      )
    );
    setConflict(null);
    setFileError(null);
  };
  const overwriteConflict = () => {
    if (
      conflict &&
      active?.path === conflict.path &&
      window.confirm("确认用当前缓冲区覆盖刚刚展示的磁盘版本？")
    )
      void saveFile(conflict.sha256);
  };
  return {
    tabs,
    setTabs,
    activePath,
    setActivePath,
    active,
    fileBusy,
    fileError,
    saveNote,
    conflict,
    openPath,
    closeTab,
    saveFile,
    reloadConflict,
    overwriteConflict
  };
}
