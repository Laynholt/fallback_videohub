const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const test = require('node:test');

test('event file writer rotates three bounded files without following a replaced symlink', async t => {
  const { createFileWriter } = require('../server/swatter-log');
  const scratch = path.resolve(__dirname, '../.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratch, 'swatter-rotation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, 'events.jsonl');
  const write = promisify(createFileWriter(directory));
  await write('{"sequence":1}\n');
  fs.truncateSync(log, 10 * 1024 * 1024);
  await write('{"sequence":2}\n');
  assert.equal(fs.statSync(log + '.1').size, 10 * 1024 * 1024);
  assert.equal(fs.readFileSync(log, 'utf8'), '{"sequence":2}\n');
  fs.truncateSync(log, 10 * 1024 * 1024);
  await write('{"sequence":3}\n');
  fs.truncateSync(log, 10 * 1024 * 1024);
  await write('{"sequence":4}\n');
  assert.equal(fs.existsSync(log + '.3'), false);
  assert.equal(fs.readdirSync(directory).length, 3);
  assert.equal(fs.readFileSync(log, 'utf8'), '{"sequence":4}\n');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(log).mode & 0o777, 0o640);
    const protectedFile = path.join(directory, 'protected');
    fs.writeFileSync(protectedFile, 'untouched');
    fs.unlinkSync(log);
    fs.symlinkSync(protectedFile, log);
    await assert.rejects(write('{"sequence":5}\n'));
    assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'untouched');
  }
});
