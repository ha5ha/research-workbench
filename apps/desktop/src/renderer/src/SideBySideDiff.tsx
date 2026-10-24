import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

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
      EditorView.theme({
        "&": {
          height: "100%",
          background: "#fcfcfd",
          color: "#3f4652",
          fontSize: "12px"
        },
        ".cm-scroller": {
          fontFamily: "var(--ds-font-family-code)",
          lineHeight: "20px",
          overflow: "auto"
        },
        ".cm-content": { padding: "10px 0" },
        ".cm-gutters": {
          background: "#f7f8f9",
          color: "#9ca3ad",
          borderRight: "1px solid #eef0f2"
        },
        "&.cm-focused": { outline: "none" }
      })
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
