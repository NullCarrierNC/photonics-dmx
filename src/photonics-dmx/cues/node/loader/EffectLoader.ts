import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { validateEffectFile } from '../schema/validation';
import {
  EffectFile,
  EffectMode,
  EffectReference
} from '../../types/nodeCueTypes';

export interface EffectFileSummary {
  path: string;
  groupId: string;
  groupName: string;
  effectCount: number;
  mode: EffectMode;
  updatedAt: number;
  errors?: string[];
}

export interface EffectListSummary {
  yarg: EffectFileSummary[];
  audio: EffectFileSummary[];
}

export interface EffectLoadResult {
  loaded: number;
  failed: number;
  errors: string[];
}

interface EffectLoaderOptions {
  baseDir: string;
}

const isJsonFile = (filename: string): boolean => filename.toLowerCase().endsWith('.json');

export class EffectLoader extends EventEmitter {
  private readonly baseDir: string;
  private readonly yargDir: string;
  private readonly audioDir: string;
  private watcher: FSWatcher | null = null;
  private summaries: EffectListSummary = { yarg: [], audio: [] };

  constructor(options: EffectLoaderOptions) {
    super();
    this.baseDir = options.baseDir;
    this.yargDir = path.join(this.baseDir, 'effects', 'yarg');
    this.audioDir = path.join(this.baseDir, 'effects', 'audio');
  }

  public async loadAll(): Promise<EffectLoadResult> {
    await this.ensureDirectories();

    const results = await Promise.all([
      this.loadDirectory('yarg'),
      this.loadDirectory('audio')
    ]);

    const summary = results.reduce<EffectLoadResult>((acc, curr) => ({
      loaded: acc.loaded + curr.loaded,
      failed: acc.failed + curr.failed,
      errors: acc.errors.concat(curr.errors)
    }), { loaded: 0, failed: 0, errors: [] });

    this.emit('changed', this.getSummary());
    return summary;
  }

  public async reload(): Promise<EffectLoadResult> {
    return this.loadAll();
  }

  public getSummary(): EffectListSummary {
    return {
      yarg: [...this.summaries.yarg],
      audio: [...this.summaries.audio]
    };
  }

  public async readFile(filePath: string): Promise<EffectFile> {
    const resolvedPath = this.resolvePath(filePath);
    const mode = this.getModeFromPath(resolvedPath);
    if (!mode) {
      throw new Error('Unsupported effect file path.');
    }

    const data = await fs.readFile(resolvedPath, 'utf-8');
    const parsed = JSON.parse(data);
    const validation = validateEffectFile(parsed);

    if (!validation.valid) {
      throw new Error(`Invalid effect file: ${validation.errors.join(', ')}`);
    }

    if (!validation.data) {
      throw new Error('Effect file validation returned no data');
    }

    return validation.data;
  }

  public async saveFile(mode: EffectMode, filename: string, content: EffectFile): Promise<{ success: boolean; path: string }> {
    if (content.mode !== mode) {
      throw new Error('File mode does not match payload mode.');
    }

    const validation = validateEffectFile(content);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const targetDir = mode === 'yarg' ? this.yargDir : this.audioDir;
    const sanitizedName = this.sanitizeFilename(filename);
    const filePath = this.resolveInDir(targetDir, sanitizedName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
    await this.loadFile(mode, filePath);

    this.emit('changed', this.getSummary());
    return { success: true, path: filePath };
  }

  public async deleteFile(filePath: string): Promise<{ success: boolean }> {
    const resolvedPath = this.resolvePath(filePath);
    const mode = this.getModeFromPath(resolvedPath);
    if (!mode) {
      throw new Error('Unsupported effect file path.');
    }

    await fs.rm(resolvedPath, { force: true });
    this.removeSummary(resolvedPath);
    this.emit('changed', this.getSummary());
    return { success: true };
  }

  /**
   * Load an effect file by reference (used at runtime to load referenced effects)
   */
  public async loadEffectByReference(ref: EffectReference, mode: EffectMode): Promise<EffectFile | null> {
    const dir = mode === 'yarg' ? this.yargDir : this.audioDir;
    const files = await fs.readdir(dir).catch(() => []);

    for (const file of files) {
      if (!isJsonFile(file)) {
        continue;
      }

      const filePath = path.join(dir, file);
      try {
        const effectFile = await this.readFile(filePath);
        if (effectFile.group.id === ref.effectFileId) {
          return effectFile;
        }
      } catch (error) {
        // Skip invalid files
        continue;
      }
    }

    return null;
  }

  public async startWatching(): Promise<void> {
    await this.ensureDirectories();

    this.watcher = chokidar.watch([this.yargDir, this.audioDir], {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    this.watcher.on('add', file => this.handleFileChange(file));
    this.watcher.on('change', file => this.handleFileChange(file));
    this.watcher.on('unlink', file => this.handleFileRemoved(file));
  }

  public async dispose(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.yargDir, { recursive: true });
    await fs.mkdir(this.audioDir, { recursive: true });
  }

  private async loadDirectory(mode: EffectMode): Promise<EffectLoadResult> {
    const dir = mode === 'yarg' ? this.yargDir : this.audioDir;
    const files = await fs.readdir(dir).catch(() => []);

    let loaded = 0;
    let failed = 0;
    const errors: string[] = [];
    const summaries: EffectFileSummary[] = [];

    for (const file of files) {
      if (!isJsonFile(file)) {
        continue;
      }

      const filePath = path.join(dir, file);
      try {
        const summary = await this.loadFile(mode, filePath);
        if (summary) {
          summaries.push(summary);
        }
        loaded++;
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        summaries.push({
          path: filePath,
          groupId: path.basename(file, '.json'),
          groupName: path.basename(file, '.json'),
          effectCount: 0,
          mode,
          updatedAt: Date.now(),
          errors: [message]
        });
        errors.push(`${path.basename(file)}: ${message}`);
      }
    }

    this.summaries[mode] = summaries;
    return { loaded, failed, errors };
  }

  private async loadFile(mode: EffectMode, filePath: string): Promise<EffectFileSummary | null> {
    const contents = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(contents);
    const validation = validateEffectFile(parsed);

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const file = validation.data;

    if (!file) {
      return { path: filePath, errors: ['Validation returned no data'], mode, updatedAt: Date.now() } as EffectFileSummary;
    }

    const summary: EffectFileSummary = {
      path: filePath,
      groupId: file.group.id,
      groupName: file.group.name,
      effectCount: file.effects.length,
      mode,
      updatedAt: Date.now()
    };

    this.updateSummary(summary);
    return summary;
  }

  private updateSummary(summary: EffectFileSummary): void {
    const summaries = summary.mode === 'yarg' ? this.summaries.yarg : this.summaries.audio;
    const existingIndex = summaries.findIndex(item => item.path === summary.path);
    if (existingIndex >= 0) {
      summaries[existingIndex] = summary;
    } else {
      summaries.push(summary);
    }
  }

  private removeSummary(filePath: string): void {
    this.summaries.yarg = this.summaries.yarg.filter(summary => summary.path !== filePath);
    this.summaries.audio = this.summaries.audio.filter(summary => summary.path !== filePath);
  }

  private async handleFileChange(filePath: string): Promise<void> {
    const mode = this.getModeFromPath(filePath);
    if (!mode || !isJsonFile(filePath)) {
      return;
    }

    try {
      await this.loadFile(mode, filePath);
      this.emit('changed', this.getSummary());
    } catch (error) {
      console.error('Failed to reload effect file', filePath, error);
    }
  }

  private handleFileRemoved(filePath: string): void {
    this.removeSummary(filePath);
    this.emit('changed', this.getSummary());
  }

  private getModeFromPath(filePath: string): EffectMode | null {
    if (this.isPathWithinDir(filePath, this.yargDir)) {
      return 'yarg';
    }
    if (this.isPathWithinDir(filePath, this.audioDir)) {
      return 'audio';
    }
    return null;
  }

  private sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename);
    if (!baseName || baseName === '.' || baseName === '..') {
      throw new Error('Invalid filename.');
    }
    if (baseName !== filename) {
      throw new Error('Invalid filename. Subdirectories are not allowed.');
    }
    return baseName.endsWith('.json') ? baseName : `${baseName}.json`;
  }

  private resolvePath(targetPath: string): string {
    return path.resolve(targetPath);
  }

  private resolveInDir(baseDir: string, filename: string): string {
    const resolvedBase = this.resolvePath(baseDir);
    const resolvedPath = this.resolvePath(path.join(resolvedBase, filename));
    if (!this.isPathWithinDir(resolvedPath, resolvedBase)) {
      throw new Error('Resolved path is outside of the allowed directory.');
    }
    return resolvedPath;
  }

  private isPathWithinDir(targetPath: string, baseDir: string): boolean {
    const resolvedBase = this.resolvePath(baseDir);
    const resolvedTarget = this.resolvePath(targetPath);
    return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
  }
}
