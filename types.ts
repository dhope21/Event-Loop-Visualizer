export enum TaskType {
  LOG = 'LOG',
  TIMEOUT = 'TIMEOUT',
  PROMISE = 'PROMISE',
  MAIN = 'MAIN', // The main script wrapper
}

export interface Task {
  id: string;
  type: TaskType;
  content: string; // The code string or message
  delay?: number; // For timeouts
  children?: Task[]; // Nested tasks (the callback body)
  line?: number; // Line number in the editor for highlighting
}

export interface WebApiTask extends Task {
  startTime: number;
  remainingTime: number;
}

export interface CallStackFrame {
  id: string;
  name: string;
  type: TaskType;
  linesOfCode?: Task[]; // The body of the function being executed
  currentLineIndex?: number; // Pointer to the next instruction in this frame
  highlightLine?: number; // The actual line number to highlight in editor
}

export interface EngineState {
  code: string;
  parsedTasks: Task[]; // The main script converted to tasks
  callStack: CallStackFrame[];
  webApis: WebApiTask[];
  microtaskQueue: Task[];
  macrotaskQueue: Task[];
  consoleOutput: string[];
  isRunning: boolean;
  speed: number; // ms delay between steps
  isFinished: boolean;
  activeLine: number | null; // Currently executed line number
}