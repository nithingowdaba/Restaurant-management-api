const test = require('node:test');
const assert = require('node:assert/strict');
const { toPaise, fromPaise } = require('../src/utils/money');

test('money conversion uses integer paise without floating point drift', () => {
  const price = toPaise('85.25');
  assert.equal(price * 3, 25575);
  assert.equal(fromPaise(price * 3), '255.75');
});

test('money conversion rejects precision beyond paise', () => {
  assert.throws(() => toPaise('1.001'));
});
