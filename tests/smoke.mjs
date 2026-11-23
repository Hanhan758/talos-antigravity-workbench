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

// 2. Desensitization check: no hardcoded personal paths or TALOS-private MCP references
const forbidden = [/\/Users\/[a-z0-9_-]+\//i, /TALOS-Workspace/, /talos_state_mcp/, /talos-profile-hub/, /mcp-lifecycle\.cjs/, /orphan-cleanup\.cjs/];
for (const dir of [srcDir, path.join(repoRoot, 'scripts'), path.join(repoRoot, 'launcher')]) {
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const pat of forbidden) {
      assert.equal(pat.test(text), false, `Found forbidden pattern ${pat} in ${file}`);
    }
  }
}

// 3. Installer dry-run + real isolated install into TMPDIR (never touches ~/Applications)
if (process.platform === 'darwin' && fs.existsSync('/Applications/Antigravity.app')) {
  execFileSync('bash', [path.join(repoRoot, 'scripts/install.sh'), '--dry-run'], { stdio: 'pipe' });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-ag-wb-test-'));
  const testApp = path.join(tmpRoot, 'Antigravity Workbench Test.app');
  try {
    execFileSync('bash', [
      path.join(repoRoot, 'scripts/install.sh'),
      '--dest', testApp,
      '--name', 'Antigravity Workbench Test'
    ], { stdio: 'pipe' });

    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Info.plist')), 'Info.plist missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/MacOS/AntigravityWorkbench')), 'Launcher executable missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Resources/launch.cjs')), 'launch.cjs missing');
    assert.ok(fs.existsSync(path.join(testApp, 'Contents/Resources/icon.icns')), 'Original icon.icns not reused');

    const plist = fs.readFileSync(path.join(testApp, 'Contents/Info.plist'), 'utf8');
    assert.match(plist, /<key>CFBundleIconFile<\/key>/);
    assert.match(plist, /icon\.icns/);

    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', testApp], { stdio: 'pipe' });

    execFileSync('bash', [path.join(repoRoot, 'scripts/uninstall.sh'), '--dest', testApp], { stdio: 'pipe' });
    assert.equal(fs.existsSync(testApp), false, 'Uninstall did not remove test app');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

console.log('ALL_SMOKE_TESTS_PASSED');
