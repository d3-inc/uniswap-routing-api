/**
 * Modules esbuild must leave out of the Lambda bundles.
 *
 * `@aws-sdk/*` is CDK's own default for Node 18+ runtimes, since the runtime already ships
 * AWS SDK v3. Passing `externalModules` at all REPLACES that default, so it has to be
 * repeated here rather than appended to.
 *
 * `dtrace-provider` is an optional dependency of bunyan. bunyan loads it as
 * `require('dtrace-provider' + '')` specifically to hide it from bundlers, but esbuild 0.24
 * constant-folds that concatenation and follows it (esbuild 0.12, used before the Node 24
 * upgrade, did not — which is why this surfaced only after the bump). dtrace-provider's entry
 * point then does `require('./src/build/' + builds[i] + '/DTraceProviderBindings')`, which
 * esbuild cannot resolve when the compiled binding is missing.
 *
 * That makes the failure platform-dependent and easy to miss locally: the package's install
 * script is `node-gyp rebuild || node suppress-error.js`, so a failed native build on a Linux
 * CI runner is silent. On macOS the build succeeds, `src/build` exists, and esbuild downgrades
 * the unmatched glob to a warning. On the GitHub runner the directory is absent and the same
 * glob is a hard error, breaking `cdk deploy`.
 *
 * Leaving it unbundled is the correct fix, not just a workaround: bunyan wraps the require in
 * try/catch and falls back to `dtrace = null`, and DTrace USDT probes do nothing in Lambda.
 */
export const LAMBDA_EXTERNAL_MODULES = ['@aws-sdk/*', 'dtrace-provider']
