import { useState, useEffect } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { FileCode, SplitSquareVertical, LayoutGrid } from 'lucide-react';

interface CodeDiffViewerProps {
  oldValue: string;
  newValue: string;
  fileName?: string;
  language?: string;
}

export const CodeDiffViewer = ({
  oldValue,
  newValue,
  fileName,
  language = 'javascript',
}: CodeDiffViewerProps) => {
  const [splitView, setSplitView] = useState(true);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check for dark mode on mount and when it changes
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const customStyles = {
    variables: {
      light: {
        diffViewerBackground: '#ffffff',
        diffViewerColor: '#1f2937',
        addedBackground: '#f0fdf4',
        addedColor: '#166534',
        removedBackground: '#fef2f2',
        removedColor: '#991b1b',
        wordAddedBackground: '#bbf7d0',
        wordRemovedBackground: '#fecaca',
        addedGutterBackground: '#dcfce7',
        removedGutterBackground: '#fee2e2',
        gutterBackground: '#f9fafb',
        gutterBackgroundDark: '#f3f4f6',
        highlightBackground: '#fef3c7',
        highlightGutterBackground: '#fef3c7',
        codeFoldGutterBackground: '#f3f4f6',
        codeFoldBackground: '#f9fafb',
        emptyLineBackground: '#fafafa',
        gutterColor: '#6b7280',
        addedGutterColor: '#166534',
        removedGutterColor: '#991b1b',
        codeFoldContentColor: '#6b7280',
        diffViewerTitleBackground: '#f9fafb',
        diffViewerTitleColor: '#1f2937',
        diffViewerTitleBorderColor: '#e5e7eb',
      },
      dark: {
        diffViewerBackground: '#1f2937',
        diffViewerColor: '#f3f4f6',
        addedBackground: '#064e3b',
        addedColor: '#d1fae5',
        removedBackground: '#7f1d1d',
        removedColor: '#fecaca',
        wordAddedBackground: '#065f46',
        wordRemovedBackground: '#991b1b',
        addedGutterBackground: '#064e3b',
        removedGutterBackground: '#7f1d1d',
        gutterBackground: '#374151',
        gutterBackgroundDark: '#1f2937',
        highlightBackground: '#78350f',
        highlightGutterBackground: '#78350f',
        codeFoldGutterBackground: '#374151',
        codeFoldBackground: '#1f2937',
        emptyLineBackground: '#111827',
        gutterColor: '#9ca3af',
        addedGutterColor: '#d1fae5',
        removedGutterColor: '#fecaca',
        codeFoldContentColor: '#9ca3af',
        diffViewerTitleBackground: '#374151',
        diffViewerTitleColor: '#f3f4f6',
        diffViewerTitleBorderColor: '#4b5563',
      },
    },
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-gray-dark">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <FileCode className="h-5 w-5 text-brand-500" />
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{fileName || 'Code Diff'}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Comparing changes in {language}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSplitView(true)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              splitView
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            <SplitSquareVertical className="h-4 w-4" />
            Split
          </button>
          <button
            onClick={() => setSplitView(false)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              !splitView
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Unified
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <ReactDiffViewer
          oldValue={oldValue}
          newValue={newValue}
          splitView={splitView}
          compareMethod={DiffMethod.WORDS}
          useDarkTheme={isDark}
          styles={customStyles}
          leftTitle="Before"
          rightTitle="After"
          showDiffOnly={false}
        />
      </div>
    </div>
  );
};
