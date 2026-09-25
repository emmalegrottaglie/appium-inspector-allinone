import {describe, expect, it} from 'vitest';

import DotNetNUnitFramework from '../../app/common/renderer/lib/client-frameworks/dotnet-nunit.js';
import JavaJUnit5Framework from '../../app/common/renderer/lib/client-frameworks/java-junit5.js';
import JsOxygenFramework from '../../app/common/renderer/lib/client-frameworks/js-oxygen.js';
import JsWdIoFramework from '../../app/common/renderer/lib/client-frameworks/js-wdio.js';
import PythonFramework from '../../app/common/renderer/lib/client-frameworks/python.js';
import RobotFramework from '../../app/common/renderer/lib/client-frameworks/robot.js';
import RubyFramework from '../../app/common/renderer/lib/client-frameworks/ruby.js';

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

      it('should fail the run when only teardown fails', function () {
        // The teardown catch must not swallow the failure outright: a body that
        // passed still has to report FAILED if the session could not be ended,
        // otherwise the badge shows PASSED beside a teardown stack trace.
        // Slice out just the teardown handler: the outer main().catch sets an exit
        // code too, so an unbounded slice would pass with the teardown one removed.
        const teardownCatch = boilerplate().split('deleteSession().catch')[1].split('main().catch')[0];
        expect(teardownCatch).toContain('process.exitCode = 1');
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

  // Locators, typed text and context names come from the app under test or the Appium server,
  // so generated code must treat them as data. Each language's real interpreter was used to
  // confirm these literals evaluate back to the original value.
  describe('escaping of interpolated values', function () {
    const LINE_SEPARATOR = String.fromCharCode(0x2028);

    describe('common #quote', function () {
      const fw = () => newFramework(PythonFramework);

      it('should escape quotes, backslashes and line breaks like JSON', function () {
        expect(fw().quote('a"b\\c\nd')).toEqual('"a\\"b\\\\c\\nd"');
      });

      it('should escape the line terminators JSON leaves raw', function () {
        expect(fw().quote(`a${LINE_SEPARATOR}b`)).toEqual('"a\\u2028b"');
      });

      it('should keep an unsupported locator on the comment line', function () {
        const code = fw().handleUnsupportedLocatorStrategy('css selector', 'x\nimport os');
        expect(code.split('\n')).toHaveLength(1);
        expect(code.startsWith('# ')).toBe(true);
      });
    });

    describe('ruby', function () {
      const fw = () => newFramework(RubyFramework);

      it('should emit single-quoted literals, which do not interpolate #{}', function () {
        expect(fw().rubyStr('x#{system("id")}')).toEqual(`'x#{system("id")}'`);
        expect(fw().codeFor_findAndAssign('xpath', '//a[@text="#{`id`}"]', 'el1')).toEqual(
          `el1 = driver.find_element :xpath, '//a[@text="#{\`id\`}"]'`,
        );
      });

      it('should escape single quotes and backslashes', function () {
        expect(fw().rubyStr("a'b\\")).toEqual("'a\\'b\\\\'");
      });

      it('should escape a server-supplied context name', function () {
        expect(fw().codeFor_switchAppiumContext(null, null, "x'; system('id'); '")).toEqual(
          "driver.context = 'x\\'; system(\\'id\\'); \\''",
        );
      });

      it('should render capabilities as Ruby values', function () {
        expect(fw().getRubyVal({'a-b': null, n: 1, s: '#{x}'})).toEqual("{'a-b': nil, 'n': 1, 's': '#{x}'}");
      });
    });

    describe('robot', function () {
      const fw = () => newFramework(RobotFramework);

      it.each([
        ['${{__import__("os").system("id")}}', '\\${{__import__("os").system("id")}}'],
        ['@{a} &{b} %{c}', '\\@{a} \\&{b} \\%{c}'],
        ['a  b', 'a \\ b'],
        ['locator=x', 'locator\\=x'],
        ['a\nb\tc', 'a\\nb\\tc'],
        ['# not a comment', '\\# not a comment'],
        [' padded ', '${SPACE}padded${SPACE}'],
        ['back\\slash', 'back\\\\slash'],
        [`a${LINE_SEPARATOR}b`, 'a\\u2028b'],
        ['', '${EMPTY}'],
      ])('should escape %j as one literal cell', function (value, expected) {
        expect(fw().robotArg(value)).toEqual(expected);
      });

      it('should escape the locator but keep the strategy prefix', function () {
        expect(fw().codeFor_findAndAssign('xpath', '//a[@text="${x}"]', 'el1')).toEqual(
          '${el1} =    Set Variable     xpath=//a[@text\\="\\${x}"]',
        );
      });

      it('should escape typed text and context names', function () {
        expect(fw().codeFor_elementSendKeys('el1', null, 'a    Log    x')).toEqual(
          'Input Text    ${el1}    a \\ \\ \\ Log \\ \\ \\ x',
        );
        expect(fw().codeFor_switchAppiumContext(null, null, 'WEBVIEW\n    Evaluate    1')).toEqual(
          'Switch To Context    WEBVIEW\\n \\ \\ \\ Evaluate \\ \\ \\ 1',
        );
      });
    });

    describe.each([
      ['python', () => PythonFramework, `driver.switch_to.context("x\\");evil(\\"")`],
      ['java', () => JavaJUnit5Framework, `driver.context("x\\");evil(\\"");`],
      ['dotnet', () => DotNetNUnitFramework, `_driver.Context = "x\\");evil(\\"";`],
      ['js-wdio', () => JsWdIoFramework, `await driver.switchAppiumContext("x\\");evil(\\"");`],
      ['js-oxygen', () => JsOxygenFramework, `mob.setContext("x\\");evil(\\"");`],
    ])('%s', function (_name, getFramework, expectedContextSwitch) {
      it('should escape a server-supplied context name', function () {
        expect(newFramework(getFramework()).codeFor_switchAppiumContext(null, null, 'x");evil("')).toEqual(
          expectedContextSwitch,
        );
      });

      it('should generate a full test when a capability is null', function () {
        const fw = new (getFramework())(SERVER_URL, SERVER_URL_PARTS, {...CAPS, 'appium:nullable': null});
        expect(() => fw.getCodeString(true)).not.toThrow();
      });
    });
  });
});
