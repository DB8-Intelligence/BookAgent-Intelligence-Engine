---
name: bookagent-project-scaffold
description: Scaffold new Node.js/TypeScript projects using the BookAgent Intelligence Engine architecture — sequential pipeline, domain-driven design, module contracts, ProcessingContext flow, and full test infrastructure. Use when the user wants to create a new processing engine, content pipeline, or multi-stage data transformation project.
---

# BookAgent Project Scaffold Skill

Create new projects using the proven architecture from BookAgent Intelligence Engine: a sequential N-stage pipeline with domain-driven design, typed context flow, module contracts, adapter pattern, and comprehensive testing.

This skill encapsulates the complete methodology used to build a production-grade document intelligence engine with 15 sequential stages, 89+ tests, and full type safety.

---

## Architecture Overview

```
                     ┌──────────────┐
                     │  Express API │
                     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │ Orchestrator │
                     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │   Pipeline   │ ← N sequential stages
                     └──────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
     ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
     │   Modules   │ │   Domain   │ │  Adapters   │
     │  (N IModule)│ │ (entities, │ │ (external   │
     │             │ │  policies) │ │  services)  │
     └─────────────┘ └────────────┘ └─────────────┘
```

**Stack**: Node.js 20+ / TypeScript 5.6+ / ESM (`"type": "module"`) / Express / Vitest

---

## Workflow

Make a todo list for all tasks and work through them sequentially.

### Phase 1: Project Foundation

#### 1.1 Gather Requirements

Ask the user:
- **Project name**: What should the project be called?
- **Domain description**: What does this engine process? (e.g., "documents", "images", "data feeds")
- **Pipeline stages**: What are the sequential processing steps? List them in order.
- **Input type**: What goes in? (file upload, API call, webhook, etc.)
- **Output type**: What comes out? (generated content, reports, artifacts, etc.)
- **External services**: Any APIs/services needed? (AI providers, storage, etc.)

#### 1.2 Initialize Project

Create the project with this structure:

```
<project-name>/
├── src/
│   ├── api/
│   │   ├── controllers/       # Express route handlers
│   │   ├── routes/            # Express route definitions
│   │   └── middleware/        # Error handling, validation
│   ├── config/
│   │   └── index.ts           # Centralized config from env
│   ├── core/
│   │   ├── pipeline.ts        # Sequential stage executor
│   │   ├── orchestrator.ts    # Job lifecycle manager
│   │   └── context.ts         # ProcessingContext definition
│   ├── domain/
│   │   ├── entities/          # Domain objects with identity
│   │   ├── interfaces/        # IModule contract + others
│   │   └── value-objects/     # Enums, immutable types
│   ├── modules/
│   │   └── <stage-name>/      # One folder per pipeline stage
│   │       └── index.ts       # Implements IModule
│   ├── adapters/              # External service abstractions
│   │   └── providers/         # Provider factory pattern
│   ├── utils/
│   │   └── logger.ts          # Centralized logger
│   └── index.ts               # Entry point, bootstrap
├── tests/
│   ├── core/                  # Pipeline and orchestrator tests
│   └── modules/               # Per-module unit tests
├── scripts/
│   └── sample-run.ts          # Full pipeline validation script
├── docs/
│   ├── CORE_TECHNICAL_REFERENCE.md
│   └── LOCAL_SETUP.md
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

#### 1.3 Package Configuration

```json
{
  "name": "<project-name>",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/ --ext .ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "sample": "tsx scripts/sample-run.ts",
    "validate": "tsc --noEmit && vitest run && tsx scripts/sample-run.ts"
  }
}
```

**Dependencies**: express, zod, uuid
**DevDependencies**: typescript (^5.6), tsx, vitest, eslint, @types/node, @types/express, @types/uuid

#### 1.4 TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests", "scripts"]
}
```

---

### Phase 2: Domain Layer

#### 2.1 PipelineStage Enum

Define all stages as a TypeScript enum in `src/domain/value-objects/index.ts`:

```typescript
export enum PipelineStage {
  STAGE_1 = 'stage_1',
  STAGE_2 = 'stage_2',
  // ... one entry per pipeline stage
}
```

**Rule**: The enum defines ALL possible stages. The pipeline executor uses a separate ordered array to control execution sequence.

#### 2.2 IModule Contract

Create `src/domain/interfaces/module.ts`:

```typescript
import type { ProcessingContext } from '../../core/context.js';
import type { PipelineStage } from '../value-objects/index.js';

export interface IModule {
  readonly stage: PipelineStage;
  readonly name: string;
  run(context: ProcessingContext): Promise<ProcessingContext>;
}
```

**Critical contract rules**:
- Each module receives the full ProcessingContext
- Each module returns a NEW context (spread + enrich pattern: `return { ...context, newField: result }`)
- Modules NEVER mutate the input context directly
- Each module reads only the fields it needs and writes only its designated fields

#### 2.3 Domain Entities

Create one entity file per major domain concept in `src/domain/entities/`:
- Each entity represents a typed result that a module produces
- Use interfaces (not classes) for data shapes
- Use enums for constrained values
- Export everything through `src/domain/entities/index.ts` barrel

#### 2.4 Value Objects

In `src/domain/value-objects/index.ts`, define:
- All enums (PipelineStage, status enums, type enums)
- Immutable value types (colors, dimensions, positions)
- Constants

---

### Phase 3: Core Infrastructure

#### 3.1 ProcessingContext

Create `src/core/context.ts`:

```typescript
export interface ProcessingContext {
  readonly jobId: string;
  readonly input: JobInput;

  // Add one optional field per module's output
  // Each field is populated by exactly ONE module
  // Fields are typed using domain entities

  executionLogs?: ModuleExecutionLog[];
}

export function createContext(jobId: string, input: JobInput): ProcessingContext {
  return { jobId, input, executionLogs: [] };
}
```

**Rules**:
- `jobId` and `input` are readonly (set once at creation)
- All module output fields are optional (`?`) — they start undefined and get populated as the pipeline progresses
- Each field is "owned" by exactly one module (single writer principle)
- Multiple modules can READ any field (multiple reader principle)

#### 3.2 Pipeline Executor

Create `src/core/pipeline.ts`:

```typescript
const STAGE_ORDER: PipelineStage[] = [
  PipelineStage.STAGE_1,
  PipelineStage.STAGE_2,
  // ... all stages in execution order
];

export class Pipeline {
  private modules: Map<PipelineStage, IModule> = new Map();

  registerModule(mod: IModule): void {
    this.modules.set(mod.stage, mod);
  }

  async execute(initialContext: ProcessingContext): Promise<JobResult> {
    let context = initialContext;
    const logs: ModuleExecutionLog[] = [];

    for (const stage of STAGE_ORDER) {
      const mod = this.modules.get(stage);
      if (!mod) continue;  // Skip unregistered stages gracefully

      const startMs = Date.now();
      try {
        context = await mod.run(context);
        logs.push({ stage, status: 'success', durationMs: Date.now() - startMs });
      } catch (error) {
        logs.push({ stage, status: 'error', error: error.message });
        throw error;  // Let orchestrator handle retry/abort
      }
    }

    context = { ...context, executionLogs: logs };
    return buildJobResult(context);
  }
}
```

**Key design decisions**:
- Stages skip gracefully if no module is registered (enables partial pipelines)
- Each execution is timed and logged automatically
- Errors propagate to the orchestrator (fail-fast by default)
- The STAGE_ORDER array is the single source of truth for execution sequence

#### 3.3 Orchestrator

Create `src/core/orchestrator.ts`:
- Manages job lifecycle (create, start, track, complete)
- Holds the Pipeline instance
- Provides job storage (in-memory Map for now, adapter-ready for DB later)
- Creates initial ProcessingContext from JobInput

#### 3.4 Centralized Logger

Create `src/utils/logger.ts`:

```typescript
export const logger = {
  info: (msg: string) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
};
```

**Rule**: ALL modules use this logger. Never use `console.log` directly in modules.

---

### Phase 4: Modules

#### 4.1 Module Pattern

Each module follows the exact same pattern in `src/modules/<stage-name>/index.ts`:

```typescript
import type { ProcessingContext } from '../../core/context.js';
import type { IModule } from '../../domain/interfaces/module.js';
import { PipelineStage } from '../../domain/value-objects/index.js';
import { logger } from '../../utils/logger.js';

export class SomeModule implements IModule {
  readonly stage = PipelineStage.SOME_STAGE;
  readonly name = 'SomeModule';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    logger.info(`${this.name}: starting`);

    // 1. Read what you need from context
    const input = context.someField;

    // 2. Process
    const result = await this.process(input);

    // 3. Return enriched context (never mutate)
    return { ...context, outputField: result };
  }

  private async process(input: any): Promise<any> {
    // Business logic here
  }
}
```

#### 4.2 Module Implementation Order

Implement modules in pipeline execution order. For each module:
1. Define the entity interface for its output (in domain/entities/)
2. Add the output field to ProcessingContext
3. Implement the module class
4. Write tests
5. Register in entry point

#### 4.3 Stub Strategy

For stages that will later integrate with external services:
- Implement core logic with deterministic stubs
- Mark integration points with comments: `// TODO: Replace with real provider call`
- Use the Provider Factory pattern (see Phase 6) for external dependencies
- All stubs must produce valid typed output that downstream modules can consume

---

### Phase 5: API Layer

#### 5.1 Express Setup

Create `src/index.ts` (entry point):
- Initialize Express with JSON body parser
- Register ALL modules in the pipeline
- Set up routes and middleware
- Health endpoint at `GET /health` returning `{ status, engine, version, uptime }`

#### 5.2 Standard Endpoints

```
GET  /health                         → Health check
POST /api/v1/process                 → Start processing job
GET  /api/v1/jobs                    → List jobs
GET  /api/v1/jobs/:jobId             → Job detail
```

#### 5.3 Error Handling Middleware

Centralized error handler as last middleware:
- Catch all unhandled errors
- Return structured JSON error responses
- Log errors through centralized logger

---

### Phase 6: Adapter Pattern

#### 6.1 Provider Factory

For external services (AI, storage, APIs), use the Provider Factory pattern:

```typescript
// src/adapters/providers/ai-provider.ts
export interface IAIProvider {
  generateText(prompt: string): Promise<string>;
}

export class StubAIProvider implements IAIProvider {
  async generateText(prompt: string): Promise<string> {
    return `[STUB] Response for: ${prompt.slice(0, 50)}`;
  }
}

// Factory
export function createAIProvider(): IAIProvider {
  const provider = process.env.AI_PROVIDER ?? 'stub';
  switch (provider) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai': return new OpenAIProvider();
    default: return new StubAIProvider();
  }
}
```

**Rules**:
- Always provide a stub implementation as default
- Real providers are activated via environment variables
- Modules depend on the interface, never on concrete implementations
- Graceful degradation: if a provider fails, fall back to stub with warning

---

### Phase 7: Testing

#### 7.1 Test Infrastructure

Configure `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

#### 7.2 Required Test Categories

1. **Pipeline stage tests** (`tests/core/pipeline-stages.test.ts`):
   - PipelineStage enum has correct number of values
   - Stages execute in correct order
   - Critical ordering constraints are validated (e.g., "X runs before Y")
   - All stages execute end-to-end (register in reverse order to prove ordering works)

2. **Module unit tests** (`tests/modules/<stage>.test.ts`):
   - Module has correct `stage` and `name`
   - Module handles empty/missing input gracefully
   - Module produces correct output shape with valid input
   - Module enriches context without losing existing fields

3. **Domain tests** (if complex policies exist):
   - Immutability policies
   - Validation rules
   - Entity creation helpers

#### 7.3 Test Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { SomeModule } from '../../src/modules/some-stage/index.js';
import { PipelineStage } from '../../src/domain/value-objects/index.js';

describe('SomeModule', () => {
  it('should have correct stage', () => {
    const mod = new SomeModule();
    expect(mod.stage).toBe(PipelineStage.SOME_STAGE);
    expect(mod.name).toBe('SomeModule');
  });

  it('should handle empty input', async () => {
    const mod = new SomeModule();
    const ctx = createMinimalContext();
    const result = await mod.run(ctx);
    expect(result.outputField).toBeDefined();
  });
});
```

**Target**: Minimum 4 tests per module, 80%+ coverage on core pipeline logic.

---

### Phase 8: Sample Run & Validation

#### 8.1 Sample Run Script

Create `scripts/sample-run.ts`:
- Instantiate Pipeline directly (no HTTP server)
- Register all modules (or stubs for external-dependent ones)
- Create a realistic input fixture
- Execute full pipeline
- Print results for each stage
- Report timing and delivery status

This script serves as **integration validation** — if it runs cleanly, the pipeline is healthy.

#### 8.2 Validation Command

```bash
npm run validate
# Runs: tsc --noEmit && vitest run && tsx scripts/sample-run.ts
```

All three must pass for the project to be considered valid.

---

### Phase 9: Documentation

#### 9.1 Core Technical Reference

Create `docs/CORE_TECHNICAL_REFERENCE.md`:
- Architecture diagram (ASCII)
- Pipeline stages table (stage, module, reads, writes)
- ProcessingContext full interface
- Key design decisions
- Test summary
- API endpoints
- Next steps / integration roadmap

#### 9.2 Local Setup Guide

Create `docs/LOCAL_SETUP.md`:
- Prerequisites (Node.js version, npm)
- Clone and install steps
- Build and test commands
- Sample run validation
- Troubleshooting section

#### 9.3 Environment Configuration

Create `.env.example` with ALL configurable variables and descriptions.

---

### Phase 10: Final Validation & Commit

1. Run `tsc --noEmit` — must have zero errors
2. Run `npm test` — all tests must pass
3. Run `npm run sample` — full pipeline must complete
4. Commit with descriptive message
5. Push to remote branch

---

## Key Principles (from BookAgent lessons learned)

### Architecture Rules
1. **Single Source of Truth**: STAGE_ORDER array defines execution sequence
2. **Single Writer Principle**: Each ProcessingContext field is written by exactly one module
3. **Spread & Enrich**: `return { ...context, myField: result }` — never mutate
4. **Fail Fast**: Errors propagate up to orchestrator; no silent swallowing
5. **Graceful Skip**: Pipeline skips stages with no registered module

### Module Rules
1. Every module implements `IModule { stage, name, run(ctx) }`
2. Every module uses centralized logger (never `console.log`)
3. Every module handles missing optional context gracefully (early return with defaults)
4. Every module has at least 4 unit tests

### Ordering Rules
1. If module B depends on module A's output, A MUST appear earlier in STAGE_ORDER
2. Write a test that validates critical ordering constraints
3. Blog/LandingPage/specialized outputs get their OWN PipelineStage (don't share stages)

### Adapter Rules
1. External services are behind interfaces (Provider pattern)
2. Stub providers are always the default
3. Real providers activated via env vars
4. Graceful degradation on provider failure

### Testing Rules
1. Pipeline ordering tests are mandatory
2. Each module has isolated unit tests
3. Sample run script validates full integration
4. `npm run validate` must pass before any commit

### Documentation Rules
1. CORE_TECHNICAL_REFERENCE.md is the source of truth
2. Pipeline table shows reads/writes for every module
3. .env.example documents all configuration
4. LOCAL_SETUP.md enables anyone to get running in < 5 minutes

---

## Wrap Up

After all phases are complete, provide the user with:

* **Summary**: Architecture overview, number of stages, modules, tests
* **Validation results**:
  1. TypeScript compilation status
  2. Test suite results (count, pass/fail)
  3. Sample run status (timing, final output)
* **Project stats**: Files created, lines of code, test coverage
* **Next steps**: What to integrate first (recommend starting with the most upstream external dependency)
* **Handoff prompt**: A continuation prompt the user can use to pick up the project in another session
