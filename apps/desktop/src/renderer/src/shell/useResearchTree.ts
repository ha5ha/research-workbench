import { useCallback, useState } from "react";
import type { ResearchTopic } from "@research-workbench/contracts";

export function useResearchTree(setError: (error: string | null) => void) {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDescription, setNewTopicDescription] = useState("");
  const [newQuestionTitle, setNewQuestionTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const selectedRoute =
    selectedTopic?.questions.find((question) =>
      question.tasks.some((task) => task.id === selectedTask)
    ) ??
    selectedTopic?.questions.find(
      (question) => question.id === selectedRouteId
    ) ??
    null;
  const selectedTaskRecord =
    selectedTopic?.questions
      .flatMap((question) => question.tasks)
      .find((task) => task.id === selectedTask) ?? null;

  const applyTopics = useCallback((nextTopics: ResearchTopic[]) => {
    setTopics(nextTopics);
    setSelectedTopicId((current) => {
      if (current && nextTopics.some((topic) => topic.id === current)) {
        return current;
      }
      return null;
    });
    setExpandedRoutes((current) => {
      const next = { ...current };
      for (const topic of nextTopics) {
        for (const question of topic.questions) {
          if (next[question.id] === undefined) next[question.id] = true;
        }
      }
      return next;
    });
    setSelectedTask((current) => {
      const tasks = nextTopics.flatMap((topic) =>
        topic.questions.flatMap((question) => question.tasks)
      );
      if (current && tasks.some((task) => task.id === current)) {
        return current;
      }
      return null;
    });
  }, []);
  const createTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request("research.createTopic", {
        title,
        description: newTopicDescription.trim()
      });
      setTopics(result.topics);
      setSelectedTopicId(result.topic.id);
      setSelectedTask(null);
      setSelectedRouteId(null);
      setNewTopicTitle("");
      setNewTopicDescription("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建课题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const createQuestion = async () => {
    const title = newQuestionTitle.trim();
    if (!selectedTopic || !title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request("research.createQuestion", {
        topicId: selectedTopic.id,
        title
      });
      setTopics(result.topics);
      setSelectedRouteId(result.question.id);
      setSelectedTask(null);
      setExpandedRoutes((current) => ({
        ...current,
        [result.question.id]: true
      }));
      setNewQuestionTitle("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建子问题失败");
    } finally {
      setResearchBusy(false);
    }
  };

  const createTask = async () => {
    const title = newTaskTitle.trim();
    if (!selectedRoute || !title || researchBusy) return;
    setResearchBusy(true);
    try {
      const result = await window.rw.request("research.createTask", {
        routeId: selectedRoute.id,
        title
      });
      setTopics(result.topics);
      setSelectedTask(result.task.id);
      setExpandedRoutes((current) => ({
        ...current,
        [selectedRoute.id]: true
      }));
      setNewTaskTitle("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建任务失败");
    } finally {
      setResearchBusy(false);
    }
  };

  return {
    topics,
    setTopics,
    selectedTopicId,
    setSelectedTopicId,
    expandedRoutes,
    setExpandedRoutes,
    selectedTask,
    setSelectedTask,
    selectedRouteId,
    setSelectedRouteId,
    newTopicTitle,
    setNewTopicTitle,
    newTopicDescription,
    setNewTopicDescription,
    newQuestionTitle,
    setNewQuestionTitle,
    newTaskTitle,
    setNewTaskTitle,
    researchBusy,
    selectedTopic,
    selectedRoute,
    selectedTaskRecord,
    createTopic,
    createQuestion,
    createTask,
    applyTopics
  };
}
export type ResearchTreeState = ReturnType<typeof useResearchTree>;
