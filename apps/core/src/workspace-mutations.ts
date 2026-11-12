import { AsyncLocalStorage } from "node:async_hooks";

export interface WorkspaceMutation {
  path: string;
  sha256: string;
}
export interface WorkspaceTransaction {
  writes: WorkspaceMutation[];
  commandsRan: boolean;
}
const transactions = new AsyncLocalStorage<WorkspaceTransaction>();
export async function trackWorkspaceWrites<T>(run: () => Promise<T>) {
  const transaction: WorkspaceTransaction = { writes: [], commandsRan: false };
  const result = await transactions.run(transaction, run);
  return { result, transaction };
}
export function recordWorkspaceWrite(write: WorkspaceMutation) {
  transactions.getStore()?.writes.push(write);
}
export function recordWorkspaceCommand() {
  const current = transactions.getStore();
  if (current) current.commandsRan = true;
}
