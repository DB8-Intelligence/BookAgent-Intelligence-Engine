"use client";

/**
 * Global Error Boundary — Catches React crashes and pre-fills bug report.
 *
 * Wraps the app and intercepts unhandled errors. Shows a fallback UI
 * with the error details and a pre-filled bug report button.
 *
 * Also captures unhandled promise rejections and window errors via
 * global event listeners.
 */

import { Component, type ReactNode } from "react";
import { bookagent, getApiLog } from "@/lib/bookagentApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  reported: boolean;
  reporting: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: "",
    reported: false,
    reporting: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({
      errorInfo: info.componentStack ?? "",
    });

    // Auto-report crash as blocker (best-effort, don't block UI)
    this.autoReport(error, info.componentStack ?? "");
  }

  componentDidMount() {
    // Capture unhandled promise rejections
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    window.addEventListener("error", this.handleWindowError);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    window.removeEventListener("error", this.handleWindowError);
  }

  private handleUnhandledRejection = (e: PromiseRejectionEvent) => {
    const message = e.reason instanceof Error ? e.reason.message : String(e.reason);
    this.autoReport(
      new Error(`Unhandled Promise Rejection: ${message}`),
      e.reason instanceof Error ? e.reason.stack ?? "" : "",
    );
  };

  private handleWindowError = (e: ErrorEvent) => {
    this.autoReport(
      new Error(`${e.message} at ${e.filename}:${e.lineno}:${e.colno}`),
      e.error?.stack ?? "",
    );
  };

  private async autoReport(error: Error, stack: string) {
    try {
      await bookagent.bugs.create({
        title: `[CRASH] ${error.message.slice(0, 180)}`,
        description: `Stack:\n${stack.slice(0, 3500)}`,
        severity: "blocker",
        context: {
          url: window.location.href,
          route: window.location.pathname,
          user_agent: navigator.userAgent,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          api_log: getApiLog(),
          timestamp: new Date().toISOString(),
          auto_captured: true,
          error_name: error.name,
        },
      });
    } catch {
      // Best-effort — don't crash the error handler
    }
  }

  private async handleManualReport() {
    if (!this.state.error) return;
    this.setState({ reporting: true });

    try {
      await bookagent.bugs.create({
        title: `[CRASH] ${this.state.error.message.slice(0, 180)}`,
        description: `Erro:\n${this.state.error.message}\n\nComponent Stack:\n${this.state.errorInfo.slice(0, 3000)}`,
        severity: "blocker",
        context: {
          url: window.location.href,
          route: window.location.pathname,
          user_agent: navigator.userAgent,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          api_log: getApiLog(),
          timestamp: new Date().toISOString(),
          auto_captured: false,
          error_name: this.state.error.name,
          error_stack: this.state.error.stack?.slice(0, 2000),
        },
      });
      this.setState({ reported: true });
    } catch {
      // ignore
    } finally {
      this.setState({ reporting: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-lg w-full">
            <CardContent className="p-6 space-y-4 text-center">
              <span className="text-4xl block">💥</span>
              <h1 className="text-lg font-bold">Algo deu errado</h1>
              <p className="text-sm text-muted-foreground">
                Um erro inesperado ocorreu. A equipe ja foi notificada automaticamente.
              </p>

              {this.state.error && (
                <div className="bg-red-50 rounded-lg p-3 text-left">
                  <p className="text-xs font-mono text-red-700 break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Recarregar pagina
                </Button>

                {!this.state.reported ? (
                  <Button
                    onClick={() => this.handleManualReport()}
                    disabled={this.state.reporting}
                  >
                    {this.state.reporting ? "Enviando..." : "Enviar report detalhado"}
                  </Button>
                ) : (
                  <Button disabled variant="secondary">
                    ✓ Report enviado
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
