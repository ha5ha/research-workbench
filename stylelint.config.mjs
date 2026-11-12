export default {
  plugins: ["./scripts/stylelint-feature-ownership.mjs"],
  rules: {
    "research/feature-ownership": true,
    "block-no-empty": true,
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-values"] }
    ],
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": [
      "rgb",
      "rgba",
      "hsl",
      "hsla",
      "oklch",
      "oklab",
      "lab",
      "lch",
      "hwb"
    ],
    "declaration-no-important": true,
    "selector-max-id": 0,
    "selector-max-compound-selectors": 6
  },
  overrides: [
    {
      files: ["packages/ui/src/tokens.css"],
      rules: {
        "color-no-hex": null,
        "color-named": null,
        "function-disallowed-list": null
      }
    }
  ]
};
