import { describe, it, expect } from 'vitest';
import type {
  Part,
  Message,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  GetTaskRequest,
  ListTasksRequest,
  ListTasksResponse,
  CancelTaskRequest,
  StreamResponse,
  Artifact,
  Task,
  TaskState,
  AgentExtension,
} from './types';
import {
  generateMessageId,
  generateContextId,
  generateTaskId,
  createTextMessage,
  createTaskStatus,
  createArtifact,
  serializeMessageToXml,
} from './helpers';

describe('A2A Types', () => {
  describe('createTextMessage', () => {
    it('produces conformant Message with required fields', () => {
      const msg = createTextMessage('sender-1', 'Hello');
      expect(msg.messageId).toBeTruthy();
      expect(typeof msg.messageId).toBe('string');
      expect(msg.role).toBe('user');
      expect(msg.parts).toHaveLength(1);
      expect(msg.parts[0].text).toBe('Hello');
      expect(msg.parts[0].mediaType).toBe('text/plain');
      expect(msg.metadata).toBeDefined();
      expect(msg.metadata?.fromId).toBe('sender-1');
    });

    it('includes contextId when provided', () => {
      const msg = createTextMessage('sender-1', 'Hello', { contextId: 'ctx-123' });
      expect(msg.contextId).toBe('ctx-123');
    });

    it('includes hopCount in metadata defaulting to 0', () => {
      const msg = createTextMessage('sender-1', 'Hello');
      expect(msg.metadata?.hopCount).toBe(0);
    });
  });

  describe('Part', () => {
    it('supports text content', () => {
      const part: Part = { text: 'hello', mediaType: 'text/plain' };
      expect(part.text).toBe('hello');
      expect(part.mediaType).toBe('text/plain');
    });

    it('supports data content', () => {
      const part: Part = { data: { key: 'value' }, mediaType: 'application/json' };
      expect(part.data).toEqual({ key: 'value' });
      expect(part.mediaType).toBe('application/json');
    });
  });

  describe('serializeMessageToXml', () => {
    it('produces valid XML envelope', () => {
      const msg = createTextMessage('agent-1', 'Test content', {
        contextId: 'ctx-42',
        fromName: 'Agent One',
      });
      const xml = serializeMessageToXml(msg);
      expect(xml).toContain('<agent-message');
      expect(xml).toContain('from-id="agent-1"');
      expect(xml).toContain('from-name="Agent One"');
      expect(xml).toContain(`message-id="${msg.messageId}"`);
      expect(xml).toContain('context-id="ctx-42"');
      expect(xml).toContain('hop-count="0"');
      expect(xml).toContain('<content>Test content</content>');
    });

    it('escapes special characters in content', () => {
      const msg = createTextMessage('s', 'a < b > c & d "e"');
      const xml = serializeMessageToXml(msg);
      expect(xml).toContain('a &lt; b &gt; c &amp; d &quot;e&quot;');
    });

    it('handles message without contextId', () => {
      const msg = createTextMessage('s', 'hi');
      delete msg.contextId;
      const xml = serializeMessageToXml(msg);
      expect(xml).toContain('context-id=""');
      expect(xml).not.toContain('undefined');
    });
  });

  describe('generateMessageId', () => {
    it('produces unique IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateContextId', () => {
    it('produces unique IDs with ctx- prefix', () => {
      const id = generateContextId();
      expect(id.startsWith('ctx-')).toBe(true);
    });
  });

  describe('TaskStatusUpdateEvent', () => {
    it('shape validation — all fields present', () => {
      const evt: TaskStatusUpdateEvent = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        status: { state: 'working', timestamp: new Date().toISOString() },
        metadata: { source: 'test' },
      };
      expect(evt.taskId).toBe('task-1');
      expect(evt.contextId).toBe('ctx-1');
      expect(evt.status.state).toBe('working');
      expect(evt.metadata?.source).toBe('test');
    });
  });

  describe('TaskArtifactUpdateEvent', () => {
    it('shape validation — including append, lastChunk, metadata', () => {
      const evt: TaskArtifactUpdateEvent = {
        taskId: 'task-2',
        contextId: 'ctx-2',
        artifact: { artifactId: 'a-1', parts: [{ text: 'hi' }] },
        append: true,
        lastChunk: false,
        metadata: { seq: 1 },
      };
      expect(evt.taskId).toBe('task-2');
      expect(evt.contextId).toBe('ctx-2');
      expect(evt.artifact.artifactId).toBe('a-1');
      expect(evt.append).toBe(true);
      expect(evt.lastChunk).toBe(false);
      expect(evt.metadata?.seq).toBe(1);
    });
  });

  describe('GetTaskRequest', () => {
    it('shape validation', () => {
      const req: GetTaskRequest = { id: 'task-1', historyLength: 5 };
      expect(req.id).toBe('task-1');
      expect(req.historyLength).toBe(5);
    });
  });

  describe('ListTasksRequest', () => {
    it('shape validation', () => {
      const req: ListTasksRequest = {
        contextId: 'ctx-1',
        status: 'working',
        historyLength: 0,
      };
      expect(req.contextId).toBe('ctx-1');
      expect(req.status).toBe('working');
      expect(req.historyLength).toBe(0);
    });
  });

  describe('ListTasksResponse', () => {
    it('wrapper has required fields — tasks, nextPageToken, pageSize, totalSize', () => {
      const resp: ListTasksResponse = {
        tasks: [],
        nextPageToken: '',
        pageSize: 10,
        totalSize: 0,
      };
      expect(resp.tasks).toEqual([]);
      expect(resp.nextPageToken).toBe('');
      expect(resp.pageSize).toBe(10);
      expect(resp.totalSize).toBe(0);
    });
  });

  describe('CancelTaskRequest', () => {
    it('shape validation', () => {
      const req: CancelTaskRequest = { id: 'task-1', metadata: { reason: 'timeout' } };
      expect(req.id).toBe('task-1');
      expect(req.metadata?.reason).toBe('timeout');
    });
  });

  describe('StreamResponse', () => {
    it('shape has all 4 oneof members', () => {
      const resp: StreamResponse = {
        task: {
          id: 't',
          contextId: 'c',
          status: { state: 'completed' },
        },
        message: { messageId: 'm', role: 'agent', parts: [] },
        statusUpdate: {
          taskId: 't',
          contextId: 'c',
          status: { state: 'working' },
        },
        artifactUpdate: {
          taskId: 't',
          contextId: 'c',
          artifact: { artifactId: 'a', parts: [] },
        },
      };
      expect(resp.task).toBeDefined();
      expect(resp.message).toBeDefined();
      expect(resp.statusUpdate).toBeDefined();
      expect(resp.artifactUpdate).toBeDefined();
    });
  });

  describe('generateTaskId', () => {
    it('format — task- prefix and uniqueness', () => {
      const id1 = generateTaskId();
      const id2 = generateTaskId();
      expect(id1.startsWith('task-')).toBe(true);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createTaskStatus', () => {
    it('sets state correctly', () => {
      const status = createTaskStatus('working');
      expect(status.state).toBe('working');
    });

    it('includes ISO timestamp', () => {
      const status = createTaskStatus('submitted');
      expect(status.timestamp).toBeDefined();
      expect(() => new Date(status.timestamp!)).not.toThrow();
      expect(new Date(status.timestamp!).toISOString()).toBe(status.timestamp);
    });

    it('attaches optional message as full Message object', () => {
      const msg: Message = {
        messageId: 'msg-1',
        role: 'agent',
        parts: [{ text: 'done' }],
      };
      const status = createTaskStatus('completed', msg);
      expect(status.message).toBe(msg);
      expect(status.message?.messageId).toBe('msg-1');
      expect(status.message?.parts[0].text).toBe('done');
    });
  });

  describe('createArtifact', () => {
    it('creates valid Artifact with parts', () => {
      const artifact = createArtifact('report', 'Hello world');
      expect(artifact.name).toBe('report');
      expect(artifact.parts).toHaveLength(1);
      expect(artifact.parts[0].text).toBe('Hello world');
    });

    it('generates unique artifactId', () => {
      const a1 = createArtifact('a', 'x');
      const a2 = createArtifact('b', 'y');
      expect(a1.artifactId).not.toBe(a2.artifactId);
      expect(a1.artifactId.startsWith('artifact-')).toBe(true);
    });

    it('sets mediaType text/plain for text', () => {
      const artifact = createArtifact('doc', 'content');
      expect(artifact.parts[0].mediaType).toBe('text/plain');
    });

    it('Artifact type has extensions field capability', () => {
      const artifact: Artifact = {
        artifactId: 'a-1',
        parts: [{ text: 'hi' }],
        extensions: ['ext-1', 'ext-2'],
      };
      expect(artifact.extensions).toEqual(['ext-1', 'ext-2']);
    });
  });
});
