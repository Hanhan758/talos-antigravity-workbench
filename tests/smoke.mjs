import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
  .replace('__AG_ACCOUNT_CONTEXT__', JSON.stringify({}));
new vm.Script(`(${appCode.trim().replace(/;$/, '')})`);

// 2. Desensitization check & sandbox protection check
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

// 3. Installer dry-run + isolated install + CDHash stability across runtime updates + uninstall
if (process.platform === 'darwin' && fs.existsSync('/Applications/Antigravity.app')) {
  execFileSync('bash', [path.join(repoRoot, 'scripts/install.sh'), '--dry-run'], { stdio: 'pipe' });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-ag-wb-test-'));
  const testApp = path.join(tmpRoot, 'Antigravity Workbench Test.app');
  const testRuntimeBase = path.join(tmpRoot, 'support');
  const testRuntime = path.join(testRuntimeBase, 'runtime');
  try {
    // First install: builds launcher .app + deploys runtime
    execFileSync('bash', [
      path.join(repoRoot, 'scripts/install.sh'),
      '--dest', testApp,
      '--runtime', testRuntime,
      '--name', 'Antigravity Workbench Test'
    ], { stdio: 'pipe' });

    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Info.plist')), 'Info.plist missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')), 'Launcher executable missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Resources/icon.icns')), 'Original icon.icns not reused');
    assert.ok(fs.existsSync(path.join(testRuntime, 'launch.cjs')), 'runtime/launch.cjs missing');
    assert.equal(fs.existsSync(path.join(testApp, 'Contents/Resources/launch.cjs')), false, 'launch.cjs should live in decoupled runtime dir');

    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', testApp], { stdio: 'pipe' });
    const getCdHash = () => {
      const out = execFileSync('/usr/bin/codesign', ['-dvvv', testApp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return out;
    };
    const sigBefore = execFileSync('/usr/bin/codesign', ['-dvvv', testApp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const mtimeBefore = fs.statSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')).mtimeMs;

    // Second install: updates runtime ONLY without rebuilding/re-signing .app (preserves TCC CDHash)
    execFileSync('bash', [
      path.join(repoRoot, 'scripts/install.sh'),
      '--dest', testApp,
      '--runtime', testRuntime,
      '--name', 'Antigravity Workbench Test'
    ], { stdio: 'pipe' });

    const sigAfter = execFileSync('/usr/bin/codesign', ['-dvvv', testApp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const mtimeAfter = fs.statSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')).mtimeMs;
    assert.equal(mtimeAfter, mtimeBefore, 'Second install must not rebuild unchanged launcher binary');
    assert.equal(sigAfter, sigBefore, 'Second install must preserve launcher signature / CDHash');

    execFileSync('bash', [path.join(repoRoot, 'scripts/uninstall.sh'), '--dest', testApp, '--runtime', testRuntimeBase], { stdio: 'pipe' });
    assert.equal(fs.existsSync(testApp), false, 'Uninstall did not remove test app');
    assert.equal(fs.existsSync(testRuntimeBase), false, 'Uninstall did not remove test runtime');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

console.log('ALL_SMOKE_TESTS_PASSED');
