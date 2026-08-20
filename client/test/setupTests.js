/* This file is automatically executed before running tests
 * https://create-react-app.dev/docs/running-tests/#initializing-test-environment
 */

// React Router uses the Web Encoding API during module initialization. Node
// exposes the compatible implementation from `node:util`, but JSDOM does not
// install it on the global object for this Jest environment.
import { TextDecoder, TextEncoder } from 'node:util';

if (!globalThis.TextEncoder) {
  Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
}
if (!globalThis.TextDecoder) {
  Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
}

// react-testing-library renders your components to document.body,
// this adds jest-dom's custom assertions
// https://github.com/testing-library/jest-dom#table-of-contents
import '@testing-library/jest-dom';

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';

// Mock canvas when run unit test cases with jest.
// 'react-lottie' uses canvas
import 'jest-canvas-mock';

// JSDOM does not implement CSS.supports, which Ariakit uses when mounting menus.
const css = window.CSS ?? {};
if (typeof css.supports !== 'function') {
  css.supports = () => false;
}
Object.defineProperty(window, 'CSS', {
  configurable: true,
  writable: true,
  value: css,
});
// Mock ResizeObserver
import './resizeObserver.mock';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => {
      const i18n = require('~/locales/i18n').default;
      return {
        t: (key, options) => i18n.t(key, options),
        i18n: {
          ...i18n,
          changeLanguage: jest.fn(),
        },
      };
    },
    initReactI18next: {
      type: '3rdParty',
      init: jest.fn(),
    },
  };
});
