import { useEffect, useState, useSyncExternalStore } from "react";
import { ConversationStore } from "./conversation-store";

export function useConversation(key: string | null) {
  const [store] = useState(
    () => new ConversationStore(localStorage, window.rw)
  );
  const state = useSyncExternalStore(store.subscribe, () =>
    store.snapshot(key)
  );
  useEffect(
    () =>
      window.rw.onEvent((event) => {
        const { type, payload } = event.params;
        if (
          type === "agent.delta" ||
          type === "agent.card" ||
          type === "agent.tool-start" ||
          type === "agent.tool-end"
        )
          store.event(payload);
      }),
    [store]
  );
  return { ...state, store };
}
