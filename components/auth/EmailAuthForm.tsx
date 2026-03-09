"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailAuthForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim()
          }
        }
      });
      if (error) throw error;
      setMessage("Sign-up successful. Check your email for verification if required, then sign in.");
      setMode("signin");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="auth-mode-row">
        <Button type="button" variant={mode === "signin" ? "default" : "ghost"} onClick={() => setMode("signin")}>Sign In</Button>
        <Button type="button" variant={mode === "signup" ? "default" : "ghost"} onClick={() => setMode("signup")}>Sign Up</Button>
      </div>

      <div className="auth-field">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brand.com" />
      </div>

      {mode === "signup" ? (
        <>
          <div className="auth-field">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="auth-field">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98XXXXXXXX"
            />
          </div>
        </>
      ) : null}

      <div className="auth-field">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" />
      </div>

      <Button type="submit" disabled={loading}>{loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}</Button>

      {message ? <p className="auth-message">{message}</p> : null}
    </form>
  );
}
