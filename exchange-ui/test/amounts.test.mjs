import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, isEternoCoinType, minimumReceived, parseUnits } from '../src/amounts.mjs';

test('parses decimal amounts into nine-decimal Sui base units', () => {
  assert.equal(parseUnits('1'), 1_000_000_000n);
  assert.equal(parseUnits('0.000000001'), 1n);
  assert.equal(parseUnits('999999.123456789'), 999_999_123_456_789n);
});

test('rejects malformed, zero, over-precision, and u64-overflow amounts', () => {
  for (const value of ['', '0', '-1', '1e3', '1.0000000001', '18446744074']) {
    assert.equal(parseUnits(value), null, `expected ${value} to be rejected`);
  }
});

test('formats base units without rounding up', () => {
  assert.equal(formatUnits(1_234_567_890n), '1.234567');
  assert.equal(formatUnits(1_000_000_000n), '1');
  assert.equal(formatUnits(9_999_999_999n, 9, 9), '9.999999999');
});

test('computes the 0.5 percent minimum received amount conservatively', () => {
  assert.equal(minimumReceived(1_000_000n), 995_000n);
  assert.equal(minimumReceived(1n), 0n);
});

test('accepts only an Eterno Move coin type shape', () => {
  assert.equal(isEternoCoinType(`0x${'a'.repeat(64)}::eterno::ETERNO`), true);
  assert.equal(isEternoCoinType('0x2::sui::SUI'), false);
  assert.equal(isEternoCoinType(`0x${'g'.repeat(64)}::eterno::ETERNO`), false);
});
