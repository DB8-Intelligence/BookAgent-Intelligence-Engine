/**
 * Entity: Observability / Alerting
 *
 * Métricas operacionais, health model e alerting estruturado.
 *
 * Modelo:
 *   - SystemMetric: ponto de métrica individual (gauge/counter/histogram)
 *   - AlertRule: regra de alerta com threshold e severidade
 *   - AlertEvent: alerta disparado (persistido para audit)
 *   - ObservabilitySnapshot: visão consolidada do sistema
 *   - TenantOperationalHealth: saúde por tenant
 *
 * Parte 79: Observability & Alerting Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de métrica */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
}

/** Categoria da métrica */
export enum MetricCategory {
  JOB = 'job',
  QUEUE = 'queue',
  RENDER = 'render',
  PUBLICATION = 'publication',
  BILLING = 'billing',
  PROVIDER = 'provider',
  COST = 'cost',
  SYSTEM = 'system',
}

/** Severidade do alerta */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/** Status do alerta */
export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

// ---------------------------------------------------------------------------
// System Metric
// ---------------------------------------------------------------------------

/**
 * Ponto de métrica individual.
 */
export interface SystemMetric {
  /** Nome da métrica (ex: "job.throughput", "queue.backlog") */
  name: string;
  /** Categoria */
  category: MetricCategory;
  /** Tipo */
  type: MetricType;
  /** Valor atual */
  value: number;
  /** Unidade (ex: "count", "ms", "percent", "usd") */
  unit: string;
  /** Tenant (null = global) */
  tenantId?: string;
  /** Labels adicionais */
  labels?: Record<string, string>;
  /** Timestamp */
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Provider Health
// ---------------------------------------------------------------------------

export interface ProviderHealth {
  name: string;
  available: boolean;
  latencyMs: number | null;
  lastCheckAt: string;
  errorRate: number;
  consecutiveFailures: number;
}

// ---------------------------------------------------------------------------
// Alert Rule
// ---------------------------------------------------------------------------

/**
 * Regra de alerta — define condição de disparo.
 */
export interface AlertRule {
  /** ID da regra */
  id: string;
  /** Nome legível */
  name: string;
  /** Descrição */
  description: string;
  /** Categoria */
  category: MetricCategory;
  /** Nome da métrica monitorada */
  metricName: string;
  /** Operador de comparação */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  /** Threshold de disparo */
  threshold: number;
  /** Severidade */
  severity: AlertSeverity;
  /** Se está ativo */
  enabled: boolean;
  /** Cooldown em minutos (evita spam) */
  cooldownMinutes: number;
  /** Último disparo */
  lastFiredAt?: Date;
}

// ---------------------------------------------------------------------------
// Alert Event
// ---------------------------------------------------------------------------

/**
 * Alerta disparado — persistido para audit.
 */
export interface AlertEvent {
  /** ID do alerta */
  id: string;
  /** ID da regra que disparou */
  ruleId: string;
  /** Nome da regra */
  ruleName: string;
  /** Severidade */
  severity: AlertSeverity;
  /** Status */
  status: AlertStatus;
  /** Mensagem */
  message: string;
  /** Valor atual da métrica */
  currentValue: number;
  /** Threshold configurado */
  threshold: number;
  /** Tenant afetado (null = global) */
  tenantId?: string;
  /** Metadados */
  metadata?: Record<string, unknown>;
  /** Disparado em */
  firedAt: Date;
  /** Resolvido em */
  resolvedAt?: Date;
}

// ---------------------------------------------------------------------------
// Tenant Operational Health
// ---------------------------------------------------------------------------

/**
 * Saúde operacional por tenant.
 */
export interface TenantOperationalHealth {
  tenantId: string;
  /** Jobs */
  jobsLast24h: number;
  jobFailureRate: number;
  avgJobDurationMs: number;
  /** Publications */
  publicationSuccessRate: number;
  publicationFailures: number;
  /** Cost */
  estimatedCostUsd: number;
  costLimitUsd: number;
  costPercent: number;
  /** Usage */
  usagePercent: number;
  /** Alerts */
  activeAlerts: number;
  /** Overall */
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

// ---------------------------------------------------------------------------
// Observability Snapshot
// ---------------------------------------------------------------------------

/**
 * Visão consolidada de observabilidade do sistema.
 */
export interface ObservabilitySnapshot {
  /** Status geral */
  status: 'healthy' | 'degraded' | 'critical';
  /** Uptime */
  uptimeSeconds: number;
  /** Métricas de jobs */
  jobs: {
    throughput24h: number;
    failureRate24h: number;
    avgDurationMs: number;
    inProgress: number;
    queued: number;
  };
  /** Métricas de fila */
  queue: {
    available: boolean;
    backlog: number;
    active: number;
    failed: number;
    congested: boolean;
    avgWaitTimeMs: number;
  };
  /** Métricas de render */
  render: {
    completed24h: number;
    failed24h: number;
    avgRenderTimeMs: number;
  };
  /** Métricas de publicação */
  publications: {
    attempted24h: number;
    succeeded24h: number;
    failed24h: number;
    successRate: number;
  };
  /** Providers */
  providers: ProviderHealth[];
  /** Billing webhooks */
  billingWebhooks: {
    received24h: number;
    processed24h: number;
    failed24h: number;
    successRate: number;
  };
  /** Custo */
  cost: {
    estimatedTotalUsd: number;
    tenantCount: number;
  };
  /** Alertas ativos */
  activeAlerts: AlertEvent[];
  /** Timestamp */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Default Alert Rules
// ---------------------------------------------------------------------------

export const DEFAULT_ALERT_RULES: Omit<AlertRule, 'id'>[] = [
  {
    name: 'queue_backlog_high',
    description: 'Fila com backlog acima de 20 jobs',
    category: MetricCategory.QUEUE,
    metricName: 'queue.backlog',
    operator: 'gt',
    threshold: 20,
    severity: AlertSeverity.WARNING,
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    name: 'queue_backlog_critical',
    description: 'Fila com backlog acima de 50 jobs',
    category: MetricCategory.QUEUE,
    metricName: 'queue.backlog',
    operator: 'gt',
    threshold: 50,
    severity: AlertSeverity.CRITICAL,
    enabled: true,
    cooldownMinutes: 5,
  },
  {
    name: 'job_failure_rate_high',
    description: 'Taxa de falha de jobs acima de 20%',
    category: MetricCategory.JOB,
    metricName: 'job.failure_rate',
    operator: 'gt',
    threshold: 20,
    severity: AlertSeverity.WARNING,
    enabled: true,
    cooldownMinutes: 30,
  },
  {
    name: 'job_failure_rate_critical',
    description: 'Taxa de falha de jobs acima de 50%',
    category: MetricCategory.JOB,
    metricName: 'job.failure_rate',
    operator: 'gt',
    threshold: 50,
    severity: AlertSeverity.CRITICAL,
    enabled: true,
    cooldownMinutes: 10,
  },
  {
    name: 'provider_unavailable',
    description: 'Provider de IA indisponível',
    category: MetricCategory.PROVIDER,
    metricName: 'provider.available',
    operator: 'eq',
    threshold: 0,
    severity: AlertSeverity.CRITICAL,
    enabled: true,
    cooldownMinutes: 5,
  },
  {
    name: 'publication_failure_rate_high',
    description: 'Taxa de falha de publicação acima de 30%',
    category: MetricCategory.PUBLICATION,
    metricName: 'publication.failure_rate',
    operator: 'gt',
    threshold: 30,
    severity: AlertSeverity.WARNING,
    enabled: true,
    cooldownMinutes: 30,
  },
  {
    name: 'billing_webhook_failures',
    description: 'Falhas de webhook de billing acima de 5',
    category: MetricCategory.BILLING,
    metricName: 'billing.webhook_failures',
    operator: 'gt',
    threshold: 5,
    severity: AlertSeverity.CRITICAL,
    enabled: true,
    cooldownMinutes: 15,
  },
  {
    name: 'cost_high',
    description: 'Custo estimado acima de $100/dia',
    category: MetricCategory.COST,
    metricName: 'cost.daily_usd',
    operator: 'gt',
    threshold: 100,
    severity: AlertSeverity.WARNING,
    enabled: true,
    cooldownMinutes: 60,
  },
  {
    name: 'render_failure_rate_high',
    description: 'Taxa de falha de render acima de 25%',
    category: MetricCategory.RENDER,
    metricName: 'render.failure_rate',
    operator: 'gt',
    threshold: 25,
    severity: AlertSeverity.WARNING,
    enabled: true,
    cooldownMinutes: 30,
  },
];
