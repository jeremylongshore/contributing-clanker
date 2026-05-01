'use client';

import { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Copy, Check, ExternalLink, Code, TestTube, GitBranch, FileText } from 'lucide-react';

interface GuidelinesViewerProps {
  repo: string;
  content?: string;
  aiSummary?: {
    commitStyle?: string;
    codeStyle?: string;
    testsRequired?: boolean;
    prFormat?: string;
    claRequired?: boolean;
    additionalNotes?: string[];
  };
  loading?: boolean;
}

interface JumpLink {
  id: string;
  label: string;
  icon: typeof Code;
}

const defaultJumpLinks: JumpLink[] = [
  { id: 'setup', label: 'Setup', icon: Code },
  { id: 'style', label: 'Style', icon: FileText },
  { id: 'tests', label: 'Tests', icon: TestTube },
  { id: 'pr-format', label: 'PR Format', icon: GitBranch },
];

export function GuidelinesViewer({ repo, content, aiSummary, loading }: GuidelinesViewerProps) {
  const [showFullDoc, setShowFullDoc] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Extract code blocks from content
  const codeBlocks = content?.match(/```[\s\S]*?```/g) || [];

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <FileText className="h-5 w-5" />
          CONTRIBUTING.md
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{repo}</p>
      </div>

      {/* Jump Links */}
      <div className="flex flex-wrap gap-2">
        {defaultJumpLinks.map((link) => (
          <button
            key={link.id}
            onClick={() => {
              const element = document.getElementById(link.id);
              element?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </button>
        ))}
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="rounded-xl bg-primary-50 p-4 dark:bg-primary-900/20">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-700 dark:text-primary-300">
            <Bot className="h-4 w-4" />
            AI Quick Summary
          </div>
          <ul className="space-y-1.5 text-sm text-primary-800 dark:text-primary-200">
            {aiSummary.commitStyle && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{aiSummary.commitStyle}</span>
              </li>
            )}
            {aiSummary.codeStyle && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{aiSummary.codeStyle}</span>
              </li>
            )}
            {aiSummary.testsRequired !== undefined && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>Tests {aiSummary.testsRequired ? 'required' : 'optional'} for bug fixes</span>
              </li>
            )}
            {aiSummary.prFormat && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{aiSummary.prFormat}</span>
              </li>
            )}
            {aiSummary.claRequired !== undefined && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{aiSummary.claRequired ? 'CLA required' : 'No CLA required'}</span>
              </li>
            )}
            {aiSummary.additionalNotes?.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full Document Toggle */}
      <button
        onClick={() => setShowFullDoc(!showFullDoc)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left dark:border-gray-700 dark:bg-gray-800"
      >
        <span className="font-medium text-gray-900 dark:text-white">
          {showFullDoc ? 'Hide' : 'Show'} Full Document
        </span>
        {showFullDoc ? (
          <ChevronUp className="h-5 w-5 text-gray-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-500" />
        )}
      </button>

      {/* Document Content */}
      {showFullDoc && content && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {/* Simple markdown rendering - in production, use a proper markdown renderer */}
            <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {content.split('```').map((block, i) => {
                if (i % 2 === 1) {
                  // Code block
                  const [lang, ...codeLines] = block.split('\n');
                  const code = codeLines.join('\n').trim();
                  const blockId = `code-${i}`;
                  return (
                    <div key={i} className="relative my-3">
                      <div className="flex items-center justify-between rounded-t-lg bg-gray-100 px-3 py-1.5 dark:bg-gray-700">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {lang || 'code'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(code, blockId);
                          }}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {copiedId === blockId ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="overflow-x-auto rounded-b-lg bg-gray-900 p-3 text-sm text-gray-100">
                        <code>{code}</code>
                      </pre>
                    </div>
                  );
                }
                return <span key={i}>{block}</span>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* External Link */}
      <a
        href={`https://github.com/${repo}/blob/main/CONTRIBUTING.md`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        View on GitHub
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
