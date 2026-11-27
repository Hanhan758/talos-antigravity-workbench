import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(repoRoot, 'src');

// 1. Full syntax check: ALL .cjs, ALL .js, and BOTH shell scripts
for (const file of fs.readdirSync(srcDir)) {
  const full = path.join(srcDir, file);
  if (file.endsWith('.cjs')) {
    execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
  } else if (file.endsWith('.js') && !['localization.js', 'appearance.js'].includes(file)) {
    const raw = fs.readFileSync(full, 'utf8').trim().replace(/;$/, '');
    new vm.Script(`(${raw})`, { filename: file });
  }
}

const i18nDict = JSON.parse(fs.readFileSync(path.join(srcDir, 'i18n.json'), 'utf8'));
assert.ok(Object.keys(i18nDict).length >= 1800, 'i18n.json should contain full dictionary');
const locCode = fs.readFileSync(path.join(srcDir, 'localization.js'), 'utf8')
  .trim().replace(/;$/, '')
  .replace('__AG_I18N_DICT__', () => JSON.stringify(i18nDict))
  .replace('__AG_INITIAL_LANG__', JSON.stringify('zh'));
new vm.Script(`(${locCode})`, { filename: 'localization.js' });

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
new vm.Script(`(${appCode.trim().replace(/;$/, '')})`, { filename: 'appearance.js' });

execFileSync('bash', ['-n', path.join(repoRoot, 'scripts/install.sh')], { stdio: 'pipe' });
execFileSync('bash', ['-n', path.join(repoRoot, 'scripts/uninstall.sh')], { stdio: 'pipe' });

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

// 3. macOS installer, safety guards, rollback, XML escaping, shell fallback & uninstaller regression tests
if (process.platform === 'darwin' && fs.existsSync('/Applications/Antigravity.app')) {
  const installSh = path.join(repoRoot, 'scripts/install.sh');
  const uninstallSh = path.join(repoRoot, 'scripts/uninstall.sh');

  // 3a. Missing option value fails cleanly (no unbound variable)
  const missingArg = spawnSync('bash', [installSh, '--name'], { encoding: 'utf8' });
  assert.notEqual(missingArg.status, 0);
  assert.equal(/unbound variable/i.test(missingArg.stderr), false, 'Should print friendly error instead of unbound variable');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-ag-wb-test-'));
  const testApp = path.join(tmpRoot, 'Antigravity Workbench Test.app');
  const testRuntimeBase = path.join(tmpRoot, 'support');
  const testRuntime = path.join(testRuntimeBase, 'runtime');
  const foreignApp = path.join(tmpRoot, 'Foreign.app');
  const foreignDir = path.join(tmpRoot, 'foreign-dir');
  const linkApp = path.join(tmpRoot, 'Link.app');
  const linkDir = path.join(tmpRoot, 'link-dir');

  try {
    execFileSync('bash', [installSh, '--dry-run', '--dest', testApp, '--runtime', testRuntime], { stdio: 'pipe' });

    // 3b. Safety guards: unowned dirs, trailing slash on original app, and symlink traversal
    fs.mkdirSync(path.join(foreignApp, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(foreignApp, 'Contents/sentinel.txt'), 'keep');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'sentinel.txt'), 'keep');
    fs.symlinkSync(foreignApp, linkApp);
    fs.symlinkSync(foreignDir, linkDir);

    assert.notEqual(spawnSync('bash', [installSh, '--dest', foreignApp, '--runtime', testRuntime]).status, 0);
    assert.notEqual(spawnSync('bash', [installSh, '--dest', '/Applications/Antigravity.app/', '--runtime', testRuntime]).status, 0);
    assert.notEqual(spawnSync('bash', [installSh, '--dest', linkApp + '/', '--runtime', testRuntime]).status, 0);
    assert.notEqual(spawnSync('bash', [installSh, '--dest', testApp, '--runtime', foreignDir]).status, 0);
    assert.notEqual(spawnSync('bash', [uninstallSh, '--dest', '/Applications/Antigravity.app/', '--runtime', foreignDir]).status, 0);
    assert.notEqual(spawnSync('bash', [uninstallSh, '--dest', linkApp + '/', '--runtime', linkDir + '/']).status, 0);
    assert.ok(fs.existsSync(path.join(foreignApp, 'Contents/sentinel.txt')), 'Foreign app sentinel must survive');
    assert.ok(fs.existsSync(path.join(foreignDir, 'sentinel.txt')), 'Foreign dir sentinel must survive');

    // 3c. First install with XML special chars in --name + relative paths -> verify absolute plist, plutil -lint & shared parent protection
    const relApp = './Rel Test.app';
    const relRuntime = './rel-support/runtime';
    const resolvedRelApp = path.join(tmpRoot, 'Rel Test.app');
    const resolvedRelParent = path.join(tmpRoot, 'rel-support');
    const resolvedRelRuntime = path.join(resolvedRelParent, 'runtime');
    fs.mkdirSync(resolvedRelParent, { recursive: true });
    fs.writeFileSync(path.join(resolvedRelParent, 'sibling-keep.txt'), 'do-not-delete');
    fs.writeFileSync(path.join(resolvedRelParent, 'launcher.sha256'), 'USER_OWNED_LAUNCHER_HASH\n');

    execFileSync('bash', [
      installSh,
      '--dest', relApp,
      '--runtime', relRuntime,
      '--name', 'Antigravity & <Test>'
    ], { cwd: tmpRoot, stdio: 'pipe' });

    execFileSync('/usr/bin/plutil', ['-lint', path.join(resolvedRelApp, 'Contents/Info.plist')], { stdio: 'pipe' });
    const relPlist = fs.readFileSync(path.join(resolvedRelApp, 'Contents/Info.plist'), 'utf8');
    assert.match(relPlist, /Antigravity &amp; &lt;Test&gt;/);
    assert.ok(relPlist.includes(`<string>${fs.realpathSync(resolvedRelRuntime)}</string>`), 'AGWRuntimeDir must be normalized absolute path');
    assert.equal(
      fs.readFileSync(path.join(resolvedRelParent, 'launcher.sha256'), 'utf8'),
      'USER_OWNED_LAUNCHER_HASH\n',
      'Install must not overwrite unrelated launcher.sha256 in shared parent directory'
    );
    assert.ok(fs.existsSync(path.join(resolvedRelRuntime, '.launcher.sha256')), 'Launcher hash must live inside managed runtime dir');

    // Shared parent sibling & same-name launcher.sha256 protection on uninstall
    execFileSync('bash', [uninstallSh, '--dest', resolvedRelApp, '--runtime', resolvedRelParent], { stdio: 'pipe' });
    assert.equal(fs.existsSync(resolvedRelRuntime), false, 'Managed runtime subdir must be removed');
    assert.ok(fs.existsSync(path.join(resolvedRelParent, 'sibling-keep.txt')), 'Sibling file in shared parent must be preserved');
    assert.equal(
      fs.readFileSync(path.join(resolvedRelParent, 'launcher.sha256'), 'utf8'),
      'USER_OWNED_LAUNCHER_HASH\n',
      'Uninstall must not delete unrelated launcher.sha256 in shared parent directory'
    );

    // 3d. Native install + multi-update CDHash stability + pre-swap & mid-swap rollback + launch rolled-back old app
    execFileSync('bash', [installSh, '--dest', testApp, '--runtime', testRuntime, '--name', 'Antigravity Workbench Test'], { stdio: 'pipe' });
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', testApp], { stdio: 'pipe' });
    const cdHashBefore = readCdHash(testApp);
    const mtimeBefore = fs.statSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')).mtimeMs;

    // Two consecutive runtime updates must preserve .launcher.sha256, user/ overrides, and keep CDHash/mtime unchanged
    const testUserDir = path.join(testRuntimeBase, 'user');
    fs.mkdirSync(testUserDir, { recursive: true });
    fs.writeFileSync(path.join(testUserDir, 'i18n.override.json'), '{"Settings":"偏好设置"}\n');
    fs.writeFileSync(path.join(testUserDir, 'custom.css'), ':root { --ag-user-test: 1; }\n');
    for (let i = 0; i < 2; i++) {
      execFileSync('bash', [installSh, '--dest', testApp, '--runtime', testRuntime, '--name', 'Antigravity Workbench Test'], { stdio: 'pipe' });
      assert.equal(fs.statSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')).mtimeMs, mtimeBefore);
      assert.equal(readCdHash(testApp), cdHashBefore);
      assert.equal(fs.readFileSync(path.join(testUserDir, 'i18n.override.json'), 'utf8'), '{"Settings":"偏好设置"}\n');
      assert.equal(fs.readFileSync(path.join(testUserDir, 'custom.css'), 'utf8'), ':root { --ag-user-test: 1; }\n');
    }

    // Pre-swap failure (invalid signing identity during stage 2)
    const failSign = spawnSync('bash', [
      installSh, '--dest', testApp, '--runtime', testRuntime,
      '--name', 'Antigravity Workbench Test', '--rebuild-launcher', '--sign', 'NON_EXISTENT_SIGN_IDENTITY_99999'
    ], { encoding: 'utf8' });
    assert.notEqual(failSign.status, 0);
    assert.ok(fs.existsSync(path.join(testRuntime, 'launch.cjs')), 'Old runtime must survive pre-swap failure');
    assert.equal(readCdHash(testApp), cdHashBefore, 'Old launcher CDHash must survive pre-swap failure');

    // Mid-swap failure (stage 3: runtime already swapped, then app swap fails because old app is locked via uchg)
    fs.writeFileSync(path.join(testRuntime, '.v1-marker'), 'v1');
    execFileSync('/usr/bin/chflags', ['uchg', testApp], { stdio: 'pipe' });
    let failSwap;
    try {
      failSwap = spawnSync('bash', [
        installSh, '--dest', testApp, '--runtime', testRuntime,
        '--name', 'Antigravity Workbench Updated', '--rebuild-launcher'
      ], { encoding: 'utf8' });
    } finally {
      execFileSync('/usr/bin/chflags', ['nouchg', testApp], { stdio: 'pipe' });
    }
    assert.notEqual(failSwap.status, 0, 'Mid-swap failure must return non-zero');
    assert.ok(fs.existsSync(path.join(testRuntime, '.v1-marker')), 'Old runtime must be rolled back after mid-swap failure');
    assert.equal(
      execFileSync('/usr/bin/defaults', ['read', path.join(testApp, 'Contents/Info.plist'), 'CFBundleDisplayName'], { encoding: 'utf8' }).trim(),
      'Antigravity Workbench Test',
      'Old app DisplayName must remain intact after mid-swap failure'
    );
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', testApp], { stdio: 'pipe' });
    assert.equal(readCdHash(testApp), cdHashBefore, 'Old app CDHash must remain intact after mid-swap failure');
    assert.equal(
      fs.readdirSync(testRuntimeBase).some(n => n.startsWith('.talos-agw-')),
      false,
      'No temporary stage or backup dirs should remain in runtime parent after rollback'
    );

    // Verify rolled-back old launcher can actually execute cleanly when Antigravity is running
    let rolledBackLaunched = false;
    const runningCheck = spawnSync('/usr/bin/lsappinfo', ['info', '-only', 'pid', 'com.google.antigravity'], { encoding: 'utf8' });
    if (runningCheck.status === 0 && /"pid"\s*=\s*\d+/.test(runningCheck.stdout || '')) {
      const launchOld = spawnSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench'), [], { encoding: 'utf8', timeout: 5000 });
      assert.equal(launchOld.status, 0, `Rolled-back old launcher failed to run: ${launchOld.stderr}`);
      rolledBackLaunched = true;
    }

    // 3e. --no-compile Shell fallback: verify syntax and signature-before-pgrep ordering
    execFileSync('bash', [installSh, '--no-compile', '--rebuild-launcher', '--dest', testApp, '--runtime', testRuntime], { stdio: 'pipe' });
    const shellBin = path.join(testApp, 'Contents/MacOS/AntigravityWorkbench');
    execFileSync('/bin/sh', ['-n', shellBin], { stdio: 'pipe' });
    const shellSrc = fs.readFileSync(shellBin, 'utf8');
    assert.ok(shellSrc.indexOf('codesign --verify') > 0 && shellSrc.indexOf('codesign --verify') < shellSrc.indexOf('pgrep -x'),
      'Shell fallback must verify Google signature BEFORE pgrep/open');

    execFileSync('bash', [uninstallSh, '--dest', testApp, '--runtime', testRuntimeBase], { stdio: 'pipe' });
    assert.equal(fs.existsSync(testApp), false);
    assert.equal(fs.existsSync(testRuntime), false, 'Managed runtime subdir must be removed on uninstall');
    assert.ok(fs.existsSync(path.join(testUserDir, 'i18n.override.json')), 'User i18n overrides must be preserved on uninstall');
    assert.ok(fs.existsSync(path.join(testUserDir, 'custom.css')), 'User custom.css must be preserved on uninstall');
    console.log(`ALL_SMOKE_TESTS_PASSED (macOS CDHash verified: ${cdHashBefore.slice(0, 12)}..., rolledBackOldAppLaunched: ${rolledBackLaunched})`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
} else {
  console.log('CORE_SYNTAX_AND_POLICY_TESTS_PASSED (SKIPPED_MACOS_INSTALLER_TESTS: requires macOS + /Applications/Antigravity.app)');
}
