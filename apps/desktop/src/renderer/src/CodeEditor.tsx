import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import type { LSPClient } from "@codemirror/lsp-client";

interface CodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  lsp?: {
    client: LSPClient;
    uri: string;
    languageId: string;
  };
}

function languageFor(path: string) {
  const lower = path.toLowerCase();
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(lower)) {
    return [javascript({ typescript: true, jsx: true })];
  }
  if (lower.endsWith(".json")) return [json()];
  if (lower.endsWith(".py")) return [python()];
  if (/\.(md|markdown)$/.test(lower)) return [markdown()];
  return [];
}

export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  lsp
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          ...languageFor(path),
          ...(lsp
            ? [lsp.client.plugin(lsp.uri, lsp.languageId)]
            : []),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current();
                return true;
              }
            }
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
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
            ".cm-content": {
              padding: "12px 0"
            },
            ".cm-gutters": {
              background: "#f7f8f9",
              color: "#9ca3ad",
              borderRight: "1px solid #eef0f2"
            },
            ".cm-activeLine": {
              backgroundColor: "#f5f7fa"
            },
            ".cm-activeLineGutter": {
              backgroundColor: "#f0f2f5"
            },
            "&.cm-focused": {
              outline: "none"
            }
          })
        ]
      }),
      parent: host.current
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Parent remounts with key={path}; do not recreate on every value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current !== value) {
      editor.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      });
    }
  }, [value]);

  return <div className="code-editor-host" ref={host} />;
}
