import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { API, api, post } from "./api";
import type { Profile } from "./types";
import "./auth.css";

export default function AuthPage({
  mode,
  onSignedIn,
  initialError,
}: {
  mode: string;
  onSignedIn: (p: Profile) => Promise<void>;
  initialError?: string;
}) {
  const [step, setStep] = useState<"register" | "login">("register");
  const [connectionMode, setConnectionMode] = useState(mode);
  const [error, setError] = useState(initialError || "");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => setConnectionMode(mode), [mode]);
  useEffect(() => {
    if (step === "login" && success) passwordInput.current?.focus();
  }, [step, success]);

  function changeStep(next: "register" | "login") {
    setStep(next);
    setError("");
    setSuccess("");
    setPassword("");
    setShowPassword(false);
  }

  async function retryConnection() {
    setRetrying(true);
    setError("");
    try {
      const config = await api<{ mode: string }>("/config");
      setConnectionMode(config.mode);
    } catch {
      setConnectionMode("disconnected");
      setError("We still can’t reach NEXORA. Please try again shortly.");
    } finally {
      setRetrying(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const result = await post("/auth/" + step, {
        email: email.trim(),
        password,
        ...(step === "register" ? { username: username.trim() } : {}),
      });
      if (step === "register") {
        setStep("login");
        setPassword("");
        setShowPassword(false);
        setSuccess(
          result.confirmation
            ? "Account created. Confirm your email, then log in below."
            : "Your account is ready. Log in below to join your people.",
        );
      } else {
        await onSignedIn(result.user);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      if (
        /fetch|network|server is not connected|failed to load/i.test(message)
      ) {
        setConnectionMode("disconnected");
        setError(
          "We can’t connect to NEXORA right now. Check your connection and try again.",
        );
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="nx-auth">
      <div className="nx-auth-pattern" aria-hidden="true">
        <span className="nx-auth-shape nx-auth-shape-one" />
        <span className="nx-auth-shape nx-auth-shape-two" />
        <span className="nx-auth-shape nx-auth-shape-three" />
      </div>
      <a className="nx-auth-brand" href="/" aria-label="NEXORA home">
        <img src="/nexora.svg" alt="" width="36" height="36" />
        <span>NEXORA</span>
      </a>
      <section className="nx-auth-card" aria-labelledby="nx-auth-title">
        <header className="nx-auth-heading">
          <div className="nx-auth-mobile-brand" aria-hidden="true">
            <img src="/nexora.svg" alt="" width="40" height="40" />
          </div>
          <h1 id="nx-auth-title">
            {step === "register" ? "Create an account" : "Welcome back!"}
          </h1>
          <p>
            {step === "register"
              ? "Your next great conversation starts here."
              : "We’re glad you’re here. Let’s get you connected."}
          </p>
        </header>
        <div className="nx-auth-steps" aria-label="Account setup steps">
          <span className={step === "register" ? "current" : "complete"}>
            <i>{step === "login" ? <Check size={12} /> : "1"}</i>Create account
          </span>
          <ArrowRight size={13} aria-hidden="true" />
          <span className={step === "login" ? "current" : ""}>
            <i>2</i>Log in
          </span>
        </div>
        {connectionMode === "disconnected" && (
          <div className="nx-auth-offline" role="status">
            <WifiOff size={19} aria-hidden="true" />
            <div>
              <strong>NEXORA is not connected</strong>
              <p>
                Accounts are unavailable right now. The site’s account service
                needs to be online before you can sign up or log in.
              </p>
              <a className="nx-auth-preview" href="/?preview=1">
                Preview interface <ArrowRight size={14} />
              </a>
              <button
                type="button"
                onClick={() => void retryConnection()}
                disabled={retrying}
              >
                <RefreshCw size={14} className={retrying ? "nx-spin" : ""} />
                {retrying ? "Checking connection…" : "Try again"}
              </button>
            </div>
          </div>
        )}
        {success && (
          <div className="nx-auth-success" role="status">
            <Check size={18} aria-hidden="true" />
            <span>{success}</span>
          </div>
        )}
        <form className="nx-auth-form" onSubmit={submit} aria-busy={busy}>
          <div className="nx-auth-field">
            <label htmlFor="nx-auth-email">
              Email address <span aria-hidden="true">*</span>
            </label>
            <input
              id="nx-auth-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
            />
          </div>
          {step === "register" && (
            <div className="nx-auth-field">
              <label htmlFor="nx-auth-username">
                Username <span aria-hidden="true">*</span>
              </label>
              <input
                id="nx-auth-username"
                name="username"
                placeholder="What should we call you?"
                pattern="[a-z0-9_]{3,24}"
                minLength={3}
                maxLength={24}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                aria-describedby="nx-username-help"
                required
              />
              <small id="nx-username-help">
                3–24 lowercase letters, numbers, or underscores.
              </small>
            </div>
          )}
          <div className="nx-auth-field">
            <label htmlFor="nx-auth-password">
              Password <span aria-hidden="true">*</span>
            </label>
            <div className="nx-auth-password">
              <input
                ref={passwordInput}
                id="nx-auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder={
                  step === "register"
                    ? "At least 10 characters"
                    : "Enter your password"
                }
                minLength={step === "register" ? 10 : 1}
                maxLength={128}
                autoComplete={
                  step === "register" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>
          {error && (
            <div className="nx-auth-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="nx-auth-submit"
            type="submit"
            disabled={
              busy ||
              connectionMode === "loading" ||
              connectionMode === "disconnected"
            }
          >
            {busy || connectionMode === "loading" ? (
              <LoaderCircle size={18} className="nx-spin" />
            ) : null}
            {busy
              ? "Please wait…"
              : connectionMode === "loading"
                ? "Connecting…"
                : step === "register"
                  ? "Create account"
                  : "Log in"}
          </button>
        </form>
        <div className="nx-auth-divider">
          <span />
          or
          <span />
        </div>
        <button
          className="nx-auth-google"
          type="button"
          disabled={connectionMode !== "supabase" || busy}
          aria-describedby={
            connectionMode !== "supabase" ? "nx-google-unavailable" : undefined
          }
          onClick={() => location.assign(API + "/api/auth/google")}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4c-.2 1.3-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.5z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 5-1 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H3v2.6C4.7 19.7 8.1 22 12 22z"
            />
            <path
              fill="#FBBC05"
              d="M6.3 13.8a6 6 0 0 1 0-3.6V7.6H3a10 10 0 0 0 0 8.8z"
            />
            <path
              fill="#EA4335"
              d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.6l3.3 2.6C7.1 7.8 9.4 6 12 6z"
            />
          </svg>
          Continue with Google
        </button>
        {connectionMode !== "supabase" && connectionMode !== "loading" && (
          <p id="nx-google-unavailable" className="nx-auth-provider-note">
            Google sign-in hasn’t been enabled for this site yet.
          </p>
        )}
        <p className="nx-auth-switch">
          {step === "register"
            ? "Already have an account?"
            : "Need an account?"}
          <button
            type="button"
            onClick={() =>
              changeStep(step === "register" ? "login" : "register")
            }
            disabled={busy}
          >
            {step === "register" ? "Log in" : "Register"}
          </button>
        </p>
        <div className="nx-auth-privacy">
          <ShieldCheck size={14} />
          Your account. Your conversations. Your space.
        </div>
        {connectionMode === "local" && (
          <p className="nx-auth-local">
            Local version · email accounts are saved on this server.
          </p>
        )}
      </section>
      <footer className="nx-auth-footer">A place for your people.</footer>
    </main>
  );
}
