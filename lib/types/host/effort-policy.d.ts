import type { Context } from '@deepseek-ai/cordis';
import type { Config } from '../config.js';
import type { SessionFold } from './session-fold.js';
import type { HealthProbe } from './health-probe.js';
export declare function installEffortPolicy(ctx: Context, config: Config, fold: SessionFold, health: HealthProbe): void;
