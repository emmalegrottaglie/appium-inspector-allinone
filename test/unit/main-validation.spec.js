import {describe, expect, it} from 'vitest';

import {assertRendererSettingKey, isOpenableLink, validateServerConfig} from '../../app/electron/main/validation.js';

describe('electron/main/validation.js', function () {
  describe('#assertRendererSettingKey', function () {
    it.each(['SAVED_SESSIONS', 'PREFERRED_LANGUAGE', 'SESSION_SERVER_PARAMS'])(
      'should allow the renderer setting %s',
      function (key) {
        expect(() => assertRendererSettingKey(key)).not.toThrow();
      },
    );

    it.each(['env:appiumPath', 'env:pythonPath', 'env:anything', '["env:pythonPath"]', 'a.b', '', undefined, 1])(
      'should refuse %j, which the renderer may not touch',
      function (key) {
        expect(() => assertRendererSettingKey(key)).toThrow('Setting not available to the renderer');
      },
    );
  });

  describe('#isOpenableLink', function () {
    it('should open https links', function () {
      expect(isOpenableLink('https://appium.io/docs/')).toBe(true);
    });

    it.each([
      'http://example.com',
      'file:///C:/Windows/System32/calc.exe',
      'ms-settings:',
      'javascript:1',
      'nope',
      null,
    ])('should refuse %j', function (link) {
      expect(isOpenableLink(link)).toBe(false);
    });
  });

  describe('#validateServerConfig', function () {
    it('should return only the listening address fields', function () {
      expect(
        validateServerConfig({host: '127.0.0.1', port: '4723', basePath: '/', allowCors: false, plugins: ['x']}),
      ).toEqual({host: '127.0.0.1', port: 4723, basePath: '/'});
    });

    it.each(['localhost', '0.0.0.0', '::1', 'fe80::1', 'my-host.local'])('should accept the host %s', function (host) {
      expect(validateServerConfig({host, port: 4723, basePath: '/wd/hub'}).host).toEqual(host);
    });

    it.each([
      '--allow-insecure=*:adb_shell',
      '-h',
      '',
      'a b',
      'host;calc',
      ':',
      ':::::',
      '1.2.3:4',
      '[::1]',
      undefined,
    ])('should refuse the host %j', function (host) {
      expect(() => validateServerConfig({host, port: 4723, basePath: '/'})).toThrow('Invalid server host');
    });

    it.each([0, 65536, 1.5, 'abc', '4723 --x'])('should refuse the port %j', function (port) {
      expect(() => validateServerConfig({host: '127.0.0.1', port, basePath: '/'})).toThrow('Invalid server port');
    });

    it.each(['', 'wd/hub', '/a b', '/--x --y', '/;calc'])('should refuse the base path %j', function (basePath) {
      expect(() => validateServerConfig({host: '127.0.0.1', port: 4723, basePath})).toThrow('Invalid server base path');
    });
  });
});
