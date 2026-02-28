"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { getStoredUser, apiGetSetupStatus } from "@/lib/api";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  // Form fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Check if setup is needed first
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await apiGetSetupStatus();
        if (res.data?.needsSetup) {
          router.push("/setup");
          return;
        }
      } catch {
        // Backend might be down — let them try to login anyway
      }
      setCheckingSetup(false);
    }
    checkSetup();
  }, [router]);

  // Redirect if already logged in
  useEffect(() => {
    if (user || getStoredUser()) {
      router.push("/dashboard");
    }
  }, [user, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier || !password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-blue-600 to-green-500">
        <div className="text-white text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-blue-600 to-green-500">
      <div className="w-full max-w-md px-5">
        <div className="bg-white rounded-xl p-10 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-7">
            <h1 className="text-3xl font-bold text-gray-900">🌊 Pond Finder</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Sign in to continue
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Username or Email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter username or email"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Error display */}
          {error && (
            <div className="mt-4 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          <p className="text-center mt-5 text-xs text-gray-400">
            Contact your administrator if you need an account
          </p>
        </div>
      </div>
    </div>
  );
}
