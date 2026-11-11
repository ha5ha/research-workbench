import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { workbenchEditorTheme } from "./editor-theme";

export function SideBySideDiff({
  before,
  after,
  path
}: {
  before: string;
  after: string;
  path: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const extensions = [
      basicSetup,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      workbenchEditorTheme("10px 0")
    ];
    const view = new MergeView({
      a: { doc: before, extensions },
      b: { doc: after, extensions },
      parent: host.current,
      orientation: "a-b",
      gutter: true,
      highlightChanges: true,
      collapseUnchanged: { margin: 3, minSize: 4 }
    });
    return () => view.destroy();
  }, [before, after]);

  return (
    <div className="side-diff">
      <div className="side-diff-labels">
        <span>Before · {path}</span>
        <span>After · {path}</span>
      </div>
      <div className="side-diff-host" ref={host} />
    </div>
  );
}
