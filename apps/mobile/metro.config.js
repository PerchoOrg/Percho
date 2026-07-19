// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo — required so metro sees @percho/shared changes.
config.watchFolders = [workspaceRoot];

// Resolve modules from both the app's node_modules and the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm-safe: don't allow hoisted symlinks to escape the monorepo root.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
