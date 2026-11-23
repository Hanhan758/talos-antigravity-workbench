import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(repoRoot, 'src');

// 1. CommonJS / JS syntax check
for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith('.cjs')) {
    execFileSync(process.execPath, ['--check', path.join(srcDir, file)], { stdio: 'pipe' });
  }
}

const locCode = fs.readFileSync(path.join(srcDir, 'localization.js'), 'utf8')
  .trim().replace(/;$/, '').replace('__AG_INITIAL_LANG__', JSON.stringify('zh'));
new vm.Script(`(${locCode})`);

const appCode = fs.readFileSync(path.join(srcDir, 'appearance.js'), 'utf8')
  .replace('__AG_ACCOUNT_FOOTER__', () => fs.readFileSync(path.join(srcDir, 'account-footer.js'), 'utf8').trim())
  .replace('__AG_WORKSPACE_LAYOUT__', () => fs.readFileSync(path.join(srcDir, 'workspace-layout.js'), 'utf8').trim())
  .replace('__AG_APPEARANCE_CSS__', () => JSON.stringify(
    ['appearance.css', 'workspace-layout.css'].map(n => fs.readFileSync(path.join(srcDir, n), 'utf8')).join('\n')
  ))
  .replace('__AG_INITIAL_APPEARANCE__', JSON.stringify('google'))
  .replace('__AG_INITIAL_LANG__', JSON.stringify('zh'))
  .replace('__AG_INITIAL_QUOTA__', JSON.stringify('on'))
  .replace('__AG_ACCOUNT_CONTEXT__', JSON.stringify({}));
new vm.Script(`(${appCode.trim().replace(/;$/, '')})`);

// 2. Desensitization & sandbox protection check
const forbidden = [/\/Users\/[a-z0-9_-]+\//i, /TALOS-Workspace/, /talos_state_mcp/, /talos-profile-hub/, /mcp-lifecycle\.cjs/, /orphan-cleanup\.cjs/];
for (const dir of [srcDir, path.join(repoRoot, 'scripts'), path.join(repoRoot, 'launcher')]) {
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const pat of forbidden) {
      assert.equal(pat.test(text), false, `Found forbidden pattern ${pat} in ${file}`);
    }
  }
}

const sbText = fs.readFileSync(path.join(srcDir, 'quota-only.sb'), 'utf8');
for (const param of ['DOCUMENTS', 'DESKTOP', 'DOWNLOADS']) {
  assert.ok(sbText.includes(`(param "${param}")`), `quota-only.sb must deny ${param}`);
}

// Helper: extract actual CDHash from codesign -dvvv stderr
function readCdHash(appPath) {
  const res = spawnSync('/usr/bin/codesign', ['-dvvv', appPath], { encoding: 'utf8' });
  assert.equal(res.status, 0, `codesign -dvvv failed: ${res.stderr}`);
  const match = (res.stderr || '').match(/^CDHash=([0-9a-f]+)$/m);
  assert.ok(match && match[1].length >= 40, `Expected non-empty CDHash in codesign stderr, got: ${res.stderr}`);
  return match[1];
}

// 3. macOS installer, safety guards, rollback, CDHash stability & uninstaller regression tests
if (process.platform === 'darwin' && fs.existsSync('/Applications/Antigravity.app')) {
  const installSh = path.join(repoRoot, 'scripts/install.sh');
  const uninstallSh = path.join(repoRoot, 'scripts/uninstall.sh');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-ag-wb-test-'));
  const testApp = path.join(tmpRoot, 'Antigravity Workbench Test.app');
  const testRuntimeBase = path.join(tmpRoot, 'support');
  const testRuntime = path.join(testRuntimeBase, 'runtime');
  const foreignApp = path.join(tmpRoot, 'Foreign.app');
  const foreignDir = path.join(tmpRoot, 'foreign-dir');

  try {
    execFileSync('bash', [installSh, '--dry-run', '--dest', testApp, '--runtime', testRuntime], { stdio: 'pipe' });
    // 3a. Safety guard: install & uninstall must refuse unowned directories and original App
    fs.mkdirSync(path.join(foreignApp, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(foreignApp, 'Contents/sentinel.txt'), 'keep');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'sentinel.txt'), 'keep');

    const badDest = spawnSync('bash', [installSh, '--dest', foreignApp, '--runtime', testRuntime], { encoding: 'utf8' });
    assert.notEqual(badDest.status, 0, 'install.sh must refuse overwriting unowned .app');
    assert.ok(fs.existsSync(path.join(foreignApp, 'Contents/sentinel.txt')), 'Unowned .app was modified');

    const badOrig = spawnSync('bash', [installSh, '--dest', '/Applications/Antigravity.app', '--runtime', testRuntime], { encoding: 'utf8' });
    assert.notEqual(badOrig.status, 0, 'install.sh must refuse targeting original Antigravity.app');

    const badRuntime = spawnSync('bash', [installSh, '--dest', testApp, '--runtime', foreignDir], { encoding: 'utf8' });
    assert.notEqual(badRuntime.status, 0, 'install.sh must refuse overwriting unowned runtime dir');
    assert.ok(fs.existsSync(path.join(foreignDir, 'sentinel.txt')), 'Unowned runtime dir was modified');

    const badUninst = spawnSync('bash', [uninstallSh, '--dest', foreignApp, '--runtime', foreignDir], { encoding: 'utf8' });
    assert.notEqual(badUninst.status, 0, 'uninstall.sh must refuse removing unowned targets');
    assert.ok(fs.existsSync(path.join(foreignApp, 'Contents/sentinel.txt')), 'Unowned .app was deleted by uninstall');
    assert.ok(fs.existsSync(path.join(foreignDir, 'sentinel.txt')), 'Unowned dir was deleted by uninstall');

    // 3b. First install: builds launcher .app + deploys runtime + records AGWNodePath
    execFileSync('bash', [
      installSh,
      '--dest', testApp,
      '--runtime', testRuntime,
      '--name', 'Antigravity Workbench Test'
    ], { stdio: 'pipe' });

    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Info.plist')), 'Info.plist missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')), 'Launcher executable missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Resources/icon.icns')), 'Original icon.icns not reused');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Resources/.talos-agw-managed.json')), 'App ownership manifest missing');
    assert.ok(fs.existsSync(path.join(testRuntime, 'launch.cjs')), 'runtime/launch.cjs missing');
    assert.ok(fs.existsSync(path.join(testRuntime, '.talos-agw-managed.json')), 'Runtime ownership manifest missing');
    assert.equal(fs.existsSync(path.join(testApp, 'Contents/Resources/launch.cjs')), false, 'launch.cjs should live in decoupled runtime dir');

    const plist = fs.readFileSync(path.join(testApp, 'Contents/Info.plist'), 'utf8');
    assert.match(plist, /<key>AGWNodePath<\/key>/);
    assert.match(plist, /<key>AGWAppPath<\/key>/);
    assert.match(plist, /<key>AGWRuntimeDir<\/key>/);

    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', testApp], { stdio: 'pipe' });
    const cdHashBefore = readCdHash(testApp);
    const mtimeBefore = fs.statSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')).mtimeMs;

    // 3c. Second install: updates runtime ONLY without rebuilding/re-signing .app (real stderr CDHash match)
    execFileSync('bash', [
      installSh,
      '--dest', testApp,
      '--runtime', testRuntime,
      '--name', 'Antigravity Workbench Test'
    ], { stdio: 'pipe' });

    const cdHashAfter = readCdHash(testApp);
    const mtimeAfter = fs.statSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')).mtimeMs;
    assert.equal(mtimeAfter, mtimeBefore, 'Second install must not rebuild unchanged launcher binary');
    assert.equal(cdHashAfter, cdHashBefore, 'Second install must preserve launcher CDHash');

    // 3d. Failed update rollback: invalid signing identity must fail AND preserve old working install
    const failSign = spawnSync('bash', [
      installSh,
      '--dest', testApp,
      '--runtime', testRuntime,
      '--name', 'Antigravity Workbench Test',
      '--rebuild-launcher',
      '--sign', 'NON_EXISTENT_SIGN_IDENTITY_99999'
    ], { encoding: 'utf8' });
    assert.notEqual(failSign.status, 0, 'install.sh must fail when codesign fails (never swallow error)');
    assert.ok(fs.existsSync(path.join(testRuntime, 'launch.cjs')), 'Failed update must preserve old runtime');
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', testApp], { stdio: 'pipe' });
    assert.equal(readCdHash(testApp), cdHashBefore, 'Failed update must preserve old signed launcher');

    // 3e. Clean uninstall of managed targets
    execFileSync('bash', [uninstallSh, '--dest', testApp, '--runtime', testRuntimeBase], { stdio: 'pipe' });
    assert.equal(fs.existsSync(testApp), false, 'Uninstall did not remove test app');
    assert.equal(fs.existsSync(testRuntimeBase), false, 'Uninstall did not remove test runtime');
    console.log(`ALL_SMOKE_TESTS_PASSED (macOS CDHash verified: ${cdHashBefore.slice(0, 12)}...)`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
} else {
  console.log('CORE_SYNTAX_AND_POLICY_TESTS_PASSED (SKIPPED_MACOS_INSTALLER_TESTS: requires macOS + /Applications/Antigravity.app)');
}
