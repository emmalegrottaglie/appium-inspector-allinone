import {createContext} from 'react';

/**
 * Lets panels inside the workspace switch areas, e.g. the session builder's "Local server"
 * tab opening the Server area. Null outside the workspace (browser build).
 * @type {import('react').Context<{openArea: (key: string) => void} | null>}
 */
export const WorkspaceContext = createContext(null);
