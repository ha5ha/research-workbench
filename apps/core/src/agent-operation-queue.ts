/** Single runtime: one turn, serialized mutations, abort before switching context. */
export class AgentOperationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private active = false;
  private mutating = 0;
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
      .then(() => run(controller.signal));
    this.turn = operation;
    return operation.finally(() => {
      this.active = false;
      if (this.turn === operation) {
        this.turn = null;
        this.controller = null;
      }
    });
  }

  mutate<T>(run: () => Promise<T> | T, abort: () => Promise<void>): Promise<T> {
    this.mutating += 1;
    const turn = this.turn;
    this.controller?.abort();
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
    return operation.finally(() => {
      this.mutating -= 1;
    });
  }
}
