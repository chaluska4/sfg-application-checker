"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientSessionResponse } from "@/lib/client-auth";
import {
  createDevBypassAuthState,
  createUnauthenticatedAuthState,
  INITIAL_CLIENT_AUTH_STATE,
  logClientAuthDev,
  mapSessionResponseToAuthState,
  SESSION_FETCH_TIMEOUT_MS,
  type ClientAuthState,
} from "@/lib/client-auth";

export interface UseClientAuthOptions {
  /** Set by server when LOCAL_AUTH_BYPASS is active in development. */
  devBypassSession?: boolean;
}

export function useClientAuth(options?: UseClientAuthOptions): ClientAuthState {
  const devBypassSession = Boolean(options?.devBypassSession);
  const [auth, setAuth] = useState<ClientAuthState>(() =>
    devBypassSession ? createDevBypassAuthState() : INITIAL_CLIENT_AUTH_STATE
  );
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (devBypassSession) {
      logClientAuthDev("auth loading=false (server dev bypass session)");
      logClientAuthDev("session JSON", createDevBypassAuthState());
      setAuth(createDevBypassAuthState());
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      logClientAuthDev("session fetch timeout — aborting", SESSION_FETCH_TIMEOUT_MS);
      controller.abort();
    }, SESSION_FETCH_TIMEOUT_MS);

    async function loadSession() {
      logClientAuthDev("session fetch started");
      logClientAuthDev("auth loading=true");

      try {
        const response = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        logClientAuthDev("session fetch response status", response.status);

        const data = (await response.json()) as ClientSessionResponse;
        logClientAuthDev("session JSON", data);

        if (requestId !== requestIdRef.current) return;

        setAuth(mapSessionResponseToAuthState(data));
        logClientAuthDev("auth loading=false (session fetch succeeded)");
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        logClientAuthDev(
          "session fetch failed — using unauthenticated fallback",
          error instanceof Error ? error.message : error
        );
        setAuth(createUnauthenticatedAuthState());
        logClientAuthDev("auth loading=false (session fetch failed)");
      } finally {
        window.clearTimeout(timeoutId);
        if (requestId !== requestIdRef.current) return;
        setAuth((current) => (current.loading ? createUnauthenticatedAuthState() : current));
      }
    }

    void loadSession();

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      requestIdRef.current += 1;
    };
  }, [devBypassSession]);

  useEffect(() => {
    logClientAuthDev("auth loading", auth.loading);
  }, [auth.loading]);

  return auth;
}
