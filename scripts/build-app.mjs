#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPluginApp } from './plugin-build.ts';
import { build } from 'vite';
import { buildFlowVisualizer } from './build-flow-visualizer.mjs';
import { buildToolkitRuntime } from './build-toolkit.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const version = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8')).engines.zcc.replace('>=', '');
await buildToolkitRuntime();
await buildFlowVisualizer(pluginRoot);
await build({ configFile: join(pluginRoot, 'playground/vite.config.ts') });
await buildPluginApp(pluginRoot, String(version));
