import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { completeLoginFromCallback, ensureSignedIn } from "./auth";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

// In oidc mode: finish an IdP redirect (or re-auth popup) before rendering,
// and start the login flow if there is no session yet. No-ops in dev mode.
await completeLoginFromCallback();
await ensureSignedIn();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
