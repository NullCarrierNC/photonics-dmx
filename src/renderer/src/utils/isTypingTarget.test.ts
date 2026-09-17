/** @jest-environment jsdom */
import { describe, expect, it, afterEach } from '@jest/globals'
import { isTypingTarget } from './isTypingTarget'

function element(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host.firstElementChild as Element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isTypingTarget', () => {
  it.each([
    ['a text input', '<input type="text" />'],
    ['a number input', '<input type="number" />'],
    ['a textarea', '<textarea></textarea>'],
    ['a select, which takes a keystroke as type-ahead', '<select></select>'],
    ['an editable div', '<div contenteditable="true"></div>'],
    ['an editable div with the empty spelling', '<div contenteditable=""></div>'],
    ['a plaintext-only editable', '<div contenteditable="plaintext-only"></div>'],
  ])('is true for %s', (_label, html) => {
    expect(isTypingTarget(element(html))).toBe(true)
  })

  it.each([
    ['a button', '<button></button>'],
    ['a plain div', '<div></div>'],
    ['a link', '<a href="#">x</a>'],
  ])('is false for %s', (_label, html) => {
    expect(isTypingTarget(element(html))).toBe(false)
  })

  it('counts a checkbox, which takes no text', () => {
    // Every input matches, rather than the selector enumerating which types accept text. The cost
    // is a small dead spot for the shortcut over a checkbox, which is cheaper than a list that
    // would need revisiting for every input type.
    expect(isTypingTarget(element('<input type="checkbox" />'))).toBe(true)
  })

  it('is false for an element explicitly marked not editable', () => {
    // CodeMirror sets this on its widget decorations, inside an editor that is itself editable.
    expect(isTypingTarget(element('<div contenteditable="false"></div>'))).toBe(false)
  })

  it('walks up to an editable ancestor', () => {
    // A keydown in CodeMirror is dispatched at the line span, not at the editable container.
    const editor = element('<div class="cm-content" contenteditable="true"><span>x</span></div>')
    expect(isTypingTarget(editor.firstElementChild)).toBe(true)
  })

  it('is false for a target that is not an element', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(window)).toBe(false)
    expect(isTypingTarget(document)).toBe(false)
  })
})
