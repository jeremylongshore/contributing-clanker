'use client';

import { useState } from 'react';
import {
  User,
  Bell,
  Shield,
  Palette,
  Github,
  Mail,
  Smartphone,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({
    email: true,
    slack: false,
    browser: true,
  });
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    count?: number;
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'manual-import');

      const res = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.error) {
        setImportResult({ success: false, message: data.error });
      } else {
        setImportResult({
          success: true,
          message: `Successfully imported ${data.imported} bounties`,
          count: data.imported
        });
      }
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Import failed'
      });
    } finally {
      setImporting(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const downloadTemplate = () => {
    window.location.href = '/api/import/csv';
  };

  return (
    <>
      <Header title="Settings" />

      <div className="p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Profile Section */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <User className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Profile
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="h-16 w-16 rounded-full"
                  />
                ) : (
                  <User className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {user?.displayName || 'Anonymous'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Signed in via {user?.providerData[0]?.providerId || 'unknown'}
              </p>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <Bell className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Notifications
              </h2>
            </div>

            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Email Notifications
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Receive updates via email
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.email}
                  onChange={(e) =>
                    setNotifications({ ...notifications, email: e.target.checked })
                  }
                  className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Browser Notifications
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Push notifications in browser
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.browser}
                  onChange={(e) =>
                    setNotifications({ ...notifications, browser: e.target.checked })
                  }
                  className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.312z"/>
                  </svg>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Slack Notifications
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Receive updates in Slack
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.slack}
                  onChange={(e) =>
                    setNotifications({ ...notifications, slack: e.target.checked })
                  }
                  className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            </div>
          </div>

          {/* Appearance Section */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <Palette className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Appearance
              </h2>
            </div>

            <div className="flex gap-4">
              {(['light', 'dark', 'system'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTheme(option)}
                  className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                    theme === option
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Connected Accounts Section */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <Shield className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Connected Accounts
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Github className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      GitHub
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Used for PR tracking and authentication
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Connected
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Google
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Used for authentication
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Connected
                </span>
              </div>
            </div>
          </div>

          {/* Data Import Section */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <div className="mb-4 flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Data Import
              </h2>
            </div>

            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Import bounties from CSV files. Useful for tracking bounties from platforms
              without API integration.
            </p>

            <div className="space-y-4">
              {/* Template Download */}
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
                Download CSV Template
              </button>

              {/* File Upload */}
              <div className="relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  disabled={importing}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
                    importing
                      ? 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700'
                      : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50 dark:border-gray-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20'
                  }`}
                >
                  {importing ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                      <span className="text-gray-500 dark:text-gray-400">Importing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-300">
                        Click to upload CSV file
                      </span>
                    </>
                  )}
                </label>
              </div>

              {/* Import Result */}
              {importResult && (
                <div
                  className={`flex items-center gap-3 rounded-lg p-4 ${
                    importResult.success
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                  }`}
                >
                  {importResult.success ? (
                    <CheckCircle className="h-5 w-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  )}
                  {importResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border-2 border-red-200 bg-white p-6 dark:border-red-900 dark:bg-gray-800">
            <h2 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">
              Danger Zone
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Irreversible actions. Proceed with caution.
            </p>
            <button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
