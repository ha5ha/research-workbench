const { resolve } = require("node:path");

module.exports = async () => {
  const { collectDistribution } = await import("./collect.mjs");
  await collectDistribution(resolve(__dirname, "../.."));
};
