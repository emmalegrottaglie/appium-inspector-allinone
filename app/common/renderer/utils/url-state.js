import {SERVER_TYPES} from '../constants/session-builder.js';
import {isPlainObject} from './common.js';
import {areSessionCapsValid} from './sessionfile-parsing.js';

// Server types a URL may select, and the fields it may set on them. Cloud-vendor slices are
// excluded: they hold the saved credentials, and letting a link change only a vendor's host
// (or the advanced proxy) would send those credentials to a server the link chose.
const URL_SERVER_TYPES = [SERVER_TYPES.LOCAL, SERVER_TYPES.REMOTE];
const URL_SERVER_FIELDS = {hostname: 'string', port: ['string', 'number'], path: 'string', ssl: 'boolean'};

const hasFieldType = (field, value) => [URL_SERVER_FIELDS[field]].flat().includes(typeof value);

/**
 * Reduces session builder state supplied through the `?state=` query parameter to the parts a
 * link may safely set: capabilities, a session id to attach to, and a local or remote server.
 *
 * @param {unknown} state parsed `state` query parameter
 * @returns {{state: object, dropped: string[]}} the allowed state and the paths of everything
 * removed
 */
export function sanitizeUrlState(state) {
  const allowed = {};
  const dropped = [];
  if (!isPlainObject(state)) {
    return {state: allowed, dropped: ['(state is not an object)']};
  }

  for (const [key, value] of Object.entries(state)) {
    if (key === 'caps' && areSessionCapsValid({caps: value})) {
      allowed.caps = value;
    } else if (key === 'attachSessId' && typeof value === 'string') {
      allowed.attachSessId = value;
    } else if (key === 'serverType' && URL_SERVER_TYPES.includes(value)) {
      allowed.serverType = value;
    } else if (key === 'server' && isPlainObject(value)) {
      for (const [serverType, config] of Object.entries(value)) {
        if (!URL_SERVER_TYPES.includes(serverType) || !isPlainObject(config)) {
          dropped.push(`server.${serverType}`);
          continue;
        }
        for (const [field, fieldValue] of Object.entries(config)) {
          if (field in URL_SERVER_FIELDS && hasFieldType(field, fieldValue)) {
            allowed.server ??= {};
            allowed.server[serverType] ??= {};
            allowed.server[serverType][field] = fieldValue;
          } else {
            dropped.push(`server.${serverType}.${field}`);
          }
        }
      }
    } else {
      dropped.push(key);
    }
  }

  return {state: allowed, dropped};
}
