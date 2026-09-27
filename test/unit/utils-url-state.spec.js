import {describe, expect, it} from 'vitest';

import {sanitizeUrlState} from '../../app/common/renderer/utils/url-state.js';

const CAPS = [{type: 'text', name: 'platformName', value: 'Android'}];

describe('utils/url-state.js', function () {
  describe('#sanitizeUrlState', function () {
    it('should keep capabilities and a session id to attach to without changing the server', function () {
      expect(sanitizeUrlState({caps: CAPS, attachSessId: 'abc'})).toEqual({
        state: {caps: CAPS, attachSessId: 'abc'},
        dropped: [],
      });
    });

    it('should keep a remote server and report that it changes the server', function () {
      const server = {remote: {hostname: 'grid.example', port: 4444, path: '/wd/hub', ssl: true}};
      expect(sanitizeUrlState({serverType: 'remote', server})).toEqual({
        state: {serverType: 'remote', server},
        dropped: [],
      });
    });

    it('should drop vendor slices, whose saved credentials a changed host would receive', function () {
      const {state, dropped} = sanitizeUrlState({
        serverType: 'pcloudy',
        server: {pcloudy: {hostname: 'attacker.example'}, sauce: {dataCenter: 'x'}},
      });
      expect(state).toEqual({});
      expect(dropped).toEqual(['serverType', 'server.pcloudy', 'server.sauce']);
    });

    it('should drop the advanced server options, which can proxy vendor traffic', function () {
      const {state, dropped} = sanitizeUrlState({server: {advanced: {proxy: 'http://attacker.example'}}});
      expect(state).toEqual({});
      expect(dropped).toEqual(['server.advanced']);
    });

    it('should drop unknown and mistyped server fields', function () {
      const {state, dropped} = sanitizeUrlState({
        server: {remote: {hostname: 'grid.example', headers: {a: 'b'}, ssl: 'yes'}},
      });
      expect(state).toEqual({server: {remote: {hostname: 'grid.example'}}});
      expect(dropped).toEqual(['server.remote.headers', 'server.remote.ssl']);
    });

    it('should drop invalid capabilities and unrelated builder state', function () {
      const {state, dropped} = sanitizeUrlState({caps: [{name: 'x'}], visibleProviders: ['sauce']});
      expect(state).toEqual({});
      expect(dropped).toEqual(['caps', 'visibleProviders']);
    });

    it.each([null, [], 'state', 1])('should ignore a state of %j', function (state) {
      expect(sanitizeUrlState(state).state).toEqual({});
    });
  });
});
