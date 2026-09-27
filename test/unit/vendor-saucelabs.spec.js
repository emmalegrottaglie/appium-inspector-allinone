import {describe, expect, it, vi} from 'vitest';

import {SaucelabsVendor} from '../../app/common/renderer/lib/vendor/saucelabs.ts';

vi.mock('../../app/common/renderer/i18next.js', () => ({default: {t: (key) => key}}));

const configure = async (sauce) =>
  await new SaucelabsVendor({sauce: {username: 'user', accessKey: 'key', ...sauce}}, {}).apply();

describe('SaucelabsVendor', function () {
  it('should use HTTPS for the ondemand endpoint, since the first request carries the credentials', async function () {
    expect(await configure({dataCenter: 'eu-central-1'})).toMatchObject({
      host: 'ondemand.eu-central-1.saucelabs.com',
      port: 443,
      https: true,
      path: '/wd/hub',
    });
  });

  it.each(['us-west-1', 'us-east-4', 'eu-central-1'])('should accept the %s data center', async function (dataCenter) {
    expect((await configure({dataCenter})).host).toEqual(`ondemand.${dataCenter}.saucelabs.com`);
  });

  it.each(['evil.example/', 'us-west-1.evil.example#', '', undefined])(
    'should refuse the data center %j, which would put another host in the URL',
    async function (dataCenter) {
      await expect(configure({dataCenter})).rejects.toThrow('Unsupported Sauce Labs data center:');
    },
  );

  it('should keep plain HTTP for the local Sauce Connect proxy', async function () {
    expect(await configure({useSCProxy: true, scHost: 'localhost', scPort: '4445'})).toMatchObject({
      host: 'localhost',
      port: 4445,
      https: false,
    });
  });

  it('should ask before sending the credentials to a proxy on another host', async function () {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('window', {confirm});
    try {
      await expect(configure({useSCProxy: true, scHost: 'attacker.example', scPort: 80})).rejects.toThrow(
        'Sauce Labs credentials were not sent to: attacker.example',
      );
      expect(confirm).toHaveBeenCalledOnce();
      confirm.mockReturnValue(true);
      expect((await configure({useSCProxy: true, scHost: 'sc-proxy.corp', scPort: 4445})).host).toEqual(
        'sc-proxy.corp',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
