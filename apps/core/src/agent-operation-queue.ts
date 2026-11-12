/** Single runtime: one turn, serialized mutations, abort before switching context. */
export class AgentOperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private active = false;
  private turn: Promise<unknown> | null = null;
  private controller: AbortController | null = null;

  prompt<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.active)
      return Promise.reject(
        new Error("AGENT_BUSY: Agent 正在执行或切换会话，请稍后重试")
      );
    this.active = true;
    const controller = new AbortController();
    this.controller = controller;
    const operation = this.tail
      .catch(() => {})
      .then(async () => {
        controller.signal.throwIfAborted();
        const result = await run(controller.signal);
        // The SDK can resolve a partial response after abort; it is not a successful turn.
        controller.signal.throwIfAborted();
        return result;
      });
    this.turn = operation;
    return operation.finally(() => {
      this.active = false;
      if (this.turn === operation) {
        this.turn = null;
        this.controller = null;
      }
    });
  }

  cancel(): void {
    this.controller?.abort(
      new DOMException("Agent 已中断，改动留在工作区供审阅。", "AbortError")
    );
  }

  mutate<T>(run: () => Promise<T> | T, abort: () => Promise<void>): Promise<T> {
    const turn = this.turn;
    this.cancel();
    const operation = this.tail
      .catch(() => {})
      .then(async () => {
        if (turn) {
          await abort();
          await turn.catch(() => {});
        }
        return run();
      });
    this.tail = operation;
    return operation;
  }
}
