"use client";

import { useState, useEffect, useCallback } from "react";
import type { User, AppSettings } from "@/types";
import {
  apiGetSettings,
  apiUpdateSettings,
  apiGetApiKeys,
  apiListUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
} from "@/lib/api";

interface SettingsPanelProps {
  onClose: () => void;
  currentUserId: string;
}

type SettingsTab = "api-keys" | "users";

export default function SettingsPanel({ onClose, currentUserId }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("api-keys");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // API Keys state
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [smartyAuthId, setSmartyAuthId] = useState("");
  const [smartyAuthToken, setSmartyAuthToken] = useState("");
  const [keysLoaded, setKeysLoaded] = useState(false);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  // Load settings
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, keysRes] = await Promise.all([
        apiGetSettings(),
        apiGetApiKeys(),
      ]);

      if (keysRes.data) {
        setGoogleMapsApiKey(keysRes.data.googleMapsApiKey || "");
        setSmartyAuthId(keysRes.data.smartyAuthId || "");
        setSmartyAuthToken(keysRes.data.smartyAuthToken || "");
        setKeysLoaded(true);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load settings" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load users
  const loadUsers = useCallback(async () => {
    try {
      const res = await apiListUsers();
      if (res.data) {
        setUsers(res.data);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load users" });
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, [loadSettings, loadUsers]);

  // Save API keys
  async function handleSaveKeys() {
    setSaving(true);
    setMessage(null);
    try {
      await apiUpdateSettings({
        googleMapsApiKey,
        smartyAuthId,
        smartyAuthToken,
      });
      setMessage({ type: "success", text: "API keys saved successfully. Reload the page for changes to take effect." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  // Create user
  async function handleCreateUser() {
    if (!newUsername || !newEmail || !newPassword) {
      setMessage({ type: "error", text: "All fields are required" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiCreateUser({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        role: newRole,
      });
      setMessage({ type: "success", text: `User "${newUsername}" created` });
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      setShowCreateUser(false);
      await loadUsers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to create user" });
    } finally {
      setSaving(false);
    }
  }

  // Delete user
  async function handleDeleteUser(user: User) {
    if (user.id === currentUserId) {
      setMessage({ type: "error", text: "Cannot delete your own account" });
      return;
    }
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;

    try {
      await apiDeleteUser(user.id);
      setMessage({ type: "success", text: `User "${user.username}" deleted` });
      await loadUsers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete user" });
    }
  }

  // Toggle user role
  async function handleToggleRole(user: User) {
    const newRole = user.role === "admin" ? "user" : "admin";
    try {
      await apiUpdateUser(user.id, { role: newRole });
      setMessage({ type: "success", text: `Updated ${user.username} to ${newRole}` });
      await loadUsers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to update role" });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setTab("api-keys"); setMessage(null); }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === "api-keys"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🔑 API Keys
          </button>
          <button
            onClick={() => { setTab("users"); setMessage(null); }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === "users"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            👥 User Accounts
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Message bar */}
          {message && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading...
            </div>
          ) : (
            <>
              {/* API Keys Tab */}
              {tab === "api-keys" && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Google Maps API Key
                    </label>
                    <input
                      type="text"
                      value={googleMapsApiKey}
                      onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Required for the map. Enable Maps JavaScript API, Drawing, Geometry, and Places libraries.
                    </p>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Smarty API (Property Owner Lookups)
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Auth ID
                        </label>
                        <input
                          type="text"
                          value={smartyAuthId}
                          onChange={(e) => setSmartyAuthId(e.target.value)}
                          placeholder="Smarty Auth ID"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Auth Token
                        </label>
                        <input
                          type="password"
                          value={smartyAuthToken}
                          onChange={(e) => setSmartyAuthToken(e.target.value)}
                          placeholder="Smarty Auth Token"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveKeys}
                    disabled={saving}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {saving ? "Saving..." : "Save API Keys"}
                  </button>
                </div>
              )}

              {/* Users Tab */}
              {tab === "users" && (
                <div>
                  {/* Create user button */}
                  {!showCreateUser && (
                    <button
                      onClick={() => setShowCreateUser(true)}
                      className="w-full mb-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create New User
                    </button>
                  )}

                  {/* Create user form */}
                  {showCreateUser && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">New User Account</h3>
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="Username"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <input
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="Email"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Password (min 8 chars, include a number)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCreateUser(false)}
                            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateUser}
                            disabled={saving}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
                          >
                            {saving ? "Creating..." : "Create User"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Users list */}
                  <div className="space-y-2">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{u.username}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                u.role === "admin"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {u.role}
                            </span>
                            {u.id === currentUserId && (
                              <span className="text-xs text-gray-400">(you)</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                        </div>
                        {u.id !== currentUserId && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleRole(u)}
                              className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-100"
                              title={`Make ${u.role === "admin" ? "user" : "admin"}`}
                            >
                              {u.role === "admin" ? "Demote" : "Promote"}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="text-xs px-2 py-1 border border-red-300 rounded text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {users.length === 0 && !showCreateUser && (
                    <p className="text-center text-gray-400 text-sm py-8">No users found</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
