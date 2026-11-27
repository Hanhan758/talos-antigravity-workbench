'use strict';

const { execFile } = require('node:child_process');

// 通过 osascript argv 安全传参触发 macOS 原生通知，绝不拼接脚本文本。
const APPLESCRIPT = 'on run argv\n  set t to item 1 of argv\n  set m to item 2 of argv\n  set s to item 3 of argv\n  if s is "" then\n    display notification m with title t\n  else\n    display notification m with title t sound name s\n  end if\nend run';

function sendNotification({ title = 'Antigravity', message = '', sound = 'Glass' } = {}) {
  const safeTitle = String(title || 'Antigravity').slice(0, 80);
  const safeMsg = String(message || '').slice(0, 200);
  if (!safeMsg) return false;
  const safeSound = typeof sound === 'string' ? sound.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 32) : '';
  try {
    execFile('/usr/bin/osascript', ['-e', APPLESCRIPT, safeTitle, safeMsg, safeSound], { timeout: 3000 }, () => {});
    return true;
  } catch {
    return false;
  }
}

function createStatusNotifier({ send = sendNotification, minRunMs = 8000 } = {}) {
  const sessions = new Map();
  return {
    observe(id, status, { enabled = true, pageVisible = true, lang = 'zh', nowMs = Date.now() } = {}) {
      if (!id || !status?.state) return null;
      const prev = sessions.get(id);
      const st = status.state;
      if (!prev) {
        sessions.set(id, { state: st, startedAt: (st === 'running' || st === 'waiting') ? nowMs : 0 });
        if (sessions.size > 32) sessions.delete(sessions.keys().next().value);
        return null;
      }
      if (prev.state === st) return null;

      let event = null;
      const isEn = lang === 'en';
      if (st === 'running' && prev.state !== 'waiting') {
        prev.startedAt = nowMs;
      } else if (st === 'ready' && (prev.state === 'running' || prev.state === 'waiting')) {
        const elapsed = prev.startedAt > 0 ? nowMs - prev.startedAt : 0;
        if (enabled && !pageVisible && elapsed >= minRunMs) {
          event = {
            kind: 'completed',
            title: isEn ? 'Antigravity Task Complete' : 'Antigravity 任务已完成',
            message: isEn ? 'The background agent task has finished.' : '后台对话任务已执行完成，点击返回查看结果。',
            sound: 'Glass'
          };
        }
        prev.startedAt = 0;
      } else if (st === 'error' && prev.state !== 'error') {
        if (enabled) {
          event = {
            kind: 'error',
            title: isEn ? 'Antigravity Error' : 'Antigravity 执行异常',
            message: isEn ? 'The current session encountered an error.' : '当前会话出现执行异常，请及时查看。',
            sound: 'Basso'
          };
        }
        prev.startedAt = 0;
      } else if (st === 'waiting' && prev.state === 'running') {
        if (enabled && !pageVisible) {
          event = {
            kind: 'waiting',
            title: isEn ? 'Antigravity Waiting' : 'Antigravity 等待响应',
            message: status.kind === 'compacting'
              ? (isEn ? 'Context compaction is taking longer than usual.' : '上下文压缩耗时较长，请留意进度。')
              : (isEn ? 'Task has been waiting for over 60s.' : '后台任务已等待超过 60 秒，可能需要确认或关注。'),
            sound: 'Ping'
          };
        }
      }
      prev.state = st;
      if (event) send(event);
      return event;
    }
  };
}

module.exports = { sendNotification, createStatusNotifier };
