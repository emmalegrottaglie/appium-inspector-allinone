import dayjs, {extend as dayjsExtend} from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat.js';

import i18n from '../../i18next.js';
import {BaseVendor} from './base.js';

dayjsExtend(localizedFormat);

const SAUCE_OPTIONS_CAP = 'sauce:options';
// The data centers offered in the Sauce Labs server tab. The value becomes part of the
// hostname, so anything else (e.g. from a crafted session file) must be refused rather than
// letting it redirect the credentialed request to another host.
const SAUCE_DATA_CENTERS = ['us-west-1', 'us-east-4', 'eu-central-1'];

export class SaucelabsVendor extends BaseVendor {
  override async configureProperties(): Promise<void> {
    const sauce = this._server.sauce;
    const vendorName = 'Sauce Labs';

    const username = (sauce.username as string | undefined) || (process.env.SAUCE_USERNAME as string | undefined);
    const accessKey = (sauce.accessKey as string | undefined) || (process.env.SAUCE_ACCESS_KEY as string | undefined);
    this._checkInputPropertyPresence(vendorName, [
      {name: 'Username', val: username},
      {name: 'Access Key', val: accessKey},
    ]);

    // The ondemand endpoints are HTTPS: the first request carries the credentials as Basic
    // auth, so it must never go over plaintext. Only the Sauce Connect proxy, a local tunnel,
    // is spoken to over HTTP.
    let host: string;
    let port: number | string;
    let https: boolean;
    if (sauce.useSCProxy) {
      host = (sauce.scHost as string | undefined) || 'localhost';
      port = parseInt(String(sauce.scPort), 10) || 4445;
      https = false;
    } else {
      const dataCenter = String(sauce.dataCenter ?? '');
      if (!SAUCE_DATA_CENTERS.includes(dataCenter)) {
        throw new Error(`${i18n.t('Unsupported Sauce Labs data center:')} ${dataCenter}`);
      }
      host = `ondemand.${dataCenter}.saucelabs.com`;
      port = 443;
      https = true;
    }
    const path = '/wd/hub';
    this._saveProperties(sauce, {host, path, port, https, username, accessKey});

    if (!(this._sessionCaps[SAUCE_OPTIONS_CAP] as {name?: unknown} | undefined)?.name) {
      const dateTime = dayjs().format('lll');
      this._updateSessionCap(SAUCE_OPTIONS_CAP, {
        name: `Appium Desktop Session -- ${dateTime}`,
      });
    }
  }
}
