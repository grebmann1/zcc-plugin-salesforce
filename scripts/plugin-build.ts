// React host adapter derived from salesforce/zana (MIT); see vendor/PROVENANCE.md.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_SDK_API_MAJOR, PLUGIN_SDK_VERSION, derivePluginId } from '@zana-ai/zcc-plugin-sdk';

function hostReactPlugin(): {
  name: string;
  setup(build: { onResolve(opts: { filter: RegExp }, fn: (args: { path: string }) => { path: string; namespace: string }): void; onLoad(opts: { filter: RegExp; namespace: string }, fn: (args: { path: string }) => { contents: string; loader: 'js' }): void }): void;
} {
  const namespace = 'zcc-host-react';
  const reactShim = `const React = globalThis.__ZCC_HOST_REACT__;
export default React;
export const Children = React.Children;
export const Component = React.Component;
export const Fragment = React.Fragment;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const memo = React.memo;
export const startTransition = React.startTransition;
export const useCallback = React.useCallback;
export const useContext = React.useContext;
export const useDebugValue = React.useDebugValue;
export const useDeferredValue = React.useDeferredValue;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useImperativeHandle = React.useImperativeHandle;
export const useInsertionEffect = React.useInsertionEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useReducer = React.useReducer;
export const useRef = React.useRef;
export const useState = React.useState;
export const useSyncExternalStore = React.useSyncExternalStore;
export const useTransition = React.useTransition;
export const version = React.version;
`;
  const jsxShim = `const React = globalThis.__ZCC_HOST_REACT__;
export const Fragment = React.Fragment;
export function jsx(type, props, key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}
export const jsxs = jsx;
export const jsxDEV = jsx;
`;
  const reactDomShim = `const ReactDOM = globalThis.__ZCC_HOST_REACT_DOM__;
if (ReactDOM == null) {
  throw new Error('host react-dom is not available');
}
export default ReactDOM;
export const createPortal = ReactDOM.createPortal;
export const flushSync = ReactDOM.flushSync;
export const hydrate = ReactDOM.hydrate;
export const render = ReactDOM.render;
export const unmountComponentAtNode = ReactDOM.unmountComponentAtNode;
export const findDOMNode = ReactDOM.findDOMNode;
export const version = ReactDOM.version;
`;
  const reactDomClientShim = `const ReactDOMClient = globalThis.__ZCC_HOST_REACT_DOM_CLIENT__;
if (ReactDOMClient == null) {
  throw new Error('host react-dom/client is not available');
}
export default ReactDOMClient;
export const createRoot = ReactDOMClient.createRoot;
export const hydrateRoot = ReactDOMClient.hydrateRoot;
`;
  return {
    name: 'zcc-host-react',
    setup(build) {
      build.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => ({
        path: args.path,
        namespace
      }));
      build.onLoad({ filter: /.*/, namespace }, (args) => {
        if (args.path.startsWith('react/jsx')) return { contents: jsxShim, loader: 'js' };
        if (args.path === 'react-dom/client') return { contents: reactDomClientShim, loader: 'js' };
        if (args.path === 'react-dom') return { contents: reactDomShim, loader: 'js' };
        return { contents: reactShim, loader: 'js' };
      });
    }
  };
}


export function artifactMeta(pkg: { name: string; version: string }, hostVersion: string) {
  return { sdkMajor: PLUGIN_SDK_API_MAJOR, sdkVersion: PLUGIN_SDK_VERSION, artifactFormatVersion: 1,
    pluginId: derivePluginId(pkg.name), pluginVersion: pkg.version,
    builtWith: { zccVersion: hostVersion, pluginSdkVersion: PLUGIN_SDK_VERSION } };
}

export async function buildPluginApp(root: string, hostVersion: string) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  await build({ entryPoints: [join(root, 'app.tsx')], outfile: join(root, 'app.js'), bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', minify: true,
    loader: { '.css': 'text' }, plugins: [hostReactPlugin(), { name: 'sdk-app', setup(builder) { builder.onResolve({ filter: /^@zana-ai\/zcc-plugin-sdk\/app$/ }, () => ({ path: fileURLToPath(import.meta.resolve('@zana-ai/zcc-plugin-sdk/app')) })); } }] });
  writeFileSync(join(root, 'app.meta.json'), JSON.stringify(artifactMeta(pkg, hostVersion), null, 2) + '\n');
}

export async function buildPluginServer(root: string, hostVersion: string) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  await build({ entryPoints: [join(root, 'server.ts')], outfile: join(root, 'server.mjs'), bundle: true,
    format: 'esm', platform: 'node', target: 'node22', minify: true,
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
  writeFileSync(join(root, 'server.meta.json'), JSON.stringify(artifactMeta(pkg, hostVersion), null, 2) + '\n');
}
