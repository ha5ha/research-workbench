import { useCallback, useState } from "react";
import type {
  GitStatus,
  GitCommitInfo,
  GitFileChange
} from "@research-workbench/contracts";
export function useWorkspaceGit() {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLog, setGitLog] = useState<GitCommitInfo[]>([]);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitDiff, setGitDiff] = useState<{
    path: string;
    staged: boolean;
    diff: string;
  } | null>(null);
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitNote, setCommitNote] = useState<string | null>(null);

  const loadGit = useCallback(async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const [status, log] = await Promise.all([
        window.rw.request("git.status"),
        window.rw.request("git.log")
      ]);
      setGitStatus(status);
      setGitLog(log);
    } catch (failure) {
      setGitError(
        failure instanceof Error ? failure.message : "读取 Git 状态失败"
      );
    } finally {
      setGitLoading(false);
    }
  }, []);

  const openGitDiff = async (file: GitFileChange) => {
    setGitDiffLoading(true);
    setGitError(null);
    try {
      const result = await window.rw.request("git.diff", {
        path: file.path,
        staged: file.staged
      });
      setGitDiff(result);
    } catch (failure) {
      setGitError(
        failure instanceof Error ? failure.message : "读取 Git diff 失败"
      );
    } finally {
      setGitDiffLoading(false);
    }
  };

  const stageFiles = async (paths: string[]) => {
    setGitError(null);
    try {
      await window.rw.request("git.stage", { paths });
      await loadGit();
    } catch (failure) {
      setGitError(failure instanceof Error ? failure.message : "暂存失败");
    }
  };

  const unstageFiles = async (paths: string[]) => {
    setGitError(null);
    try {
      await window.rw.request("git.unstage", { paths });
      await loadGit();
    } catch (failure) {
      setGitError(failure instanceof Error ? failure.message : "取消暂存失败");
    }
  };

  const commit = async () => {
    if (!commitMessage.trim() || commitBusy) return;
    setCommitBusy(true);
    setCommitNote(null);
    setGitError(null);
    try {
      const result = await window.rw.request("git.commit", {
        message: commitMessage
      });
      setCommitNote(`已提交 ${result.commit.slice(0, 8)}`);
      setCommitMessage("");
      await loadGit();
    } catch (failure) {
      setGitError(failure instanceof Error ? failure.message : "提交失败");
    } finally {
      setCommitBusy(false);
    }
  };

  return {
    gitStatus,
    gitLog,
    gitLoading,
    gitError,
    gitDiff,
    setGitDiff,
    gitDiffLoading,
    commitMessage,
    setCommitMessage,
    commitBusy,
    commitNote,
    loadGit,
    openGitDiff,
    stageFiles,
    unstageFiles,
    commit
  };
}
