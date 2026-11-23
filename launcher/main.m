#import <Cocoa/Cocoa.h>

static NSString *resolveNodePath(NSBundle *bundle) {
  NSFileManager *fm = [NSFileManager defaultManager];
  NSString *plistNode = [bundle objectForInfoDictionaryKey:@"AGWNodePath"];
  NSMutableArray<NSString *> *candidates = [NSMutableArray array];
  if ([plistNode isKindOfClass:[NSString class]] && plistNode.length > 0) {
    [candidates addObject:plistNode];
  }
  [candidates addObjectsFromArray:@[
    @"/opt/homebrew/bin/node",
    @"/usr/local/bin/node",
    @"/usr/bin/node"
  ]];
  for (NSString *path in candidates) {
    if ([fm isExecutableFileAtPath:path]) return path;
  }
  NSTask *whichTask = [[NSTask alloc] init];
  whichTask.executableURL = [NSURL fileURLWithPath:@"/bin/zsh"];
  whichTask.arguments = @[@"-lc", @"command -v node"];
  NSPipe *pipe = [NSPipe pipe];
  whichTask.standardOutput = pipe;
  whichTask.standardError = [NSPipe pipe];
  if ([whichTask launchAndReturnError:nil]) {
    [whichTask waitUntilExit];
    if (whichTask.terminationStatus == 0) {
      NSData *data = [[pipe fileHandleForReading] readDataToEndOfFile];
      NSString *found = [[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]
          stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
      if (found.length > 0 && [fm isExecutableFileAtPath:found]) return found;
    }
  }
  return nil;
}

static BOOL verifyGoogleAntigravitySignature(NSString *appPath) {
  NSString *requirement =
      @"-R=anchor apple generic and identifier \"com.google.antigravity\" and certificate leaf[subject.OU] = \"EQHXZ8M8AV\"";
  NSTask *task = [[NSTask alloc] init];
  task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/codesign"];
  task.arguments = @[@"--verify", @"--strict", requirement, appPath];
  task.standardOutput = [NSPipe pipe];
  task.standardError = [NSPipe pipe];
  if (![task launchAndReturnError:nil]) return NO;
  [task waitUntilExit];
  return task.terminationStatus == 0;
}

static BOOL verifyNodeSqlite(NSString *nodePath) {
  NSTask *task = [[NSTask alloc] init];
  task.executableURL = [NSURL fileURLWithPath:nodePath];
  task.arguments = @[@"-e", @"require('node:sqlite')"];
  task.standardOutput = [NSPipe pipe];
  task.standardError = [NSPipe pipe];
  if (![task launchAndReturnError:nil]) return NO;
  [task waitUntilExit];
  return task.terminationStatus == 0;
}

static void showAlert(NSString *title, NSString *info) {
  [NSApplication sharedApplication];
  NSAlert *alert = [[NSAlert alloc] init];
  alert.alertStyle = NSAlertStyleWarning;
  alert.messageText = title;
  alert.informativeText = info;
  [alert addButtonWithTitle:@"好"];
  [alert runModal];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSProcessInfo *proc = [NSProcessInfo processInfo];
    NSBundle *mainBundle = [NSBundle mainBundle];
    NSString *plistApp = [mainBundle objectForInfoDictionaryKey:@"AGWAppPath"];
    NSString *appPath = proc.environment[@"ANTIGRAVITY_APP_PATH"] ?: (plistApp.length > 0 ? plistApp : @"/Applications/Antigravity.app");
    NSFileManager *fm = [NSFileManager defaultManager];

    if (![fm fileExistsAtPath:appPath]) {
      showAlert(@"未找到原版 Antigravity",
                [NSString stringWithFormat:@"请先安装 Google Antigravity（未找到：%@）。", appPath]);
      return 1;
    }

    NSArray<NSRunningApplication *> *running =
        [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.google.antigravity"];
    if (running.count > 0) {
      [running.firstObject activateWithOptions:NSApplicationActivateIgnoringOtherApps];
      return 0;
    }

    if (!verifyGoogleAntigravitySignature(appPath)) {
      showAlert(@"原版 Antigravity 官方签名校验未通过",
                @"目标应用未通过 Google LLC (EQHXZ8M8AV) / com.google.antigravity 严格签名校验。为保障安全，启动器已停止启动。");
      return 1;
    }

    NSString *nodePath = resolveNodePath(mainBundle);
    if (!nodePath || !verifyNodeSqlite(nodePath)) {
      showAlert(@"Node.js 运行时不可用",
                @"未找到支持内置 node:sqlite 的 Node.js（需要 v22.13 及以上），请升级 Node.js 后重新运行 install.sh。");
      return 1;
    }

    NSString *plistRuntime = [mainBundle objectForInfoDictionaryKey:@"AGWRuntimeDir"];
    NSString *runtimeDir = proc.environment[@"TALOS_AGW_RUNTIME"];
    if (runtimeDir.length == 0) {
      runtimeDir = plistRuntime.length > 0 ? plistRuntime : [NSHomeDirectory() stringByAppendingPathComponent:
          @"Library/Application Support/talos-antigravity-workbench/runtime"];
    }
    NSString *scriptPath = [runtimeDir stringByAppendingPathComponent:@"launch.cjs"];
    if (![fm fileExistsAtPath:scriptPath]) {
      scriptPath = [[mainBundle resourcePath] stringByAppendingPathComponent:@"launch.cjs"];
    }
    if (![fm fileExistsAtPath:scriptPath]) {
      showAlert(@"启动器文件不完整", @"缺少运行时 launch.cjs，请重新运行 install.sh 安装。");
      return 1;
    }

    NSTask *launcher = [[NSTask alloc] init];
    launcher.executableURL = [NSURL fileURLWithPath:nodePath];
    launcher.arguments = @[scriptPath];
    NSMutableDictionary *env = [proc.environment mutableCopy];
    env[@"ANTIGRAVITY_APP_PATH"] = appPath;
    launcher.environment = env;
    launcher.currentDirectoryURL = [NSURL fileURLWithPath:NSHomeDirectory()];
    NSError *err = nil;
    if (![launcher launchAndReturnError:&err]) {
      showAlert(@"启动失败", err.localizedDescription ?: @"无法拉起 Node 启动脚本。");
      return 1;
    }
    return 0;
  }
}
