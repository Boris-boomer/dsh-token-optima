// 原子配置写入 + 备份轮转 + 路径防护

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface AtomicWriteOptions {
  /** 备份保留数，默认 3 */
  backupCount?: number;
  /** 文件锁超时（毫秒），默认 5000 */
  lockTimeoutMs?: number;
}

export class AtomicConfigWriter {
  private readonly baseDir: string;
  private readonly backupCount: number;
  private readonly lockTimeoutMs: number;

  constructor(baseDir: string, options: AtomicWriteOptions = {}) {
    this.baseDir = path.resolve(baseDir);
    this.backupCount = options.backupCount ?? 3;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5000;
  }

  /** 防御路径遍历与符号链接 */
  private safePath(relative: string): string {
    const target = path.resolve(this.baseDir, relative);
    const rel = path.relative(this.baseDir, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`path escapes base directory: ${relative}`);
    }
    return target;
  }

  async write(relative: string, content: string): Promise<void> {
    const target = this.safePath(relative);
    await fs.mkdir(path.dirname(target), { recursive: true });

    // 文件锁
    const lockPath = `${target}.lock`;
    await this.acquireLock(lockPath);

    try {
      // 备份
      await this.rotateBackups(target);

      // 原子写：写临时文件 + rename
      const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tmp, content, 'utf8');
      await fs.rename(tmp, target);
    } finally {
      await this.releaseLock(lockPath);
    }
  }

  async read(relative: string): Promise<string | null> {
    const target = this.safePath(relative);
    try {
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink()) {
        throw new Error(`refusing to read symlink: ${relative}`);
      }
      return await fs.readFile(target, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async rotateBackups(target: string): Promise<void> {
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile()) return;
    } catch {
      return; // 首次写入，无需备份
    }
    for (let i = this.backupCount - 1; i >= 1; i--) {
      const from = `${target}.bak.${i}`;
      const to = `${target}.bak.${i + 1}`;
      try {
        await fs.rename(from, to);
      } catch {
        // 不存在则跳过
      }
    }
    try {
      await fs.copyFile(target, `${target}.bak.1`);
    } catch {
      // 备份失败不阻塞主流程
    }
  }

  private async acquireLock(lockPath: string): Promise<void> {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(String(process.pid));
        await handle.close();
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    // 超时：强制覆盖（避免死锁）
    await fs.writeFile(lockPath, String(process.pid));
  }

  private async releaseLock(lockPath: string): Promise<void> {
    try {
      await fs.unlink(lockPath);
    } catch {
      // 忽略
    }
  }
}