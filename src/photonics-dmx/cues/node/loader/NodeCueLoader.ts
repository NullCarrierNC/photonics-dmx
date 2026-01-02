import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { validateNodeCueFile, validateAudioNodeCueFile, validateYargNodeCueFile } from '../schema/validation';
import {
  AudioNodeCueFile,
  NodeCueFile,
  NodeCueMode,
  YargNodeCueFile
} from '../../types/nodeCueTypes';
import { NodeCueCompilationError, NodeCueCompiler } from '../compiler/NodeCueCompiler';
import { YargCueRegistry } from '../../registries/YargCueRegistry';
import { AudioCueRegistry, AudioCueGroup } from '../../registries/AudioCueRegistry';
import type { ICueGroup } from '../../interfaces/INetCueGroup';
import { YargNodeCue } from '../runtime/YargNodeCue';
import { AudioNodeCue } from '../runtime/AudioNodeCue';
import { CueType } from '../../types/cueTypes';
import { AudioCueType, BuiltInAudioCues } from '../../types/audioCueTypes';
import { IAudioCue } from '../../interfaces/IAudioCue';
import { EffectRegistry } from '../runtime/EffectRegistry';
import { EffectCompiler } from '../compiler/EffectCompiler';
import type { EffectLoader } from './EffectLoader';
import type { EffectReference } from '../../types/nodeCueTypes';

export interface NodeCueFileSummary {
  path: string;
  groupId: string;
  groupName: string;
  cueCount: number;
  mode: NodeCueMode;
  updatedAt: number;
  errors?: string[];
}

export interface NodeCueListSummary {
  yarg: NodeCueFileSummary[];
  audio: NodeCueFileSummary[];
}

export interface NodeCueLoadResult {
  loaded: number;
  failed: number;
  errors: string[];
}

interface NodeCueLoaderOptions {
  baseDir: string;
  yargRegistry: YargCueRegistry;
  audioRegistry: AudioCueRegistry;
  effectLoader?: EffectLoader;
}

interface FileRegistration {
  mode: NodeCueMode;
  groupId: string;
}

const isJsonFile = (filename: string): boolean => filename.toLowerCase().endsWith('.json');

export class NodeCueLoader extends EventEmitter {
  private readonly baseDir: string;
  private readonly yargDir: string;
  private readonly audioDir: string;
  private watcher: FSWatcher | null = null;
  private summaries: NodeCueListSummary = { yarg: [], audio: [] };
  private fileRegistrations: Map<string, FileRegistration> = new Map();
  private customAudioCueTypes: Set<AudioCueType> = new Set();

  constructor(
    private readonly options: NodeCueLoaderOptions
  ) {
    super();
    this.baseDir = options.baseDir;
    this.yargDir = path.join(this.baseDir, 'node-cues', 'yarg');
    this.audioDir = path.join(this.baseDir, 'node-cues', 'audio');
  }

  public async loadAll(): Promise<NodeCueLoadResult> {
    await this.ensureDirectories();
    this.customAudioCueTypes.clear();

    const results = await Promise.all([
      this.loadDirectory('yarg'),
      this.loadDirectory('audio')
    ]);

    const summary = results.reduce<NodeCueLoadResult>((acc, curr) => ({
      loaded: acc.loaded + curr.loaded,
      failed: acc.failed + curr.failed,
      errors: acc.errors.concat(curr.errors)
    }), { loaded: 0, failed: 0, errors: [] });

    this.emit('changed', this.getSummary());
    return summary;
  }

  public async reload(): Promise<NodeCueLoadResult> {
    return this.loadAll();
  }

  public getSummary(): NodeCueListSummary {
    return {
      yarg: [...this.summaries.yarg],
      audio: [...this.summaries.audio]
    };
  }

  public async readFile(filePath: string): Promise<NodeCueFile> {
    const mode = this.getModeFromPath(filePath);
    if (!mode) {
      throw new Error('Unsupported node cue path.');
    }

    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    const validation = mode === 'yarg'
      ? validateYargNodeCueFile(parsed)
      : validateAudioNodeCueFile(parsed);

    if (!validation.valid) {
      throw new Error(`Invalid node cue file: ${validation.errors.join(', ')}`);
    }

    return validation.data;
  }

  public async saveFile(mode: NodeCueMode, filename: string, content: NodeCueFile): Promise<{ success: boolean; path: string }> {
    if (content.mode !== mode) {
      throw new Error('File mode does not match payload mode.');
    }

    const validation = validateNodeCueFile(content);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const targetDir = mode === 'yarg' ? this.yargDir : this.audioDir;
    const sanitizedName = filename.endsWith('.json') ? filename : `${filename}.json`;
    const filePath = path.join(targetDir, sanitizedName);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
    await this.loadFile(mode, filePath);

    this.emit('changed', this.getSummary());
    return { success: true, path: filePath };
  }

  public async deleteFile(filePath: string): Promise<{ success: boolean }> {
    const mode = this.getModeFromPath(filePath);
    if (!mode) {
      throw new Error('Unsupported node cue path.');
    }

    await fs.rm(filePath, { force: true });
    this.unregisterFile(filePath);
    this.emit('changed', this.getSummary());
    return { success: true };
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

  public getAvailableCueTypes(mode: NodeCueMode): string[] {
    if (mode === 'yarg') {
      return Object.values(CueType);
    }

    const registryTypes = new Set(this.options.audioRegistry.getAvailableCueTypes(true));
    this.customAudioCueTypes.forEach(type => registryTypes.add(type));
    Object.values(BuiltInAudioCues).forEach(type => registryTypes.add(type));
    return Array.from(registryTypes);
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.yargDir, { recursive: true });
    await fs.mkdir(this.audioDir, { recursive: true });
  }

  private async loadDirectory(mode: NodeCueMode): Promise<NodeCueLoadResult> {
    const dir = mode === 'yarg' ? this.yargDir : this.audioDir;
    const files = await fs.readdir(dir).catch(() => []);

    let loaded = 0;
    let failed = 0;
    const errors: string[] = [];
    const summaries: NodeCueFileSummary[] = [];

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
          cueCount: 0,
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

  private async loadFile(mode: NodeCueMode, filePath: string): Promise<NodeCueFileSummary | null> {
    const contents = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(contents);
    const validation = mode === 'yarg'
      ? validateYargNodeCueFile(parsed)
      : validateAudioNodeCueFile(parsed);

    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const file = validation.data;
    await this.registerFile(filePath, mode, file);

    const summary: NodeCueFileSummary = {
      path: filePath,
      groupId: file.group.id,
      groupName: file.group.name,
      cueCount: file.cues.length,
      mode,
      updatedAt: Date.now()
    };

    this.updateSummary(summary);
    return summary;
  }

  private async registerFile(filePath: string, mode: NodeCueMode, file: NodeCueFile): Promise<void> {
    this.unregisterFile(filePath);

    if (mode === 'yarg') {
      const group = await this.buildYargGroup(file as YargNodeCueFile);
      this.options.yargRegistry.registerGroup(group);
    } else {
      const group = await this.buildAudioGroup(file as AudioNodeCueFile);
      this.options.audioRegistry.registerGroup(group);
      file.cues.forEach(cue => this.customAudioCueTypes.add(cue.cueTypeId));
    }

    this.fileRegistrations.set(filePath, { mode, groupId: file.group.id });
  }

  private unregisterFile(filePath: string): void {
    const registration = this.fileRegistrations.get(filePath);
    if (!registration) {
      return;
    }

    if (registration.mode === 'yarg') {
      this.options.yargRegistry.unregisterGroup(registration.groupId);
      this.summaries.yarg = this.summaries.yarg.filter(summary => summary.path !== filePath);
    } else {
      this.options.audioRegistry.unregisterGroup(registration.groupId);
      this.summaries.audio = this.summaries.audio.filter(summary => summary.path !== filePath);
    }

    this.fileRegistrations.delete(filePath);
  }

  private async buildYargGroup(file: YargNodeCueFile): Promise<ICueGroup> {
    const cueMap = new Map<CueType, YargNodeCue>();

    for (const cue of file.cues) {
      if (cueMap.has(cue.cueType)) {
        throw new NodeCueCompilationError(`Duplicate cueType '${cue.cueType}' in group '${file.group.name}'.`);
      }

      const compiled = NodeCueCompiler.compileYargCue(cue);
      // Attach group variables to compiled cue for runtime initialization
      (compiled as any).groupVariables = file.group.variables ?? [];
      
      // Build effect registry for this cue
      const effectRegistry = await this.buildEffectRegistry(cue.effects ?? [], 'yarg');
      
      cueMap.set(cue.cueType, new YargNodeCue(file.group.id, compiled, effectRegistry));
    }

    if (cueMap.size === 0) {
      throw new NodeCueCompilationError('Group must contain at least one cue definition.');
    }

    return {
      id: file.group.id,
      name: file.group.name,
      description: file.group.description,
      cues: cueMap
    };
  }

  private async buildAudioGroup(file: AudioNodeCueFile): Promise<AudioCueGroup> {
    const cueMap = new Map<AudioCueType, IAudioCue>();

    for (const cue of file.cues) {
      if (cueMap.has(cue.cueTypeId)) {
        throw new NodeCueCompilationError(`Duplicate audio cue id '${cue.cueTypeId}' in group '${file.group.name}'.`);
      }

      const compiled = NodeCueCompiler.compileAudioCue(cue);
      // Attach group variables to compiled cue for runtime initialization
      (compiled as any).groupVariables = file.group.variables ?? [];
      
      // Build effect registry for this cue
      const effectRegistry = await this.buildEffectRegistry(cue.effects ?? [], 'audio');
      
      cueMap.set(cue.cueTypeId, new AudioNodeCue(file.group.id, compiled, effectRegistry));
    }

    if (cueMap.size === 0) {
      throw new NodeCueCompilationError('Group must contain at least one audio cue definition.');
    }

    return {
      id: file.group.id,
      name: file.group.name,
      description: file.group.description ?? 'Node-based audio cues',
      cues: cueMap
    };
  }

  private updateSummary(summary: NodeCueFileSummary): void {
    const summaries = summary.mode === 'yarg' ? this.summaries.yarg : this.summaries.audio;
    const existingIndex = summaries.findIndex(item => item.path === summary.path);
    if (existingIndex >= 0) {
      summaries[existingIndex] = summary;
    } else {
      summaries.push(summary);
    }
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
      console.error('Failed to reload node cue file', filePath, error);
    }
  }

  private handleFileRemoved(filePath: string): void {
    this.unregisterFile(filePath);
    this.emit('changed', this.getSummary());
  }

  private getModeFromPath(filePath: string): NodeCueMode | null {
    if (filePath.startsWith(this.yargDir)) {
      return 'yarg';
    }
    if (filePath.startsWith(this.audioDir)) {
      return 'audio';
    }
    return null;
  }

  /**
   * Builds an EffectRegistry for a cue by loading and compiling all referenced effects.
   */
  private async buildEffectRegistry(effectReferences: EffectReference[], mode: NodeCueMode): Promise<EffectRegistry> {
    const registry = new EffectRegistry();

    if (!this.options.effectLoader || effectReferences.length === 0) {
      return registry;
    }

    for (const effectRef of effectReferences) {
      try {
        const effectFile = await this.options.effectLoader.loadEffectByReference(effectRef, mode);
        
        if (!effectFile) {
          console.warn(`Effect file ${effectRef.effectFileId} not found, skipping effect ${effectRef.effectId}`);
          continue;
        }

        // Find the effect with the matching ID
        const effect = effectFile.effects.find(e => e.id === effectRef.effectId);
        
        if (!effect) {
          console.warn(`Effect ${effectRef.effectId} not found in file ${effectRef.effectFileId}, skipping`);
          continue;
        }

        // Compile the effect
        const compiledEffect = EffectCompiler.compile(effect);
        
        // Register the effect with its ID
        registry.registerEffect(effectRef.effectId, compiledEffect);
      } catch (error) {
        console.error(`Failed to load/compile effect ${effectRef.effectId}:`, error);
      }
    }

    return registry;
  }
}

