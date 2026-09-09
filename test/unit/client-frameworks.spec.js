import {describe, expect, it} from 'vitest';

import JsOxygenFramework from '../../app/common/renderer/lib/client-frameworks/js-oxygen.js';
import JsWdIoFramework from '../../app/common/renderer/lib/client-frameworks/js-wdio.js';

const SERVER_URL = 'http://127.0.0.1:4723/';
const SERVER_URL_PARTS = {protocol: 'http', host: '127.0.0.1', port: 4723, path: '/'};
const CAPS = {platformName: 'Android', 'appium:automationName': 'UiAutomator2'};

const newFramework = (Framework) => new Framework(SERVER_URL, SERVER_URL_PARTS, CAPS);

describe('client-frameworks', function () {
  describe('js-wdio', function () {
    describe('#codeFor_executeScriptNoArgs', function () {
      it('should pass an args array, which WebdriverIO requires', function () {
        // A single-argument call is rejected at runtime with "Wrong parameters
        // applied for executeScript", which aborts the whole generated test.
        expect(newFramework(JsWdIoFramework).codeFor_executeScriptNoArgs('mobile: getDeviceTime')).toEqual(
          'await driver.executeScript("mobile: getDeviceTime", []);',
        );
      });
    });

    describe('#wrapWithBoilerplate', function () {
      const boilerplate = () => newFramework(JsWdIoFramework).wrapWithBoilerplate('await driver.pause(1);');

      it('should exit non-zero when the test throws', function () {
        // Ruby/JS runs have no JUnit report, so the Tests panel derives pass/fail
        // from the exit code. Swallowing the error (the previous
        // `main().catch(console.log)`) reported a failing test as PASSED.
        expect(boilerplate()).toContain('process.exitCode = 1');
        expect(boilerplate()).not.toContain('main().catch(console.log)');
      });

      it('should end the session even when the test throws', function () {
        const code = boilerplate();
        expect(code).toContain('try {');
        expect(code).toContain('} finally {');
        expect(code.indexOf('} finally {')).toBeLessThan(code.indexOf('deleteSession'));
      });

      it('should not let a teardown failure mask the test failure', function () {
        expect(boilerplate()).toContain("console.error('deleteSession failed:', err)");
      });

      it('should place the test body inside the try block', function () {
        expect(boilerplate()).toContain('    await driver.pause(1);');
      });
    });
  });

  describe('js-oxygen', function () {
    describe('#codeFor_executeScriptNoArgs', function () {
      it('should pass an args array, since getDriver() exposes the wdio driver', function () {
        expect(newFramework(JsOxygenFramework).codeFor_executeScriptNoArgs('mobile: getDeviceTime')).toEqual(
          'mob.getDriver().executeScript("mobile: getDeviceTime", []);',
        );
      });
    });
  });
});
