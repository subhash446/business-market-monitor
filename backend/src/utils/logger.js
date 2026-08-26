/**
 * Lightweight structured logging (Production Hardening Phase B, finding
 * H2). Not a new dependency, not a request-logging/access-log feature —
 * exactly what H2 asked for: leveled log lines with timestamps, written to
 * both the console and the `logs/` folder that has existed since Document 6
 * v1.1 specifically for "runtime log files" but nothing wrote to until now.
 *
 * Scoped to the same 3 files the audit identified as using raw console
 * calls in the running server's boot/request-handling path: server.js,
 * database/connection.js, middleware/errorHandler.middleware.js.
 * scripts/migrate.js and scripts/seed.js (Phase A) are intentionally left
 * using plain console.log — they're one-off CLI tools whose entire purpose
 * is direct terminal output, not part of the running server.
 *
 * Production Hardening Phase B, finding M-1: file writes are asynchronous
 * (fs.promises.appendFile) instead of fs.appendFileSync, which blocked
 * Node's event loop on every single log call — including every call from
 * errorHandler.middleware.js, on the hot request-handling path. The public
 * API is unchanged: logger.info/warn/error remain plain, fire-and-forget
 * calls. Writes are chained on a single internal queue so lines still land
 * in the log file in the exact order they were issued.
 *
 * Production Hardening Phase B, finding M-2: simple size-based rotation.
 * When app.log reaches MAX_LOG_SIZE_BYTES, it's renamed to app.log.1
 * (overwriting any previous backup — exactly one backup is kept) and a
 * fresh app.log is started. The rotation check runs inside the same
 * write-queue chain M-1 already established, so it can't race with
 * concurrent writes. No new dependency — fs.promises.rename/stat only.
 */
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/app.log');
const BACKUP_LOG_FILE = `${LOG_FILE}.1`;

// A plain, stated implementation constant (same category as, e.g., Phase
// 10's RECENT_ITEMS_LIMIT) — not a documented business threshold requiring
// external configuration. 5MB is a reasonable cap for a lightweight,
// single-backup rotation scheme at this project's expected log volume.
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

function timestamp() {
  return new Date().toISOString();
}

function formatArgs(args) {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
}

// Rotates BEFORE the pending line is appended, so a line that pushes the
// file over the limit becomes the first line of the new file, not one more
// line appended to the oversized one.
async function rotateIfNeeded() {
  let stats;
  try {
    stats = await fs.promises.stat(LOG_FILE);
  } catch (err) {
    // No file yet (first run, or immediately after a prior rotation) —
    // nothing to rotate.
    return;
  }

  if (stats.size >= MAX_LOG_SIZE_BYTES) {
    try {
      // rename() overwrites an existing destination on POSIX systems —
      // this is exactly "keep one backup": any previous app.log.1 is
      // discarded, and the just-filled app.log becomes the new one.
      await fs.promises.rename(LOG_FILE, BACKUP_LOG_FILE);
    } catch (err) {
      console.error(`[${timestamp()}] [ERROR] Failed to rotate log file: ${err.message}`);
    }
  }
}

// Chained so concurrent log calls still rotate/append in issue order,
// without any caller needing to await anything and without a queueing
// library.
let writeQueue = Promise.resolve();

function appendToFile(line) {
  writeQueue = writeQueue
    .then(() => rotateIfNeeded())
    .then(() => fs.promises.appendFile(LOG_FILE, `${line}\n`))
    .catch((err) => {
      // A logging failure must never crash the app or mask the original
      // message — fall back to console only.
      console.error(`[${timestamp()}] [ERROR] Failed to write to log file: ${err.message}`);
    });
}

function write(level, args) {
  const line = `[${timestamp()}] [${level}] ${formatArgs(args)}`;

  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }

  appendToFile(line);
}

module.exports = {
  info: (...args) => write('INFO', args),
  warn: (...args) => write('WARN', args),
  error: (...args) => write('ERROR', args),
  // Returns the current tail of the write queue, so a caller that's about
  // to call process.exit() (server.js's graceful shutdown, H4) can await
  // it first — otherwise process.exit() can race ahead of the still-
  // in-flight async write and silently drop the last log line(s).
  flush: () => writeQueue,
};
