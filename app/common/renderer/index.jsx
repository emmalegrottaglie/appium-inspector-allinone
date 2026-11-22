import './i18next.js';
import {Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {Provider} from 'react-redux';
import {MemoryRouter, Route, Routes} from 'react-router';

import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx';
import SessionBuilderPage from './components/SessionBuilder/SessionBuilder.jsx';
import SessionInspectorPage from './components/SessionInspector/SessionInspector.jsx';
import Spinner from './components/Spinner/Spinner.jsx';
import Workspace from './components/Workspace/Workspace.jsx';
import {ThemeProvider} from './providers/ThemeProvider.jsx';
import store from './store.js';

const container = document.getElementById('root');

createRoot(container).render(
  <ErrorBoundary>
    <Provider store={store}>
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Suspense fallback={<Spinner />}>
            <Routes>
              {/* The workspace stays mounted across these routes, so its Server and Tests areas
                  (and a test run or server log in them) carry on while a session is open */}
              <Route element={<Workspace />}>
                <Route path="/" element={<SessionBuilderPage />} />
                <Route path="/session" element={<SessionBuilderPage />} />
                <Route path="/inspector" element={<SessionInspectorPage />} />
              </Route>
            </Routes>
          </Suspense>
        </MemoryRouter>
      </ThemeProvider>
    </Provider>
  </ErrorBoundary>,
);
