import { basename } from "node:path";
import stylelint from "stylelint";

// Layout overrides retain their original cascade positions. Appearance for a
// feature belongs to its file; a new owner is an explicit, reviewable decision.
const owners = {
  approval: "approval",
  "chat-cards": "chat|usage",
  chat: "chat|message|bubble|prose|card|skill|error|result|warning|artifact|file|pi|composer|live|stream",
  code: "page|code|ide|lsp|git|file|dirty|editor|tab",
  composer: "composer|attachment",
  diff: "diff|side|changes|run|change|code",
  facts: "fact|milestone|chat",
  feedback: "global|uploads|inspector|page",
  inspector:
    "inspector|eyebrow|path|muted|facts|mono|wrap|skill|tag|event|empty",
  navigation:
    "app|collapsed|sidebar|brand|project|new|research|path|tree|settings|session",
  overlays:
    "model|history|permission|project|global|activity|inspector|live|collapsed|composer",
  pages: "page|section|fact|action|table|empty|record",
  permissions: "perm",
  "record-editor": "record|change",
  records: "records|record|status|taskbook|metric|seed",
  "responsive-small":
    "app|main|left|sidebar|nav|topbar|mobile|view|connection|workspace|chat|composer|page|action|code|changes|run|change|diff|records|record|metric|tab|card|skill",
  responsive: "workspace|inspector",
  "settings-fields": "settings|permission",
  settings: "settings|protocol",
  shell:
    "main|topbar|mobile|view|connection|workspace|center|nav|inspector|status",
  foundation: "(?!)",
  terminal: "code|terminal",
  trace: "live|chat|trace|composer|stop"
};
const ruleName = "research/feature-ownership";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (selector, file) =>
    `${selector} belongs to another feature; declare its owner before adding it to ${file}`
});
export default stylelint.createPlugin(ruleName, (enabled) => (root, result) => {
  if (!enabled) return;
  const file = basename(root.source.input.file ?? "");
  const owner = file.replace(/\.css$/, "");
  const expression = owners[owner];
  if (!expression && file !== "styles.css") {
    if (
      root.source.input.file
        ?.replaceAll("\\", "/")
        .includes("/renderer/src/styles/")
    ) {
      stylelint.utils.report({
        ruleName,
        result,
        node: root,
        message: `Register the CSS feature owner for ${file}`
      });
    }
    return;
  }
  const allowed = expression ? new RegExp(`^(?:${expression})(?:-|$)`) : null;
  root.walkRules((rule) => {
    if (rule.parent.type === "atrule" && /keyframes$/i.test(rule.parent.name))
      return;
    for (const selector of rule.selectors) {
      const primary = selector.match(/\.([\w-]+)/)?.[1];
      if (file === "styles.css" || (primary && !allowed.test(primary)))
        stylelint.utils.report({
          ruleName,
          result,
          node: rule,
          message: messages.rejected(selector, file),
          word: selector
        });
    }
  });
});
