import styles from './ServerStatusDot.module.css';

// The managed server's statuses (see app/electron/main/appium-server.js), in display form.
// Shared by every place that shows the server's status, so they never disagree.
export const SERVER_STATUS_LABEL = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  error: 'Error',
};

/** @returns {keyof typeof SERVER_STATUS_LABEL} the state's status, 'stopped' if unknown */
export const serverStatusOf = (state) => (state?.status in SERVER_STATUS_LABEL ? state.status : 'stopped');

/** Colored dot for a server status; the status label is shown next to it by the caller */
const ServerStatusDot = ({status}) => <span className={`${styles.dot} ${styles[status] ?? ''}`} aria-hidden="true" />;

export default ServerStatusDot;
