import type { Component, JSX } from "solid-js";
import { Show, createSignal } from "solid-js";
import { requestStore } from "../stores/requestStore";

const TRUNCATE_LEN = 2400;

function truncate(text: string): { value: string; truncated: boolean } {
  if (text.length <= TRUNCATE_LEN) return { value: text, truncated: false };
  return { value: text.slice(0, TRUNCATE_LEN), truncated: true };
}

function formatHeaders(headers?: Record<string, unknown>): string {
  if (!headers || Object.keys(headers).length === 0) return "(none)";
  return JSON.stringify(headers, null, 2);
}

interface SectionProps {
  title: string;
  children: JSX.Element;
  defaultOpen?: boolean;
}

const Section: Component<SectionProps> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);

  return (
    <section class="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open()}
        class="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-bg-elevated focus-visible:bg-bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-500/25"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="font-caption text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary">
          {props.title}
        </span>
        <span class="text-[11px] text-text-muted">{open() ? "−" : "+"}</span>
      </button>
      <Show when={open()}>
        <div class="px-4 pb-3">{props.children}</div>
      </Show>
    </section>
  );
};

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour12: false });
}

function formatLatency(latencyMs?: number): string {
  return latencyMs != null ? `${latencyMs} ms` : "Not finished";
}

function formatTokens(tokensUsed?: number): string {
  return tokensUsed != null ? tokensUsed.toLocaleString() : "Not available";
}

function statusTone(statusCode?: number): string {
  if (!statusCode) return "border-border bg-bg-elevated text-text-muted";
  if (statusCode >= 200 && statusCode < 300) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-100";
  if (statusCode >= 400 && statusCode < 500) return "border-amber-500/20 bg-amber-500/10 text-amber-100";
  if (statusCode >= 500) return "border-rose-500/20 bg-rose-500/10 text-rose-100";
  return "border-border bg-bg-elevated text-text-muted";
}

function statusDot(statusCode?: number): string {
  if (!statusCode) return "bg-border";
  if (statusCode >= 200 && statusCode < 300) return "bg-emerald-400";
  if (statusCode >= 400 && statusCode < 500) return "bg-amber-400";
  if (statusCode >= 500) return "bg-rose-400";
  return "bg-border";
}

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
          <div class="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-bg-surface">
            <div class="shrink-0 border-b border-border bg-bg-elevated px-4 py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center rounded-full border border-border bg-bg-surface px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text">
                      {request().method}
                    </span>
                    <Show when={request().statusCode}>
                      <span class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-caption text-[11px] font-medium ${statusTone(request().statusCode)}`}>
                        <span class={`h-2 w-2 rounded-full ${statusDot(request().statusCode)}`} aria-hidden="true" />
                        {request().statusCode}
                      </span>
                    </Show>
                    <Show when={request().inFlight}>
                      <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 font-caption text-[11px] font-medium text-amber-100">
                        <span class="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
                        Sending
                      </span>
                    </Show>
                  </div>

                  <div class="min-w-0">
                    <p class="truncate font-body text-[13px] text-text" title={request().endpoint}>
                      {request().endpoint}
                    </p>
                    <p class="mt-1 font-caption text-[11px] text-text-muted">
                      {request().provider} · {formatTimestamp(request().timestamp)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Close request details"
                  class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent text-text-muted transition-colors hover:border-border-hover hover:bg-bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:ring-offset-0"
                  onClick={() => requestStore.selectRequest(null)}
                >
                  ×
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto">
              <Section title="Overview" defaultOpen>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
                    <p class="font-caption text-[10px] uppercase tracking-[0.14em] text-text-tertiary">Latency</p>
                    <p class="mt-1 font-mono text-[12px] tabular-nums text-text">{formatLatency(request().latencyMs)}</p>
                  </div>
                  <div class="rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
                    <p class="font-caption text-[10px] uppercase tracking-[0.14em] text-text-tertiary">Tokens</p>
                    <p class="mt-1 font-mono text-[12px] tabular-nums text-text">{formatTokens(request().tokensUsed)}</p>
                  </div>
                  <div class="rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
                    <p class="font-caption text-[10px] uppercase tracking-[0.14em] text-text-tertiary">Status</p>
                    <p class="mt-1 font-caption text-[12px] text-text capitalize">{request().statusCode ? `${request().statusCode}` : "Pending"}</p>
                  </div>
                  <div class="rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
                    <p class="font-caption text-[10px] uppercase tracking-[0.14em] text-text-tertiary">Provider</p>
                    <p class="mt-1 font-caption text-[12px] text-text capitalize">{request().provider}</p>
                  </div>
                </div>
              </Section>

              <Section title="Request headers">
                <pre class="max-h-64 overflow-auto rounded-lg border border-border bg-bg-elevated px-3 py-2 font-mono text-[11px] leading-5 text-text-secondary whitespace-pre-wrap break-words">
                  {formatHeaders(request().requestHeaders)}
                </pre>
              </Section>

              <Section title="Request body">
                <Show when={reqBody()} fallback={<p class="font-caption text-[12px] text-text-muted">No request body</p>}>
                  {(body) => (
                    <>
                      <pre class="max-h-72 overflow-auto rounded-lg border border-border bg-bg-elevated px-3 py-2 font-mono text-[11px] leading-5 text-text-secondary whitespace-pre-wrap break-words">
                        {body().value}
                      </pre>
                      <Show when={body().truncated}>
                        <p class="mt-2 font-caption text-[11px] text-amber-200">
                          Truncated at {TRUNCATE_LEN} chars
                        </p>
                      </Show>
                    </>
                  )}
                </Show>
              </Section>

              <Section title="Response headers">
                <pre class="max-h-64 overflow-auto rounded-lg border border-border bg-bg-elevated px-3 py-2 font-mono text-[11px] leading-5 text-text-secondary whitespace-pre-wrap break-words">
                  {formatHeaders(request().responseHeaders)}
                </pre>
              </Section>

              <Section title="Response body">
                <Show when={resBody()} fallback={<p class="font-caption text-[12px] text-text-muted">No response body</p>}>
                  {(body) => (
                    <>
                      <pre class="max-h-72 overflow-auto rounded-lg border border-border bg-bg-elevated px-3 py-2 font-mono text-[11px] leading-5 text-text-secondary whitespace-pre-wrap break-words">
                        {body().value}
                      </pre>
                      <Show when={body().truncated}>
                        <p class="mt-2 font-caption text-[11px] text-amber-200">
                          Truncated at {TRUNCATE_LEN} chars
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
