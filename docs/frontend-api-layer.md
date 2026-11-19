# Frontend API requests

All application HTTP requests use `frontend/src/api/client.ts`. This owns the configured backend URL, token attachment, and expired-session handling. A permission-denied response (403) does not log the user out.

Use the existing `useFetchObjects`, `useAdd`, `useUpdate`, and `useDelete` hooks from `@/api` for standard page CRUD. Custom actions, imperative form submissions, autocomplete lookups, and print exports use the same client from `@/api/client`; their existing notifications, invalidations, and response handling stay with their callers. Do not create another Axios instance or call browser `fetch` in pages or shared components.

`lib/axios.ts` remains a compatibility re-export of this client. Login also uses this client, whose interceptors exclude authentication endpoints. File uploads retain FormData and let the browser set multipart boundaries.

Run `npm run test:api` from `frontend` to audit request boundaries and check client authentication, upload handling, and session errors using a mocked transport. This does not replace authenticated browser or backend integration tests.

The ZKTeco page still contains a demo synchronization flow, and there is no matching connection endpoint in the current backend. Its connection request uses the shared client and reports failures instead of pretending to connect.
