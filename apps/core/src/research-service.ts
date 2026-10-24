import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ResearchTaskStatus = "todo" | "active" | "done";
export type ResearchRouteStatus = "planned" | "active" | "done";

export interface ResearchTask {
  id: string;
  title: string;
  status: ResearchTaskStatus;
}

export interface LiteratureItem {
  id: string;
  title: string;
  path?: string;
  url?: string;
  note?: string;
  addedAt: string;
}

export interface ResearchRoute {
  id: string;
  title: string;
  status: ResearchRouteStatus;
  tasks: ResearchTask[];
}

export interface ResearchTopic {
  id: string;
  title: string;
  description: string;
  literature: LiteratureItem[];
  routes: ResearchRoute[];
}

interface ResearchFile {
  version: 2;
  topics: ResearchTopic[];
}

interface LegacyTask {
  id?: unknown;
  title?: unknown;
  status?: unknown;
}

interface LegacyQuestion {
  id?: unknown;
  title?: unknown;
  tasks?: unknown;
}

const TASK_STATUSES: ResearchTaskStatus[] = ["todo", "active", "done"];
const ROUTE_STATUSES: ResearchRouteStatus[] = ["planned", "active", "done"];

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function taskStatus(value: unknown): ResearchTaskStatus {
  return TASK_STATUSES.includes(value as ResearchTaskStatus)
    ? (value as ResearchTaskStatus)
    : "todo";
}

function routeStatus(value: unknown): ResearchRouteStatus {
  return ROUTE_STATUSES.includes(value as ResearchRouteStatus)
    ? (value as ResearchRouteStatus)
    : "planned";
}

function normalizeTask(
  value: LegacyTask,
  taskId: string
): ResearchTask {
  return {
    id: taskId,
    title: stringValue(value.title, "未命名任务"),
    status: taskStatus(value.status)
  };
}

function deriveRouteStatus(route: ResearchRoute): ResearchRouteStatus {
  if (route.tasks.length === 0) return route.status;
  if (route.tasks.every((task) => task.status === "done")) return "done";
  if (route.tasks.some((task) => task.status !== "todo")) return "active";
  return route.status === "done" ? "done" : "planned";
}

/**
 * Persisted research structure:
 * 课题 (topic) -> 研究路线 (route) -> 任务 (task).
 *
 * A fresh workspace starts empty. Legacy `questions` files are migrated into
 * one topic with one route per old question.
 */
export class ResearchService {
  constructor(private readonly workspaceRoot: string) {}

  async tree(): Promise<ResearchTopic[]> {
    return (await this.read()).topics;
  }

  async createTopic(
    title: string,
    description = ""
  ): Promise<ResearchTopic> {
    const clean = title.trim();
    if (!clean) throw new Error("课题名称不能为空");
    const file = await this.read();
    const sequence = this.nextSequence(
      file.topics.map((topic) => topic.id),
      "TP-"
    );
    const topic: ResearchTopic = {
      id: `TP-${String(sequence).padStart(2, "0")}`,
      title: clean,
      description: description.trim(),
      literature: [],
      routes: []
    };
    file.topics.push(topic);
    await this.write(file);
    return topic;
  }

  async updateTopic(
    topicId: string,
    input: { title?: string; description?: string }
  ): Promise<ResearchTopic> {
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    if (typeof input.title === "string") {
      if (!input.title.trim()) throw new Error("课题名称不能为空");
      topic.title = input.title.trim();
    }
    if (typeof input.description === "string") {
      topic.description = input.description.trim();
    }
    await this.write(file);
    return topic;
  }

  async addLiterature(
    topicId: string,
    input: {
      title: string;
      path?: string;
      url?: string;
      note?: string;
    }
  ): Promise<LiteratureItem> {
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const title = input.title.trim();
    if (!title) throw new Error("文献标题不能为空");
    const sequence = this.nextSequence(
      file.topics.flatMap((item) =>
        item.literature.map((entry) => entry.id)
      ),
      "L-"
    );
    const item: LiteratureItem = {
      id: `L-${String(sequence).padStart(2, "0")}`,
      title,
      path: input.path?.trim() || undefined,
      url: input.url?.trim() || undefined,
      note: input.note?.trim() || undefined,
      addedAt: new Date().toISOString()
    };
    topic.literature.push(item);
    await this.write(file);
    return item;
  }

  async removeLiterature(
    topicId: string,
    literatureId: string
  ): Promise<ResearchTopic> {
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    topic.literature = topic.literature.filter(
      (item) => item.id !== literatureId
    );
    await this.write(file);
    return topic;
  }

  async createRoute(topicId: string, title: string): Promise<ResearchRoute> {
    const clean = title.trim();
    if (!clean) throw new Error("研究路线不能为空");
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const sequence = this.nextSequence(
      file.topics.flatMap((item) => item.routes.map((route) => route.id)),
      "R-"
    );
    const route: ResearchRoute = {
      id: `R-${String(sequence).padStart(2, "0")}`,
      title: clean,
      status: "planned",
      tasks: []
    };
    topic.routes.push(route);
    await this.write(file);
    return route;
  }

  async setRouteStatus(
    routeId: string,
    status: ResearchRouteStatus
  ): Promise<ResearchRoute> {
    if (!ROUTE_STATUSES.includes(status)) {
      throw new Error("研究路线状态无效");
    }
    const file = await this.read();
    for (const topic of file.topics) {
      const route = topic.routes.find((item) => item.id === routeId);
      if (route) {
        route.status = status;
        await this.write(file);
        return route;
      }
    }
    throw new Error("研究路线不存在");
  }

  async createTask(routeId: string, title: string): Promise<ResearchTask> {
    const clean = title.trim();
    if (!clean) throw new Error("任务不能为空");
    const file = await this.read();
    const route = this.findRoute(file, routeId);
    const sequence = this.nextSequence(
      file.topics.flatMap((topic) =>
        topic.routes.flatMap((item) =>
          item.tasks.map((task) => task.id)
        )
      ),
      "T-"
    );
    const task: ResearchTask = {
      id: `T-${String(sequence).padStart(2, "0")}`,
      title: clean,
      status: "todo"
    };
    route.tasks.push(task);
    await this.write(file);
    return task;
  }

  async setTaskStatus(
    taskId: string,
    status: ResearchTaskStatus
  ): Promise<ResearchTask> {
    if (!TASK_STATUSES.includes(status)) {
      throw new Error("任务状态无效");
    }
    const file = await this.read();
    for (const topic of file.topics) {
      for (const route of topic.routes) {
        const task = route.tasks.find((item) => item.id === taskId);
        if (task) {
          task.status = status;
          await this.write(file);
          return task;
        }
      }
    }
    throw new Error("任务不存在");
  }

  async suggestRouteStatus(routeId: string): Promise<ResearchRoute> {
    const file = await this.read();
    const route = this.findRoute(file, routeId);
    route.status = deriveRouteStatus(route);
    await this.write(file);
    return route;
  }

  private findTopic(file: ResearchFile, topicId: string): ResearchTopic {
    const topic = file.topics.find((item) => item.id === topicId);
    if (!topic) throw new Error("课题不存在");
    return topic;
  }

  private findRoute(file: ResearchFile, routeId: string): ResearchRoute {
    for (const topic of file.topics) {
      const route = topic.routes.find((item) => item.id === routeId);
      if (route) return route;
    }
    throw new Error("研究路线不存在");
  }

  private async read(): Promise<ResearchFile> {
    try {
      const raw = JSON.parse(await readFile(this.path(), "utf8")) as {
        version?: unknown;
        topics?: unknown;
        questions?: unknown;
      };
      if (Array.isArray(raw.topics)) {
        return {
          version: 2,
          topics: raw.topics as ResearchTopic[]
        };
      }
      const migrated = this.migrateLegacyQuestions(raw.questions);
      if (migrated.length > 0) {
        const file: ResearchFile = { version: 2, topics: migrated };
        await this.write(file);
        return file;
      }
      return { version: 2, topics: [] };
    } catch {
      return { version: 2, topics: [] };
    }
  }

  private migrateLegacyQuestions(value: unknown): ResearchTopic[] {
    if (!Array.isArray(value) || value.length === 0) return [];
    const routes: ResearchRoute[] = value
      .filter((item): item is LegacyQuestion => Boolean(item))
      .map((question, index) => {
        const tasks = Array.isArray(question.tasks)
          ? (question.tasks as LegacyTask[]).map((task, taskIndex) =>
              normalizeTask(task, `T-${String(taskIndex + 1).padStart(2, "0")}`)
            )
          : [];
        const route: ResearchRoute = {
          id: `R-${String(index + 1).padStart(2, "0")}`,
          title: stringValue(question.title, "未命名研究路线"),
          status: "planned",
          tasks
        };
        route.status = deriveRouteStatus(route);
        return route;
      });
    return [
      {
        id: "TP-01",
        title: "未命名课题",
        description: "由旧版研究问题迁移；可以编辑课题描述。",
        literature: [],
        routes
      }
    ];
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
      .filter((id) => typeof id === "string" && id.startsWith(prefix))
      .map((id) => Number(id.slice(prefix.length)))
      .filter((value) => Number.isFinite(value));
    return values.length > 0 ? Math.max(...values) + 1 : 1;
  }
}
