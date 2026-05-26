const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const ctxOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  // @vscode/extension-telemetry has complex native deps (applicationinsights);
  // mark it external so VS Code loads it from node_modules at runtime.
  external: ['vscode', '@vscode/extension-telemetry'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(ctxOptions);
    await ctx.watch();
    console.log('esbuild: watching...');
  } else {
    await esbuild.build(ctxOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
