import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ResearchTaskStatus = "todo" | "active" | "done";
export type ResearchQuestionStatus = "planned" | "active" | "done";

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

/** A code project under a topic: different repos / different ways to run. */
export interface ResearchProject {
  id: string;
  name: string;
  path?: string;
  createdAt: string;
}

/** Curated internal knowledge: terms, dataset notes, method notes. */
export interface KnowledgeItem {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

export interface ResearchQuestion {
  id: string;
  title: string;
  status: ResearchQuestionStatus;
  tasks: ResearchTask[];
}

export interface ResearchTopic {
  id: string;
  title: string;
  description: string;
  projects: ResearchProject[];
  literature: LiteratureItem[];
  knowledge: KnowledgeItem[];
  questions: ResearchQuestion[];
}

interface ResearchFile {
  version: 3;
  topics: ResearchTopic[];
}

interface LegacyTask {
  id?: unknown;
  title?: unknown;
  status?: unknown;
}

interface LegacyRoute {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  tasks?: unknown;
}

interface LegacyQuestion {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  tasks?: unknown;
}

const TASK_STATUSES: ResearchTaskStatus[] = ["todo", "active", "done"];
const QUESTION_STATUSES: ResearchQuestionStatus[] = [
  "planned",
  "active",
  "done"
];

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function taskStatus(value: unknown): ResearchTaskStatus {
  return TASK_STATUSES.includes(value as ResearchTaskStatus)
    ? (value as ResearchTaskStatus)
    : "todo";
}

function questionStatus(value: unknown): ResearchQuestionStatus {
  return QUESTION_STATUSES.includes(value as ResearchQuestionStatus)
    ? (value as ResearchQuestionStatus)
    : "planned";
}

function normalizeTask(value: LegacyTask, taskId: string): ResearchTask {
  return {
    id: taskId,
    title: stringValue(value.title, "未命名任务"),
    status: taskStatus(value.status)
  };
}

function deriveQuestionStatus(question: ResearchQuestion): ResearchQuestionStatus {
  if (question.tasks.length === 0) return question.status;
  if (question.tasks.every((task) => task.status === "done")) return "done";
  if (question.tasks.some((task) => task.status !== "todo")) return "active";
  return question.status === "done" ? "done" : "planned";
}

/**
 * Persisted research structure (v3):
 *
 *   课题 (topic)
 *   ├── 项目代码 (projects)
 *   ├── 文献 (literature)
 *   ├── 知识库 (knowledge)
 *   └── 子问题 (questions) → 任务 (tasks)
 *
 * v2 stored `routes` instead of `questions`; v1 stored a flat `questions`
 * array. Both are migrated on read and ids are preserved so experiment records
 * that reference `questionId` keep resolving.
 */
export class ResearchService {
  constructor(private readonly workspaceRoot: string) {}

  async tree(): Promise<ResearchTopic[]> {
    return (await this.read()).topics;
  }

  async createTopic(title: string, description = ""): Promise<ResearchTopic> {
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
      projects: [],
      literature: [],
      knowledge: [],
      questions: []
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

  async deleteTopic(topicId: string): Promise<void> {
    const file = await this.read();
    const before = file.topics.length;
    file.topics = file.topics.filter((topic) => topic.id !== topicId);
    if (file.topics.length === before) throw new Error("课题不存在");
    await this.write(file);
  }

  // --- 项目代码 ---------------------------------------------------------

  async createProject(
    topicId: string,
    input: { name: string; path?: string }
  ): Promise<ResearchProject> {
    const name = input.name.trim();
    if (!name) throw new Error("项目名称不能为空");
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const sequence = this.nextSequence(
      file.topics.flatMap((item) => item.projects.map((project) => project.id)),
      "P-"
    );
    const project: ResearchProject = {
      id: `P-${String(sequence).padStart(2, "0")}`,
      name,
      path: input.path?.trim() || undefined,
      createdAt: new Date().toISOString()
    };
    topic.projects.push(project);
    await this.write(file);
    return project;
  }

  async deleteProject(topicId: string, projectId: string): Promise<void> {
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const before = topic.projects.length;
    topic.projects = topic.projects.filter(
      (project) => project.id !== projectId
    );
    if (topic.projects.length === before) throw new Error("项目不存在");
    await this.write(file);
  }

  // --- 知识库 -----------------------------------------------------------

  async createKnowledge(
    topicId: string,
    input: { title: string; body: string; tags?: string[] }
  ): Promise<KnowledgeItem> {
    const title = input.title.trim();
    if (!title) throw new Error("知识条目标题不能为空");
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const sequence = this.nextSequence(
      file.topics.flatMap((item) =>
        item.knowledge.map((entry) => entry.id)
      ),
      "K-"
    );
    const entry: KnowledgeItem = {
      id: `K-${String(sequence).padStart(2, "0")}`,
      title,
      body: input.body.trim(),
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      updatedAt: new Date().toISOString()
    };
    topic.knowledge.push(entry);
    await this.write(file);
    return entry;
  }

  async updateKnowledge(
    topicId: string,
    knowledgeId: string,
    input: { title?: string; body?: string; tags?: string[] }
  ): Promise<KnowledgeItem> {
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const entry = topic.knowledge.find((item) => item.id === knowledgeId);
    if (!entry) throw new Error("知识条目不存在");
    if (typeof input.title === "string" && input.title.trim()) {
      entry.title = input.title.trim();
    }
    if (typeof input.body === "string") entry.body = input.body.trim();
    if (Array.isArray(input.tags)) {
      entry.tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
    }
    entry.updatedAt = new Date().toISOString();
    await this.write(file);
    return entry;
  }

  async deleteKnowledge(topicId: string, knowledgeId: string): Promise<void> {
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const before = topic.knowledge.length;
    topic.knowledge = topic.knowledge.filter(
      (entry) => entry.id !== knowledgeId
    );
    if (topic.knowledge.length === before) throw new Error("知识条目不存在");
    await this.write(file);
  }

  // --- 文献 -------------------------------------------------------------

  async addLiterature(
    topicId: string,
    input: { title: string; path?: string; url?: string; note?: string }
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

  // --- 子问题 / 任务 -----------------------------------------------------

  async createQuestion(topicId: string, title: string): Promise<ResearchQuestion> {
    const clean = title.trim();
    if (!clean) throw new Error("子问题不能为空");
    const file = await this.read();
    const topic = this.findTopic(file, topicId);
    const sequence = this.nextSequence(
      file.topics.flatMap((item) => item.questions.map((question) => question.id)),
      "R-"
    );
    const question: ResearchQuestion = {
      id: `R-${String(sequence).padStart(2, "0")}`,
      title: clean,
      status: "planned",
      tasks: []
    };
    topic.questions.push(question);
    await this.write(file);
    return question;
  }

  async setQuestionStatus(
    questionId: string,
    status: ResearchQuestionStatus
  ): Promise<ResearchQuestion> {
    if (!QUESTION_STATUSES.includes(status)) {
      throw new Error("子问题状态无效");
    }
    const file = await this.read();
    for (const topic of file.topics) {
      const question = topic.questions.find((item) => item.id === questionId);
      if (question) {
        question.status = status;
        await this.write(file);
        return question;
      }
    }
    throw new Error("子问题不存在");
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const file = await this.read();
    for (const topic of file.topics) {
      const before = topic.questions.length;
      topic.questions = topic.questions.filter(
        (question) => question.id !== questionId
      );
      if (topic.questions.length !== before) {
        await this.write(file);
        return;
      }
    }
    throw new Error("子问题不存在");
  }

  async createTask(questionId: string, title: string): Promise<ResearchTask> {
    const clean = title.trim();
    if (!clean) throw new Error("任务不能为空");
    const file = await this.read();
    const question = this.findQuestion(file, questionId);
    const sequence = this.nextSequence(
      file.topics.flatMap((topic) =>
        topic.questions.flatMap((item) => item.tasks.map((task) => task.id))
      ),
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
    if (!TASK_STATUSES.includes(status)) {
      throw new Error("任务状态无效");
    }
    const file = await this.read();
    for (const topic of file.topics) {
      for (const question of topic.questions) {
        const task = question.tasks.find((item) => item.id === taskId);
        if (task) {
          task.status = status;
          await this.write(file);
          return task;
        }
      }
    }
    throw new Error("任务不存在");
  }

  async deleteTask(taskId: string): Promise<void> {
    const file = await this.read();
    for (const topic of file.topics) {
      for (const question of topic.questions) {
        const before = question.tasks.length;
        question.tasks = question.tasks.filter((task) => task.id !== taskId);
        if (question.tasks.length !== before) {
          await this.write(file);
          return;
        }
      }
    }
    throw new Error("任务不存在");
  }

  async suggestQuestionStatus(questionId: string): Promise<ResearchQuestion> {
    const file = await this.read();
    const question = this.findQuestion(file, questionId);
    question.status = deriveQuestionStatus(question);
    await this.write(file);
    return question;
  }

  // --- internals --------------------------------------------------------

  private findTopic(file: ResearchFile, topicId: string): ResearchTopic {
    const topic = file.topics.find((item) => item.id === topicId);
    if (!topic) throw new Error("课题不存在");
    return topic;
  }

  private findQuestion(
    file: ResearchFile,
    questionId: string
  ): ResearchQuestion {
    for (const topic of file.topics) {
      const question = topic.questions.find((item) => item.id === questionId);
      if (question) return question;
    }
    throw new Error("子问题不存在");
  }

  private async read(): Promise<ResearchFile> {
    try {
      const raw = JSON.parse(await readFile(this.path(), "utf8")) as {
        version?: unknown;
        topics?: unknown;
        questions?: unknown;
      };
      if (Array.isArray(raw.topics)) {
        const topics = (raw.topics as Array<Record<string, unknown>>).map(
          (topic) => this.normalizeTopic(topic)
        );
        return { version: 3, topics };
      }
      const migrated = this.migrateLegacyQuestions(raw.questions);
      if (migrated.length > 0) {
        const file: ResearchFile = { version: 3, topics: migrated };
        await this.write(file);
        return file;
      }
      return { version: 3, topics: [] };
    } catch {
      return { version: 3, topics: [] };
    }
  }

  /** Accepts v2 (routes) and v3 (questions) and always yields v3. */
  private normalizeTopic(raw: Record<string, unknown>): ResearchTopic {
    const questions = Array.isArray(raw.questions)
      ? this.normalizeQuestions(raw.questions as LegacyQuestion[])
      : this.normalizeRoutes(raw.routes);
    return {
      id: stringValue(raw.id, "TP-00"),
      title: stringValue(raw.title, "未命名课题"),
      description: stringValue(raw.description, ""),
      projects: Array.isArray(raw.projects)
        ? (raw.projects as Array<Record<string, unknown>>).map((project) => ({
            id: stringValue(project.id, "P-00"),
            name: stringValue(project.name, "未命名项目"),
            path: project.path ? stringValue(project.path) : undefined,
            createdAt: stringValue(project.createdAt, new Date().toISOString())
          }))
        : [],
      literature: Array.isArray(raw.literature)
        ? (raw.literature as ResearchTopic["literature"])
        : [],
      knowledge: Array.isArray(raw.knowledge)
        ? (raw.knowledge as Array<Record<string, unknown>>).map((entry) => ({
            id: stringValue(entry.id, "K-00"),
            title: stringValue(entry.title, "未命名条目"),
            body: stringValue(entry.body, ""),
            tags: Array.isArray(entry.tags)
              ? (entry.tags as unknown[]).map((tag) => stringValue(tag))
              : [],
            updatedAt: stringValue(entry.updatedAt, new Date().toISOString())
          }))
        : [],
      questions
    };
  }

  private normalizeQuestions(items: LegacyQuestion[]): ResearchQuestion[] {
    return items.map((item, index) => {
      const tasks = Array.isArray(item.tasks)
        ? (item.tasks as LegacyTask[]).map((task, taskIndex) =>
            normalizeTask(
              task,
              stringValue(task.id, `T-${String(taskIndex + 1).padStart(2, "0")}`)
            )
          )
        : [];
      const question: ResearchQuestion = {
        id: stringValue(item.id, `R-${String(index + 1).padStart(2, "0")}`),
        title: stringValue(item.title, "未命名子问题"),
        status: questionStatus(item.status),
        tasks
      };
      return question;
    });
  }

  /** v2 stored the question level as `routes`. */
  private normalizeRoutes(value: unknown): ResearchQuestion[] {
    if (!Array.isArray(value)) return [];
    return this.normalizeQuestions(value as LegacyQuestion[]).map(
      (question) => ({
        ...question,
        status: deriveQuestionStatus(question)
      })
    );
  }

  private migrateLegacyQuestions(value: unknown): ResearchTopic[] {
    if (!Array.isArray(value) || value.length === 0) return [];
    const questions: ResearchQuestion[] = (value as LegacyQuestion[])
      .filter((item): item is LegacyQuestion => Boolean(item))
      .map((item, index) => {
        const tasks = Array.isArray(item.tasks)
          ? (item.tasks as LegacyTask[]).map((task, taskIndex) =>
              normalizeTask(
                task,
                `T-${String(taskIndex + 1).padStart(2, "0")}`
              )
            )
          : [];
        const question: ResearchQuestion = {
          id: stringValue(item.id, `R-${String(index + 1).padStart(2, "0")}`),
          title: stringValue(item.title, "未命名子问题"),
          status: "planned",
          tasks
        };
        question.status = deriveQuestionStatus(question);
        return question;
      });
    return [
      {
        id: "TP-01",
        title: "未命名课题",
        description: "由旧版研究问题迁移；可以编辑课题描述。",
        projects: [],
        literature: [],
        knowledge: [],
        questions
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
