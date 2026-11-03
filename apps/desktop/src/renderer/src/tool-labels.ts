/** Human-readable labels for the agent's tool calls shown in the chat trace. */
const TOOL_LABELS: Record<string, string> = {
  data_profile: "数据画像",
  record_note: "记录研究笔记",
  list_files: "列出工作区文件",
  read_file: "读取文件",
  write_file: "写入文件",
  run_command: "执行命令",
  create_experiment: "创建实验记录",
  finish_experiment: "归档实验结果"
};

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}
