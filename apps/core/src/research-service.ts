import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ResearchTaskStatus = "todo" | "active" | "done";

export interface ResearchTask {
  id: string;
  title: string;
  status: ResearchTaskStatus;
}

export interface ResearchQuestion {
  id: string;
  title: string;
  tasks: ResearchTask[];
}

interface ResearchFile {
  questions: ResearchQuestion[];
}

/**
 * Minimal persisted research structure. A fresh workspace starts empty:
 * no sample questions, tasks or conversations are fabricated by the app.
 */
export class ResearchService {
  constructor(private readonly workspaceRoot: string) {}

  async tree(): Promise<ResearchQuestion[]> {
    return (await this.read()).questions;
  }

  async createQuestion(title: string): Promise<ResearchQuestion> {
    const clean = title.trim();
    if (!clean) throw new Error("研究问题不能为空");
    const file = await this.read();
    const sequence = this.nextSequence(
      file.questions.map((question) => question.id),
      "Q-"
    );
    const question: ResearchQuestion = {
      id: `Q-${String(sequence).padStart(2, "0")}`,
      title: clean,
      tasks: []
    };
    file.questions.push(question);
    await this.write(file);
    return question;
  }

  async createTask(
    questionId: string,
    title: string
  ): Promise<ResearchTask> {
    const clean = title.trim();
    if (!clean) throw new Error("任务不能为空");
    const file = await this.read();
    const question = file.questions.find((item) => item.id === questionId);
    if (!question) throw new Error("研究问题不存在");
    const sequence = this.nextSequence(
      file.questions.flatMap((item) => item.tasks.map((task) => task.id)),
      "T-"
    );
    const task: ResearchTask = {
      id: `T-${String(sequence).padStart(2, "0")}`,
      title: clean,
      status: "todo"
    };
    question.tasks.push(task);
    await this.write(file);
    return task;
  }

  async setTaskStatus(
    taskId: string,
    status: ResearchTaskStatus
  ): Promise<ResearchTask> {
    const file = await this.read();
    for (const question of file.questions) {
      const task = question.tasks.find((item) => item.id === taskId);
      if (task) {
        task.status = status;
        await this.write(file);
        return task;
      }
    }
    throw new Error("任务不存在");
  }

  private async read(): Promise<ResearchFile> {
    try {
      const parsed = JSON.parse(
        await readFile(this.path(), "utf8")
      ) as ResearchFile;
      return {
        questions: Array.isArray(parsed.questions) ? parsed.questions : []
      };
    } catch {
      return { questions: [] };
    }
  }

  private async write(file: ResearchFile): Promise<void> {
    await mkdir(join(this.workspaceRoot, ".research"), {
      recursive: true
    });
    const temporary = `${this.path()}.tmp`;
    await writeFile(temporary, JSON.stringify(file, null, 2), "utf8");
    await rename(temporary, this.path());
  }

  private path(): string {
    return join(this.workspaceRoot, ".research", "research.json");
  }

  private nextSequence(ids: string[], prefix: string): number {
    const values = ids
      .filter((id) => id.startsWith(prefix))
      .map((id) => Number(id.slice(prefix.length)))
      .filter((value) => Number.isFinite(value));
    return values.length > 0 ? Math.max(...values) + 1 : 1;
  }
}
