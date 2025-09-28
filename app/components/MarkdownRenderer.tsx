"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  renderCitation?: (citationMatch: RegExpExecArray) => React.ReactNode;
}

export function MarkdownRenderer({
  content,
  className,
  renderCitation
}: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Process content to handle citations - nothing to do here since we handle in components
  const processedContent = content;

  return (
    <div className={cn(
      // Professional AI chat typography with balanced spacing
      "text-[15px] leading-[1.75] text-neutral-700 dark:text-neutral-300",
      "font-sans antialiased",
      // Add consistent padding for better readability
      "space-y-4",
      className
    )} style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
      letterSpacing: '-0.008em'
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeRaw]}
        components={{
        // Treat <artifact> tags as transparent containers – actual rendering handled upstream
        artifact: ({ children }) => <>{children}</>,
        // Custom code block with copy button
        pre: ({ children, ...props }) => {
          const codeElement = React.Children.toArray(children).find(
            (child) => React.isValidElement(child) && child.type === 'code'
          ) as React.ReactElement<{ children: React.ReactNode; className?: string }> | undefined;

          const code = codeElement?.props?.children?.toString() || '';
          const language = codeElement?.props?.className?.replace('language-', '') || '';

          return (
            <div className="relative group" style={{
              marginTop: '1rem',
              marginBottom: '1rem'
            }}>
              <pre {...props} className="bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-lg overflow-x-auto text-[13px]" style={{
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
                padding: '1rem 1.25rem'
              }}>
                {children}
              </pre>
              {code && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyCode(code)}
                  className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {copiedCode === code ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              {language && (
                <div className="absolute top-2 left-4 text-xs text-neutral-500">
                  {language}
                </div>
              )}
            </div>
          );
        },
        // Inline code - Professional style
        code: ({ children, ...props }) => (
          <code {...props} className="bg-neutral-100 dark:bg-neutral-800/70 rounded-md text-[85%] text-neutral-800 dark:text-neutral-100" style={{
            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
            padding: '0.125rem 0.375rem',
            marginLeft: '0.125rem',
            marginRight: '0.125rem'
          }}>
            {children}
          </code>
        ),
        // Tables - Notion style with more spacing
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="w-full text-[14px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-neutral-200 dark:border-neutral-700">{children}</thead>
        ),
        th: ({ children, ...props }) => (
          <th {...props} className="text-left py-3 px-4 font-medium text-neutral-600 dark:text-neutral-400">{children}</th>
        ),
        tbody: ({ children }) => (
          <tbody>{children}</tbody>
        ),
        td: ({ children, ...props }) => (
          <td {...props} className="py-3 px-4 border-b border-neutral-100 dark:border-neutral-800">{children}</td>
        ),
        // Task lists (GitHub Flavored Markdown) - Notion style
        input: ({ type, checked, ...props }) => {
          if (type === 'checkbox') {
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled
                className="mr-2 rounded-sm"
                {...props}
              />
            );
          }
          return <input type={type} {...props} />;
        },
        // Blockquotes - Professional style
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-neutral-500 dark:border-neutral-400 pl-4" style={{
            borderLeftWidth: '3px',
            paddingTop: '0.75rem',
            paddingBottom: '0.75rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem',
            backgroundColor: 'rgba(0,0,0,0.02)',
            borderRadius: '0 0.375rem 0.375rem 0'
          }}>
            {children}
          </blockquote>
        ),
        // Horizontal rules - Notion style with more spacing
        hr: () => <hr className="my-6 border-t border-neutral-200 dark:border-neutral-700" />,
        // Links - Notion style
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-700 dark:text-neutral-300 underline decoration-neutral-400/50 dark:decoration-neutral-600/50 underline-offset-2 hover:decoration-neutral-600 dark:hover:decoration-neutral-400 transition-colors"
          >
            {children}
          </a>
        ),
        // Headers - Professional AI chat style with balanced spacing
        h1: ({ children }) => (
          <h1 className="text-[28px] font-bold text-neutral-900 dark:text-neutral-100" style={{
            letterSpacing: '-0.02em',
            lineHeight: '1.3',
            paddingTop: '1.5rem',
            paddingBottom: '0.75rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[22px] font-semibold text-neutral-900 dark:text-neutral-100" style={{
            letterSpacing: '-0.016em',
            lineHeight: '1.35',
            paddingTop: '1.25rem',
            paddingBottom: '0.5rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-[18px] font-semibold text-neutral-900 dark:text-neutral-100" style={{
            letterSpacing: '-0.014em',
            lineHeight: '1.4',
            paddingTop: '1rem',
            paddingBottom: '0.5rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100" style={{
            letterSpacing: '-0.012em',
            lineHeight: '1.45',
            paddingTop: '0.75rem',
            paddingBottom: '0.5rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</h4>
        ),
        h5: ({ children }) => (
          <h5 className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100" style={{
            paddingTop: '0.5rem',
            paddingBottom: '0.5rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</h5>
        ),
        h6: ({ children }) => (
          <h6 className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100" style={{
            paddingTop: '0.5rem',
            paddingBottom: '0.5rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</h6>
        ),
        // Lists - Professional style with balanced spacing
        ul: ({ children }) => (
          <ul className="ml-6 list-disc marker:text-neutral-400 dark:marker:text-neutral-600" style={{
            paddingTop: '0.25rem',
            paddingBottom: '0.25rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="ml-6 list-decimal marker:text-neutral-400 dark:marker:text-neutral-600" style={{
            paddingTop: '0.25rem',
            paddingBottom: '0.25rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>{children}</ol>
        ),
        li: ({ children }) => {
          const processChildren = (node: React.ReactNode): React.ReactNode => {
            if (typeof node === 'string') {
              // Check for citation patterns
              const citationRegex = /\{\{citation:(\d+)\}\}/g;
              const parts: React.ReactNode[] = [];
              let lastIndex = 0;
              let match;

              while ((match = citationRegex.exec(node)) !== null) {
                // Add text before citation
                if (match.index > lastIndex) {
                  parts.push(node.substring(lastIndex, match.index));
                }

                // Add citation component
                if (renderCitation) {
                  parts.push(renderCitation(match));
                }

                lastIndex = match.index + match[0].length;
              }

              // Add remaining text
              if (lastIndex < node.length) {
                parts.push(node.substring(lastIndex));
              }

              return parts.length > 0 ? parts : node;
            }

            if (Array.isArray(node)) {
              return node.map(processChildren);
            }

            if (React.isValidElement(node)) {
              const element = node as React.ReactElement<{ children?: React.ReactNode }>;
              if (element.props?.children) {
                return React.cloneElement(element, {
                  ...element.props,
                  children: processChildren(element.props.children)
                });
              }
            }

            return node;
          };

          const processed = processChildren(children);
          return (
            <li className="pl-1" style={{
              lineHeight: '1.75',
              paddingTop: '0.125rem',
              paddingBottom: '0.125rem'
            }}>
              {processed}
            </li>
          );
        },
        // Paragraphs - handle citations
        p: ({ children }) => {
          const processChildren = (node: React.ReactNode): React.ReactNode => {
            if (typeof node === 'string') {
              // Check for citation patterns
              const citationRegex = /\{\{citation:(\d+)\}\}/g;
              const parts: React.ReactNode[] = [];
              let lastIndex = 0;
              let match;

              while ((match = citationRegex.exec(node)) !== null) {
                // Add text before citation
                if (match.index > lastIndex) {
                  parts.push(node.substring(lastIndex, match.index));
                }

                // Add citation component
                if (renderCitation) {
                  parts.push(renderCitation(match));
                }

                lastIndex = match.index + match[0].length;
              }

              // Add remaining text
              if (lastIndex < node.length) {
                parts.push(node.substring(lastIndex));
              }

              return parts.length > 0 ? parts : node;
            }

            if (Array.isArray(node)) {
              return node.map(processChildren);
            }

            if (React.isValidElement(node)) {
              const element = node as React.ReactElement<{ children?: React.ReactNode }>;
              if (element.props?.children) {
                return React.cloneElement(element, {
                  ...element.props,
                  children: processChildren(element.props.children)
                });
              }
            }

            return node;
          };

          const processed = processChildren(children);
          return (
            <p className="py-1" style={{
              lineHeight: '1.75',
              marginTop: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              {processed}
            </p>
          );
        },
        // Strong/Bold - Notion style
        strong: ({ children }) => (
          <strong className="font-semibold text-neutral-900 dark:text-neutral-100">{children}</strong>
        ),
        // Emphasis/Italic
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
      }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
