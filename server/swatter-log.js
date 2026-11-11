'use strict';

const fs = require('node:fs');
const path = require('node:path');
const MAX_BYTES = 10 * 1024 * 1024;

// One application process owns this directory; the collector mounts it read-only.
function createFileWriter(directory) {
  if (!path.isAbsolute(directory) || fs.realpathSync(directory) !== path.resolve(directory) ||
      !fs.statSync(directory).isDirectory()) throw new TypeError('Invalid Swatter log directory');
  const target = path.join(directory, 'events.jsonl');
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0);
  if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new TypeError('Invalid Swatter log file');
  const descriptor = fs.openSync(target, flags, 0o640);
  fs.closeSync(descriptor);

  async function append(line) {
    let size = 0;
    try {
      const stat = await fs.promises.lstat(target);
      if (!stat.isFile()) throw new TypeError('Invalid Swatter log file');
      size = stat.size;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (size + Buffer.byteLength(line) > MAX_BYTES) {
      await fs.promises.rm(target + '.2', { force: true });
      for (const [from, to] of [[target + '.1', target + '.2'], [target, target + '.1']]) {
        try { await fs.promises.rename(from, to); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    const file = await fs.promises.open(target, flags, 0o640);
    try { await file.writeFile(line); }
    finally { await file.close(); }
  }
  return (line, callback) => { append(line).then(() => callback(null), callback); };
}

module.exports = { createFileWriter };
