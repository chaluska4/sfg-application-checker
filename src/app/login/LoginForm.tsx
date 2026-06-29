"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SfgLogo } from "@/components/SfgLogo";
import { Loader2, Lock } from "lucide-react";
import { isSignInButtonDisabled } from "./login-form-utils";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Invalid credentials.");
        setPassword("");
        return;
      }

      const from = searchParams.get("from");
      const destination =
        from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Invalid credentials.");
      setPassword("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <div className="h-[3px] bg-red-accent" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
            <div className="flex justify-center">
              <SfgLogo size="md" />
            </div>

            <p className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-label">
              Secure Internal Access
            </p>

            <h1 className="mt-3 text-center font-serif text-2xl text-navy">
              Sign In to <span className="text-gold">Application Checker</span>
            </h1>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-navy"
                >
                  Access Password
                </label>
                <div className="relative mt-2">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-navy outline-none transition-colors focus:border-gold focus:bg-white focus:ring-2 focus:ring-gold/20 disabled:opacity-60"
                    placeholder="Enter your access password"
                  />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-accent/30 bg-red-light px-4 py-3 text-center text-sm text-red-accent"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSignInButtonDisabled(password, isLoading)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-navy py-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing In…
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            <p className="mt-6 rounded-xl bg-navy/[0.04] px-4 py-3 text-center text-xs leading-relaxed text-gray-600">
              Authorized SFG users only. Do not upload sensitive client data unless
              approved access controls are enabled.
            </p>
          </div>
        </div>
      </main>

      <footer className="px-4 py-6">
        <p className="text-center text-sm text-white/70">
          SFG Annuity Advisors — Secure Internal Access
        </p>
      </footer>
    </div>
  );
}
