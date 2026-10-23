import type { RpcEvent } from "@research-workbench/contracts";

interface CoreStatus {
  state: "starting" | "online" | "stopped" | "error";
  message: string;
}

declare global {
  interface Window {
    rw: {
      request<T>(method: string, params?: unknown): Promise<T>;
      status(): Promise<CoreStatus | null>;
      onEvent(handler: (event: RpcEvent) => void): () => void;
      onStatus(handler: (status: CoreStatus) => void): () => void;
    };
  }
}

export {};
