import type { Component, JSX } from "solid-js";
import { Show, createSignal } from "solid-js";
import { requestStore } from "../stores/requestStore";

const TRUNCATE_LEN = 2000;

function truncate(text: string): { value: string; truncated: boolean } {
  if (text.length <= TRUNCATE_LEN) return { value: text, truncated: false };
  return { value: text.slice(0, TRUNCATE_LEN), truncated: true };
}

function formatHeaders(headers?: Record<string, unknown>): string {
  if (!headers || Object.keys(headers).length === 0) return "(none)";
  return JSON.stringify(headers, null, 2);
}

function getStatusDotClass(statusCode?: number): string {
  if (!statusCode) return "bg-border";
  if (statusCode >= 200 && statusCode < 300) return "bg-green-500";
  if (statusCode >= 400 && statusCode < 500) return "bg-amber-500";
  if (statusCode >= 500) return "bg-red-500";
  return "bg-border";
}

interface SectionProps {
  title: string;
  children: JSX.Element;
}

const Section: Component<SectionProps> = (props) => {
  const [open, setOpen] = createSignal(true);

  return (
    <div class="border-b border-border last:border-b-0">
      <button
        class="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-elevated transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="font-caption font-medium text-text-secondary text-xs uppercase tracking-wide">
          {props.title}
        </span>
        <span class="text-text-muted text-xs">{open() ? "▾" : "▸"}</span>
      </button>
      <Show when={open()}>
        <div class="px-4 pb-3">{props.children}</div>
      </Show>
    </div>
  );
};

const RequestDetailPanel: Component = () => {
  const req = () => requestStore.selectedRequest();

  return (
    <Show when={req()}>
      {(request) => {
        const reqBody = () => {
          const body = request().requestBody;
          if (!body) return null;
          return truncate(body);
        };
        const resBody = () => {
          const body = request().responseBody;
          if (!body) return null;
          return truncate(body);
        };

        return (
          <div class="flex flex-col h-full glass border-l border-border overflow-hidden">
            {/* Header */}
            <div class="flex items-start justify-between gap-2 px-4 py-3 border-b border-border bg-bg-elevated shrink-0">
              <div class="flex flex-col gap-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-caption font-medium text-text uppercase text-xs">
                    {request().method}
                  </span>
                  <Show when={request().statusCode}>
                    <div class="flex items-center gap-1">
                      <span
                        class={`inline-block w-2 h-2 rounded-full ${getStatusDotClass(request().statusCode)}`}
                      />
                      <span class="font-caption text-text-secondary text-xs">
                        {request().statusCode}
                      </span>
                    </div>
                  </Show>
                  <Show when={request().inFlight}>
                    <span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  </Show>
                </div>
                <p class="font-caption text-text text-xs truncate max-w-[220px]" title={request().endpoint}>
                  {request().endpoint}
                </p>
              </div>
              <button
                class="shrink-0 w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
                onClick={() => requestStore.selectRequest(null)}
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div class="flex-1 overflow-y-auto">
              {/* Stats */}
              <Section title="Stats">
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-micro text-text-muted">Latency</span>
                    <span class="font-mono font-micro text-text">
                      {request().latencyMs != null ? `${request().latencyMs}ms` : "—"}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="font-micro text-text-muted">Tokens used</span>
                    <span class="font-mono font-micro text-text">
                      {request().tokensUsed != null ? request().tokensUsed!.toLocaleString() : "—"}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="font-micro text-text-muted">Provider</span>
                    <span class="font-micro text-text capitalize">{request().provider}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="font-micro text-text-muted">Time</span>
                    <span class="font-mono font-micro text-text">
                      {new Date(request().timestamp).toLocaleTimeString("en-US", { hour12: false })}
                    </span>
                  </div>
                </div>
              </Section>

              {/* Request Headers */}
              <Section title="Request Headers">
                <pre class="font-mono text-[10px] text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                  {formatHeaders(request().requestHeaders)}
                </pre>
              </Section>

              {/* Request Body */}
              <Section title="Request Body">
                <Show
                  when={reqBody()}
                  fallback={<p class="font-caption text-text-muted text-xs">(empty)</p>}
                >
                  {(body) => (
                    <>
                      <pre class="font-mono text-[10px] text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                        {body().value}
                      </pre>
                      <Show when={body().truncated}>
                        <p class="mt-1 font-micro text-amber-500 text-[10px]">
                          — truncated at {TRUNCATE_LEN} chars —
                        </p>
                      </Show>
                    </>
                  )}
                </Show>
              </Section>

              {/* Response Headers */}
              <Section title="Response Headers">
                <pre class="font-mono text-[10px] text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                  {formatHeaders(request().responseHeaders)}
                </pre>
              </Section>

              {/* Response Body */}
              <Section title="Response Body">
                <Show
                  when={resBody()}
                  fallback={<p class="font-caption text-text-muted text-xs">(empty)</p>}
                >
                  {(body) => (
                    <>
                      <pre class="font-mono text-[10px] text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
                        {body().value}
                      </pre>
                      <Show when={body().truncated}>
                        <p class="mt-1 font-micro text-amber-500 text-[10px]">
                          — truncated at {TRUNCATE_LEN} chars —
                        </p>
                      </Show>
                    </>
                  )}
                </Show>
              </Section>
            </div>
          </div>
        );
      }}
    </Show>
  );
};

export default RequestDetailPanel;
