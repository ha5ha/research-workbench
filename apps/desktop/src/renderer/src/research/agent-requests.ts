/** User-editable requests. Tool selection and permissions remain in Core. */
export const researchRequests = {
  understandProject:
    "请先阅读当前项目，梳理代码、数据与已有结果，说明正在解决什么问题、还缺什么，以及建议的下一步。",
  prepareBaseline:
    "请阅读项目，帮我准备一个小而可复算的 baseline 实验。由你起草任务书和运行参数，生成冻结方案供我审阅；缺少关键信息时再问我。",
  prepareExperiment:
    "请阅读当前项目和已有研究记录，准备下一项实验。起草任务书与完整运行参数，生成冻结方案供我审阅。",
  prepareRun: (experimentId: string) =>
    `请为实验 ${experimentId} 补全运行方案。阅读项目确认命令、数据和产物，生成冻结方案供我审阅。`,
  revisePlan: (planId: string) =>
    `请修改运行方案 ${planId}。先和我确认需要改动的内容，再生成新的冻结方案供我审阅。`,
  analyzeRun: (runId: string) =>
    `请分析运行 ${runId} 的原始产物，复核统计和局限，起草带来源的候选结论供我确认。`,
  nextStep: (goal?: string) =>
    goal
      ? `围绕研究目标“${goal}”，阅读项目与已有研究记录，建议唯一下一步并准备实验方案。缺少关键信息时先问我。`
      : "请先阅读当前科研项目，和我一起明确研究目标，再提出一个小而可复算的 baseline 方案。"
};
