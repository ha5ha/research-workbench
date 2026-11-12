import { DisclosureSummary, Icon } from "@research-workbench/ui";
import type { ResearchQuestion } from "@research-workbench/contracts";
import type { ResearchTreeState } from "./useResearchTree";
function routeStatus(route: ResearchQuestion): "planned" | "active" | "done" {
  if (
    route.tasks.length > 0 &&
    route.tasks.every((task) => task.status === "done")
  ) {
    return "done";
  }
  if (route.tasks.some((task) => task.status === "active")) return "active";
  return route.status;
}

function routeStatusLabel(status: "planned" | "active" | "done"): string {
  return status === "done"
    ? "已完成"
    : status === "active"
      ? "进行中"
      : "计划中";
}

export function ResearchNavigation({
  tree,
  evidenceByTask,
  onSelectConversation
}: {
  tree: ResearchTreeState;
  evidenceByTask: Record<string, number>;
  onSelectConversation: () => void;
}) {
  const {
    topics,
    selectedTask,
    selectedTopic,
    setSelectedTopicId,
    setSelectedRouteId,
    setSelectedTask,
    selectedTopicId,
    expandedRoutes,
    setExpandedRoutes
  } = tree;
  return (
    <details className="research-paths" open>
      <DisclosureSummary>
        研究路径 <span>{topics.length > 0 ? topics.length : ""}</span>
      </DisclosureSummary>
      <nav className="tree" aria-label="研究路径">
        <button
          type="button"
          className={`tree-project-chat ${!selectedTask && !selectedTopic ? "selected" : ""}`}
          onClick={() => {
            setSelectedTopicId(null);
            setSelectedRouteId(null);
            setSelectedTask(null);
            onSelectConversation();
          }}
        >
          项目对话
        </button>
        {topics.length === 0 && (
          <p className="path-empty">从对话开始。需要时再整理研究路径。</p>
        )}
        {topics.map((topic) => (
          <div className="tree-group" key={topic.id}>
            <button
              type="button"
              className={`path-topic ${selectedTopicId === topic.id ? "selected" : ""}`}
              aria-expanded={selectedTopicId === topic.id}
              onClick={() => {
                setSelectedTopicId(
                  selectedTopicId === topic.id ? null : topic.id
                );
                setSelectedRouteId(null);
                setSelectedTask(null);
              }}
            >
              <Icon
                name="chevron-right"
                size={14}
                className={`tree-chevron ${selectedTopicId === topic.id ? "open" : ""}`}
              />
              <span className="tree-qtitle">{topic.title}</span>
            </button>
            {selectedTopicId === topic.id &&
              topic.questions.map((question) => {
                const expanded = expandedRoutes[question.id] ?? true;
                const state = routeStatus(question);
                return (
                  <div className="path-route" key={question.id}>
                    <button
                      type="button"
                      className="tree-question"
                      aria-expanded={expanded}
                      title={routeStatusLabel(state)}
                      onClick={() => {
                        setSelectedRouteId(question.id);
                        setSelectedTask(null);
                        setExpandedRoutes((current) => ({
                          ...current,
                          [question.id]: !expanded
                        }));
                      }}
                    >
                      <Icon
                        name="chevron-right"
                        size={14}
                        className={`tree-chevron ${expanded ? "open" : ""}`}
                      />
                      <span className="tree-qtitle">{question.title}</span>
                      <span
                        className={`path-state ${state}`}
                        aria-label={routeStatusLabel(state)}
                      />
                    </button>
                    {expanded && (
                      <div className="tree-children">
                        {question.tasks.map((task) => (
                          <button
                            type="button"
                            key={task.id}
                            className={`tree-task ${task.status} ${selectedTask === task.id ? "selected" : ""}`}
                            aria-current={
                              selectedTask === task.id ? "page" : undefined
                            }
                            onClick={() => {
                              setSelectedTopicId(topic.id);
                              setSelectedRouteId(question.id);
                              setSelectedTask(task.id);
                              onSelectConversation();
                            }}
                          >
                            <span
                              className="tree-task-dot"
                              aria-hidden="true"
                            />
                            <span className="tree-task-title">
                              {task.title}
                            </span>
                            <span className="tree-task-meta">
                              {task.status === "done"
                                ? "完成"
                                : task.status === "active"
                                  ? "进行中"
                                  : "待做"}
                              {evidenceByTask[task.id]
                                ? ` · ${evidenceByTask[task.id]}`
                                : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </nav>
    </details>
  );
}
