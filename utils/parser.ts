import { Task, TaskType } from '../types';

// A unique ID generator
let idCounter = 0;
const genId = () => `task-${idCounter++}`;

/**
 * Parses a subset of JS for visualization.
 * Supports:
 * - console.log('msg')
 * - setTimeout(() => { ... }, delay)
 * - setImmediate(() => { ... })
 * - Promise.resolve().then(() => { ... })
 * - queueMicrotask(() => { ... })
 * - process.nextTick(() => { ... })
 */
export const parseCode = (code: string): Task[] => {
  idCounter = 0;
  const lines = code.split('\n');
  
  const parseBlock = (lines: string[], startLine: number, endLine: number): Task[] => {
    const blockTasks: Task[] = [];
    
    for (let i = startLine; i < endLine; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine || rawLine.startsWith('//')) continue;

      // 1. Parse console.log
      const logMatch = rawLine.match(/console\.log\((['"`])(.+?)\1\)/);
      if (logMatch) {
        blockTasks.push({
          id: genId(),
          type: TaskType.LOG,
          content: logMatch[2], // The message
          line: i + 1
        });
        continue;
      }

      // 2. Parse setTimeout
      // Looks for: setTimeout(() => { or setTimeout( () => {
      const timeoutStart = rawLine.match(/setTimeout\(\s*\(\)\s*=>\s*\{/);
      if (timeoutStart) {
        // Find closing brace
        let balance = 1;
        let j = i + 1;
        for (; j < endLine; j++) {
          if (lines[j].includes('{')) balance++;
          if (lines[j].includes('}')) balance--;
          if (balance === 0) break;
        }
        
        // Extract delay from the closing line: }, 1000);
        const closingLine = lines[j] || '';
        const delayMatch = closingLine.match(/\},\s*(\d+)\);?/);
        const delay = delayMatch ? parseInt(delayMatch[1], 10) : 0;

        const children = parseBlock(lines, i + 1, j);
        
        blockTasks.push({
          id: genId(),
          type: TaskType.TIMEOUT,
          content: 'setTimeout',
          delay,
          children,
          line: i + 1
        });
        
        i = j; // Advance outer loop
        continue;
      }

      // 3. Parse setImmediate
      const immediateStart = rawLine.match(/setImmediate\(\s*\(\)\s*=>\s*\{/);
      if (immediateStart) {
         let balance = 1;
         let j = i + 1;
         for (; j < endLine; j++) {
           if (lines[j].includes('{')) balance++;
           if (lines[j].includes('}')) balance--;
           if (balance === 0) break;
         }
         
         const children = parseBlock(lines, i + 1, j);
         
         blockTasks.push({
           id: genId(),
           type: TaskType.TIMEOUT, // Treat as Timeout for macrotask queue
           content: 'setImmediate',
           delay: 0,
           children,
           line: i + 1
         });
         i = j;
         continue;
      }

      // 4. Parse Promise.resolve().then / queueMicrotask / process.nextTick
      const microStart = rawLine.match(/(Promise\.resolve\(\)\.then|queueMicrotask|process\.nextTick)\(\s*\(\)\s*=>\s*\{/);
      if (microStart) {
        // Find closing brace
        let balance = 1;
        let j = i + 1;
        for (; j < endLine; j++) {
          if (lines[j].includes('{')) balance++;
          if (lines[j].includes('}')) balance--;
          if (balance === 0) break;
        }

        const children = parseBlock(lines, i + 1, j);
        
        // Determine label
        let label = 'Promise.then';
        if (rawLine.includes('queueMicrotask')) label = 'queueMicrotask';
        if (rawLine.includes('process.nextTick')) label = 'process.nextTick';

        blockTasks.push({
          id: genId(),
          type: TaskType.PROMISE,
          content: label,
          children,
          line: i + 1
        });

        i = j;
        continue;
      }
    }
    return blockTasks;
  };

  return parseBlock(lines, 0, lines.length);
};