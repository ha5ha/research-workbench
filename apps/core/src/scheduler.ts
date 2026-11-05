import type { Schedule, ScheduleStore } from "./schedule-store.js";

export type ScheduleRunner = (schedule: Schedule) => Promise<void>;

/**
 * Minute-scale ticker for due schedules.
 *
 * The store owns `next_run_at`, so a restart resumes from the persisted state
 * instead of firing everything immediately; a missed window is caught up on the
 * first tick after start.
 */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly store: ScheduleStore,
    private readonly run: ScheduleRunner,
    private readonly tickMs = 15_000
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Runs every schedule that is due; returns the ids that ran. */
  async tick(now = new Date()): Promise<string[]> {
    if (this.running) return [];
    this.running = true;
    const fired: string[] = [];
    try {
      for (const schedule of this.store.list()) {
        if (!schedule.enabled) continue;
        if (new Date(schedule.nextRunAt).getTime() > now.getTime()) continue;
        await this.run(schedule);
        this.store.markRun(schedule.id, now);
        fired.push(schedule.id);
      }
    } finally {
      this.running = false;
    }
    return fired;
  }
}
