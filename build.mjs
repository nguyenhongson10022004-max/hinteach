/**
 * HinTeach — esbuild config
 *
 * Gộp dashboard-core.js + dashboard-shell.js → 1 bundle.
 * Module JS (classes, students) → riêng từng file (lazy-load bằng import()).
 */

import { build, context } from 'esbuild';

const isWatch = process.argv.includes( '--watch' );

const commonOptions = {
    bundle:    true,
    minify:    ! isWatch,
    sourcemap: isWatch,
    target:    [ 'es2020' ],
    format:    'esm',
};

// 1. Dashboard core bundle
const coreConfig = {
    ...commonOptions,
    entryPoints: [ './assets/dashboard-core.js', './assets/dashboard-shell.js' ],
    outdir:      './assets/dist',
    format:      'iife',  // Core không cần ESM, chạy ngay
    globalName:  undefined,
};

// 2. Module bundles (lazy-load)
const modulesConfig = {
    ...commonOptions,
    entryPoints: [
        './assets/modules/classes.js',
        './assets/modules/students.js',
        './assets/modules/schedule.js',
    ],
    outdir:     './assets/dist/modules',
    format:     'esm',  // Giữ ESM cho dynamic import()
    entryNames: '[name].min',  // Xuất classes.min.js, students.min.js — khớp với HT.router
};

async function run() {
    if ( isWatch ) {
        const coreCtx = await context( coreConfig );
        const modCtx  = await context( modulesConfig );
        await coreCtx.watch();
        await modCtx.watch();
        console.log( '👀 Watching for changes...' );
    } else {
        await build( coreConfig );
        await build( modulesConfig );
        console.log( '✅ Build complete → assets/dist/' );
    }
}

run().catch( ( err ) => {
    console.error( err );
    process.exit( 1 );
} );
