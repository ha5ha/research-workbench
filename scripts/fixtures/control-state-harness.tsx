// Browser-only test fixture. Never imported by the desktop application.
import { createRoot } from "react-dom/client";
import { SessionHistory } from "../../apps/desktop/src/renderer/src/components/SessionHistory";
import { Segmented, Button } from "../../packages/ui/src/index";
import { useState } from "react";
import { SideBySideDiff } from "../../apps/desktop/src/renderer/src/SideBySideDiff";
import "../../apps/desktop/src/renderer/src/styles.css";

const pending: Array<{
  resolve: (items: unknown[]) => void;
  reject: (error: Error) => void;
}> = [];
let opened = 0;
Object.assign(window, {
  controlStateQA: {
    count: () => pending.length,
    resolve: (index: number, title: string) =>
      pending[index]!.resolve(
        title ? [{ file: title, title, messages: 1, startedAt: "" }] : []
      ),
    reject: (index: number) =>
      pending[index]!.reject(new Error("会话暂时不可用，请重试")),
    opened: () => opened
  }
});
function Harness() {
  const [value, setValue] = useState("first");
  const [diff, setDiff] = useState(false);
  if (diff)
    return (
      <main style={{ padding: 24 }}>
        <SideBySideDiff
          before={"score = 3\nprint(score)\n"}
          after={"score = 5\nprint(score)\n"}
          path="analysis.py"
        />
      </main>
    );
  return (
    <main style={{ padding: 24 }}>
      <SessionHistory
        loadSessions={() =>
          new Promise((resolve, reject) =>
            pending.push({
              resolve: resolve as (items: unknown[]) => void,
              reject
            })
          )
        }
        onOpenSession={async () => {
          opened++;
        }}
      />
      <div style={{ width: 320, marginTop: 20 }}>
        <Segmented
          value={value}
          onChange={setValue}
          label="测试分段选择"
          options={[
            { value: "first", label: "分析" },
            { value: "second", label: "结果" }
          ]}
        />
      </div>
      <Button disabled style={{ marginTop: 20 }}>
        暂不可操作
      </Button>
      <Button onClick={() => setDiff(true)}>查看差异配色</Button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
