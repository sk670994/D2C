"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthMode = "signin" | "signup";
type Step = "email" | "otp";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function EmailAuthForm({ nextPath = "/today" }: { nextPath?: string }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [step, setStep] = useState<Step>("email");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("email");
    setOtp("");
    setMessage("");
  }

  async function sendOtp() {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setMessage("Enter your email address.");
      return;
    }

    if (mode === "signup") {
      if (!fullName.trim()) {
        setMessage("Enter your full name.");
        return;
      }
      if (!phone.trim()) {
        setMessage("Enter your phone number.");
        return;
      }
    }

    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: mode === "signup",
        },
      });

      if (error) throw error;

      setEmail(normalizedEmail);
      setOtp("");
      setStep("otp");
      setResendSeconds(RESEND_SECONDS);
      setMessage(
        `We sent a 6-digit verification code to ${normalizedEmail}. Check your inbox and spam folder.`
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Unable to send verification code."
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    const normalizedEmail = normalizeEmail(email);
    const token = otp.replace(/\D/g, "").slice(0, OTP_LENGTH);

    if (token.length !== OTP_LENGTH) {
      setMessage("Enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();
      const {
        data: { session },
        error,
      } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "email",
      });

      if (error) throw error;

      if (!session?.user) {
        throw new Error(
          "Verification succeeded but no session was created. Please try again."
        );
      }

      if (mode === "signup") {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
          },
        });
        if (metadataError) throw metadataError;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "The verification code is invalid or expired."
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "email") {
      await sendOtp();
      return;
    }
    await verifyOtp();
  }

  async function resendOtp() {
    if (resendSeconds > 0 || loading) return;
    await sendOtp();
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="auth-mode-row">
        <Button
          type="button"
          variant="ghost"
          className={`auth-mode-btn ${mode === "signin" ? "active" : ""}`}
          onClick={() => switchMode("signin")}
          disabled={loading}
        >
          Sign In
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={`auth-mode-btn ${mode === "signup" ? "active" : ""}`}
          onClick={() => switchMode("signup")}
          disabled={loading}
        >
          Sign Up
        </Button>
      </div>

      {step === "email" ? (
        <>
          {mode === "signup" ? (
            <>
              <div className="auth-field">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your full name"
                  disabled={loading}
                />
              </div>
              <div className="auth-field">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  disabled={loading}
                />
              </div>
            </>
          ) : null}

          <div className="auth-field">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@brand.com"
              disabled={loading}
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? "Sending code…" : "Send verification code"}
          </Button>

          <p className="auth-message">
            We will verify that you control this email address. No password is required.
          </p>
        </>
      ) : (
        <>
          <div className="auth-field">
            <Label htmlFor="otp">Verification Code</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={OTP_LENGTH}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
              }
              placeholder="123456"
              disabled={loading}
              autoFocus
            />
          </div>

          <Button
            type="submit"
            disabled={loading || otp.length !== OTP_LENGTH}
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </Button>

          <div className="auth-otp-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("email");
                setOtp("");
                setMessage("");
              }}
              disabled={loading}
            >
              Change email
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void resendOtp()}
              disabled={loading || resendSeconds > 0}
            >
              {resendSeconds > 0
                ? `Resend in ${resendSeconds}s`
                : "Resend code"}
            </Button>
          </div>
        </>
      )}

      {message ? <p className="auth-message">{message}</p> : null}
    </form>
  );
}
