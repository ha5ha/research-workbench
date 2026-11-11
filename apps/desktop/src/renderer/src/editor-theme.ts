import { EditorView } from "@codemirror/view";

// Shared adapter for the existing CodeMirror editor and merge viewer. Colors
// belong to the Workbench tokens; editing and diff behavior stay with CodeMirror.
export function workbenchEditorTheme(contentPadding = "12px 0") {
  return EditorView.theme({
    "&": {
      height: "100%",
      background: "var(--bg)",
      color: "var(--text)",
      fontSize: "12px"
    },
    ".cm-scroller": {
      fontFamily: "var(--ds-font-family-code)",
      lineHeight: "20px",
      overflow: "auto"
    },
    ".cm-content": { padding: contentPadding, caretColor: "var(--text)" },
    ".cm-gutters": {
      background: "var(--bg-sidebar)",
      color: "var(--text-3)",
      borderRight: "1px solid var(--border-faint)"
    },
    ".cm-activeLine": { backgroundColor: "var(--bg-subtle)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--bg-active)" },
    ".cm-cursor": { borderLeftColor: "var(--text)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--bg-active)"
    },
    ".cm-tooltip, .cm-panels": {
      background: "var(--bg)",
      color: "var(--text)",
      borderColor: "var(--border-subtle)"
    },
    "&.cm-focused": {
      outline: "2px solid var(--blue)",
      outlineOffset: "-2px"
    },
    "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": {
      backgroundColor: "var(--bg-danger)"
    },
    "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": {
      backgroundColor: "var(--bg-success)"
    },
    "&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText, &.cm-merge-b .cm-deletedText":
      {
        background: "var(--diff-delete)"
      },
    "&.cm-merge-b .cm-changedText": { background: "var(--diff-add)" },
    "&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter": {
      background: "var(--red)"
    },
    "&.cm-merge-b .cm-changedLineGutter": { background: "var(--green)" },
    ".cm-collapsedLines": {
      background: "var(--bg-subtle)",
      color: "var(--text-2)"
    }
  });
}
