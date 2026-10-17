import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMacPlatform,
  getModifierLabel,
  getShortcutLabel,
  STUDIO_SHORTCUTS
} from '../src/utils/shortcuts.ts';

describe('Studio Keyboard Shortcuts & Platform Adaptation', () => {
  test('returns standard modifier label (Ctrl or Cmd)', () => {
    const mod = getModifierLabel();
    assert.ok(mod === 'Ctrl' || mod === 'Cmd', 'Modifier must be Ctrl or Cmd');
  });

  test('formats studio shortcuts with modifier and Shift', () => {
    const mod = getModifierLabel();
    assert.equal(getShortcutLabel('m'), `${mod}+Shift+M`);
    assert.equal(getShortcutLabel('p'), `${mod}+Shift+P`);
    assert.equal(getShortcutLabel('a'), `${mod}+Shift+A`);
    assert.equal(getShortcutLabel('d'), `${mod}+Shift+D`);
    assert.equal(getShortcutLabel('t'), `${mod}+Shift+T`);
    assert.equal(getShortcutLabel('s'), `${mod}+Shift+S`);
  });

  test('has verified keys in STUDIO_SHORTCUTS constants', () => {
    assert.equal(STUDIO_SHORTCUTS.TOGGLE_MIC, 'M');
    assert.equal(STUDIO_SHORTCUTS.PAUSE_RESUME, 'P');
    assert.equal(STUDIO_SHORTCUTS.TOGGLE_RECORDING, 'A');
    assert.equal(STUDIO_SHORTCUTS.TOGGLE_DRAWING, 'D');
    assert.equal(STUDIO_SHORTCUTS.TOGGLE_PROMPTER, 'T');
    assert.equal(STUDIO_SHORTCUTS.SCREENSHOT, 'S');
    assert.equal(STUDIO_SHORTCUTS.SHARE_LINK, 'L');
  });
});
