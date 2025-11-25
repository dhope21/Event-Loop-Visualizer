import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, RefreshCw, Layers, Terminal, Zap, Box, GripVertical, CheckCircle, XCircle, HelpCircle } from './components/Icons';
import { VizBox } from './components/Container';
import { Task, TaskType, EngineState, CallStackFrame, WebApiTask } from './types';
import { parseCode } from './utils/parser';
import { generateCode, INITIAL_FEATURES, FeatureKey } from './constants';

const initialState: EngineState = {
  code: '',
  parsedTasks: [],
  callStack: [],
  webApis: [],
  microtaskQueue: [],
  macrotaskQueue: [],
  consoleOutput: [],
  isRunning: false,
  speed: 1000,
  isFinished: false,
  activeLine: null,
};

// Helper to recursively find all console.logs in the task tree
const extractLogsRecursive = (tasks: Task[]): string[] => {
  let logs: string[] = [];
  for (const task of tasks) {
    if (task.type === TaskType.LOG) {
      logs.push(task.content);
    }
    if (task.children && task.children.length > 0) {
      logs = [...logs, ...extractLogsRecursive(task.children)];
    }
  }
  return logs;
};

export default function App() {
  // State
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>(INITIAL_FEATURES);
  const [code, setCode] = useState(() => generateCode('simple', INITIAL_FEATURES));
  const [engine, setEngine] = useState<EngineState>({ ...initialState, code });
  
  // Prediction Game State
  const [prediction, setPrediction] = useState<string[]>([]);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);

  // Refs for Scroll Sync
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlighterRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // -- Engine Logic --

  const resetEngine = useCallback((newCode: string, autoPlay: boolean = false) => {
    const tasks = parseCode(newCode);
    const mainFrame: CallStackFrame = {
      id: 'main',
      name: 'main()',
      type: TaskType.MAIN,
      linesOfCode: tasks,
      currentLineIndex: 0,
      highlightLine: 0
    };

    setEngine((prev) => ({
      ...initialState,
      code: newCode,
      parsedTasks: tasks,
      callStack: [mainFrame], // Start with Main on stack
      activeLine: null,
      isRunning: autoPlay,
      speed: prev.speed, // Persist current speed
    }));

    // Extract logs and shuffle for prediction
    const logs = extractLogsRecursive(tasks);
    // Shuffle logs
    for (let i = logs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [logs[i], logs[j]] = [logs[j], logs[i]];
    }
    setPrediction(logs);

  }, []);

  // Load initial code
  useEffect(() => {
    resetEngine(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = (complexity: 'simple' | 'complex') => {
    const newCode = generateCode(complexity, features);
    setCode(newCode);
    resetEngine(newCode);
  };

  const handleFeatureToggle = (key: FeatureKey) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const step = useCallback(() => {
    setEngine((prev) => {
      // 1. Deep copy parts we mutate
      let stack = [...prev.callStack];
      let webApis = [...prev.webApis];
      let microQueue = [...prev.microtaskQueue];
      let macroQueue = [...prev.macrotaskQueue];
      let consoleOut = [...prev.consoleOutput];
      let isFinished = false;
      let activeLine = prev.activeLine;

      // -- EVENT LOOP LOGIC --
      
      // A. If Stack is NOT empty, execute top frame
      if (stack.length > 0) {
        const frameIndex = stack.length - 1;
        const frame = { ...stack[frameIndex] };
        
        // If frame is finished (no more lines), pop it
        if (!frame.linesOfCode || frame.currentLineIndex! >= frame.linesOfCode.length) {
          stack.pop();
          // We finished a function, clear highlight (or moving to next event loop tick)
          return { ...prev, callStack: stack, activeLine: null };
        }

        // Get current instruction
        const task = frame.linesOfCode[frame.currentLineIndex!];
        
        // Advance frame pointer for NEXT tick (unless we push new frame)
        frame.currentLineIndex!++;
        // Update the stack with advanced frame temporarily
        stack[frameIndex] = frame;

        // Highlight line
        if (task.line) activeLine = task.line;

        // Execute Instruction
        switch (task.type) {
          case TaskType.LOG:
            consoleOut.push(task.content);
            break;
            
          case TaskType.TIMEOUT:
            // Add to Web APIs
            webApis.push({
              ...task,
              startTime: Date.now(),
              remainingTime: task.delay || 0
            });
            break;

          case TaskType.PROMISE:
            // Promise.then adds callback to Microtask Queue immediately (simplified)
            if (task.children) {
              const microTask: Task = {
                id: `micro-${Date.now()}-${Math.random()}`,
                type: TaskType.PROMISE,
                content: task.content === 'process.nextTick' ? 'process.nextTick' : 'Promise Callback',
                children: task.children, // The callback body
                line: task.line
              };
              microQueue.push(microTask);
            }
            break;
        }

        return {
          ...prev,
          callStack: stack,
          webApis,
          microtaskQueue: microQueue,
          consoleOutput: consoleOut,
          activeLine,
        };
      }

      // B. Stack is Empty. Check Queues.
      // Priority: Microtasks > Rendering (skipped) > Macrotasks
      
      // 1. Microtasks
      if (microQueue.length > 0) {
        const nextMicro = microQueue.shift()!;
        // Create a new Stack Frame for the callback
        const newFrame: CallStackFrame = {
          id: nextMicro.id,
          name: nextMicro.content, // 'Promise Callback' or 'process.nextTick'
          type: TaskType.PROMISE,
          linesOfCode: nextMicro.children || [],
          currentLineIndex: 0,
          highlightLine: nextMicro.line
        };
        stack.push(newFrame);
        // Highlight the definition line of the task (e.g., Promise.then line) before entering body
        return { 
          ...prev, 
          callStack: stack, 
          microtaskQueue: microQueue,
          activeLine: nextMicro.line || null
        };
      }

      // 2. Macrotasks
      if (macroQueue.length > 0) {
        const nextMacro = macroQueue.shift()!;
        const newFrame: CallStackFrame = {
          id: nextMacro.id,
          name: nextMacro.content === 'setImmediate' ? 'setImmediate' : 'setTimeout',
          type: TaskType.TIMEOUT,
          linesOfCode: nextMacro.children || [],
          currentLineIndex: 0,
          highlightLine: nextMacro.line
        };
        stack.push(newFrame);
        // Highlight the definition line (e.g., setTimeout line) before entering body
        return { 
          ...prev, 
          callStack: stack, 
          macrotaskQueue: macroQueue,
          activeLine: nextMacro.line || null
        };
      }

      // 3. If everything is empty, we are finished (or waiting for WebAPI)
      if (webApis.length === 0) {
        isFinished = true;
        activeLine = null;
      }

      return { 
        ...prev, 
        isFinished, 
        activeLine, 
        isRunning: isFinished ? false : prev.isRunning 
      };
    });
  }, []);

  // -- Web API Timer Effect --
  useEffect(() => {
    const timer = setInterval(() => {
      setEngine((prev) => {
        if (prev.webApis.length === 0) return prev;

        const updatedWebApis: WebApiTask[] = [];
        const newMacrotasks = [...prev.macrotaskQueue];
        let hasChanges = false;

        prev.webApis.forEach(api => {
          if (api.remainingTime <= 0) {
            // Move to Macrotask Queue
            newMacrotasks.push({
              ...api,
              content: api.content === 'setImmediate' ? 'setImmediate' : 'Timeout Callback'
            });
            hasChanges = true;
          } else {
            // Decrement
            updatedWebApis.push({
              ...api,
              remainingTime: api.remainingTime - 100 
            });
            hasChanges = true;
          }
        });

        if (!hasChanges) return prev;

        return {
          ...prev,
          webApis: updatedWebApis,
          macrotaskQueue: newMacrotasks
        };
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);


  // -- Auto Play Effect --
  useEffect(() => {
    let interval: any;
    if (engine.isRunning && !engine.isFinished) {
      interval = setInterval(() => {
        step();
      }, engine.speed);
    }
    return () => clearInterval(interval);
  }, [engine.isRunning, engine.isFinished, engine.speed, step]);

  // -- Scroll Sync & Auto-Scroll Effect --
  
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlighterRef.current) {
      highlighterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Auto-scroll to active line
  useEffect(() => {
    if (engine.activeLine && textareaRef.current) {
      const lineHeight = 24; // Fixed line height
      const targetScroll = (engine.activeLine - 1) * lineHeight;
      const currentScroll = textareaRef.current.scrollTop;
      const viewHeight = textareaRef.current.clientHeight;

      // Only scroll if line is out of view
      if (targetScroll < currentScroll || targetScroll > currentScroll + viewHeight - lineHeight * 2) {
         textareaRef.current.scrollTo({
            top: targetScroll - viewHeight / 2 + lineHeight, // Center it
            behavior: 'smooth'
         });
      }
    }
  }, [engine.activeLine]);


  // -- UI Handlers --

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
  };

  const togglePlay = () => {
    if (engine.isFinished) {
      resetEngine(code, true);
    } else {
      setEngine(prev => ({ ...prev, isRunning: !prev.isRunning }));
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEngine(prev => ({ ...prev, speed: Number(e.target.value) }));
  };

  // -- Drag and Drop Handlers --

  const handleDragStart = (index: number) => {
    setDragSourceIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); // allow drop
    if (dragSourceIndex === null) return;
    if (dragSourceIndex !== index) {
       const newItems = [...prediction];
       const [removed] = newItems.splice(dragSourceIndex, 1);
       newItems.splice(index, 0, removed);
       setPrediction(newItems);
       setDragSourceIndex(index);
    }
  };

  const handleDrop = () => {
    setDragSourceIndex(null);
  };

  const FEATURE_LABELS: Record<FeatureKey, string> = {
    log: 'Log',
    timeout: 'setTimeout',
    promise: 'Promise',
    microtask: 'queueMicrotask',
    nextTick: 'process.nextTick',
    setImmediate: 'setImmediate'
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans">
      
      {/* HEADER */}
      <header className="flex-none h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <RefreshCw className="w-5 h-5 text-white animate-[spin_10s_linear_infinite]" /> 
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Event Loop Visualizer</h1>
            <p className="text-xs text-slate-400">JS Runtime Simulation</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-4 bg-slate-900/50 p-2 rounded-lg border border-slate-700">
             <span className="text-xs text-slate-400 font-mono">Speed: {engine.speed}ms</span>
             <input 
               type="range" 
               min="100" 
               max="2000" 
               step="100" 
               value={engine.speed} 
               onChange={handleSpeedChange}
               className="w-24 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
             />
          </div>

          <button 
            onClick={() => resetEngine(code)}
            className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-300"
            title="Reset"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          
          <button 
            onClick={step}
            className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-300"
            title="Step Forward"
            disabled={engine.isRunning || engine.isFinished}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button 
            onClick={togglePlay}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
              engine.isRunning 
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/50 hover:bg-amber-500/20' 
                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
            }`}
          >
            {engine.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {engine.isRunning ? 'Pause' : (engine.isFinished ? 'Replay' : 'Run')}
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT: CODE EDITOR */}
        <div className="w-1/3 min-w-[350px] border-r border-slate-700 flex flex-col bg-slate-900">
          
          {/* FEATURE TOGGLES */}
          <div className="bg-slate-800/80 p-2 border-b border-slate-700">
             <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Include Features:</div>
             <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map(key => (
                   <label key={key} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 hover:text-white select-none">
                      <input 
                        type="checkbox" 
                        checked={features[key]} 
                        onChange={() => handleFeatureToggle(key)}
                        className="rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-0 w-3 h-3"
                      />
                      {FEATURE_LABELS[key]}
                   </label>
                ))}
             </div>
          </div>

          <div className="flex-none p-2 bg-slate-800/50 border-b border-slate-700 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2">Input Script</span>
            <div className="flex gap-2">
               <button onClick={() => handleGenerate('simple')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">Easy</button>
               <button onClick={() => handleGenerate('complex')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">Complex</button>
            </div>
          </div>
          <div className="flex-1 relative font-mono text-sm">
             {/* Line Highlighter Overlay - No Scrollbar, syncs via JS */}
             <div ref={highlighterRef} className="absolute inset-0 overflow-hidden pointer-events-none mt-[16px] z-0">
                {code.split('\n').map((_, i) => (
                   <div 
                      key={i} 
                      className={`h-[24px] w-full transition-colors duration-200 ${
                         (engine.activeLine === i + 1) ? 'bg-blue-500/20 border-l-2 border-blue-500' : ''
                      }`}
                   />
                ))}
             </div>
             
             {/* Main Editor Area */}
             <div className="flex h-full relative z-10">
                {/* Line Numbers */}
                <div ref={lineNumbersRef} className="flex-none w-10 bg-slate-900 text-slate-600 text-right pr-2 pt-4 select-none overflow-hidden">
                  {code.split('\n').map((_, i) => <div key={i} className="h-[24px] leading-[24px]">{i + 1}</div>)}
                </div>
                
                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={handleCodeChange}
                  onScroll={handleScroll}
                  spellCheck={false}
                  className="flex-1 bg-transparent text-slate-300 p-0 pt-4 pl-2 outline-none resize-none leading-[24px] overflow-auto whitespace-pre"
                />
             </div>
          </div>
        </div>

        {/* CENTER: VISUALIZATION */}
        <div className="flex-1 flex flex-col p-4 gap-4 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
          
          {/* Top Row: Call Stack & Event Loop & Web APIs */}
          <div className="flex-1 flex gap-4 min-h-0">
            
            {/* CALL STACK */}
            <div className="w-1/3">
              <VizBox title="Call Stack" color="blue-400" icon={<Layers className="w-4 h-4 text-blue-400"/>}>
                <div className="flex flex-col-reverse gap-2 h-full justify-start">
                  {engine.callStack.map((frame, i) => (
                    <div key={`${frame.id}-${i}`} className="bg-blue-500/20 border border-blue-500/50 p-3 rounded text-blue-200 shadow-lg animate-[slideInUp_0.3s_ease-out]">
                      <div className="font-bold text-sm">{frame.name}</div>
                      <div className="text-xs opacity-75 font-mono truncate">
                         {frame.linesOfCode?.[frame.currentLineIndex!]?.content || 'executing...'}
                      </div>
                    </div>
                  ))}
                  {engine.callStack.length === 0 && (
                     <div className="text-slate-500 text-center italic mt-10 text-sm">Stack is empty</div>
                  )}
                </div>
              </VizBox>
            </div>

            {/* EVENT LOOP ANIMATION & WEB APIs */}
            <div className="w-2/3 flex flex-col gap-4">
               {/* Web APIs */}
               <div className="h-1/2">
                  <VizBox title="Web APIs" color="purple-400" icon={<Zap className="w-4 h-4 text-purple-400"/>}>
                    <div className="grid grid-cols-2 gap-2">
                       {engine.webApis.map((api) => (
                          <div key={api.id} className="bg-purple-500/20 border border-purple-500/50 p-2 rounded flex items-center justify-between">
                             <span className="text-sm font-mono text-purple-200">{api.content}</span>
                             <span className="text-xs bg-purple-900/50 px-2 py-1 rounded text-purple-300 font-mono">
                                {api.remainingTime > 0 ? `${api.remainingTime}ms` : 'Done'}
                             </span>
                          </div>
                       ))}
                       {engine.webApis.length === 0 && (
                          <div className="col-span-2 text-slate-500 text-center italic text-sm py-4">No active background tasks</div>
                       )}
                    </div>
                  </VizBox>
               </div>

               {/* The Loop Visual */}
               <div className="h-1/2 flex flex-col items-center justify-center bg-slate-800/30 rounded-lg border border-dashed border-slate-700 gap-4">
                  <div className="text-center z-10">
                    <h3 className="font-bold text-slate-300">Event Loop</h3>
                    <p className="text-xs text-slate-500 max-w-[200px] mx-auto mt-1">Checks Stack. If empty, checks Microtasks, then Macrotasks.</p>
                  </div>
                  <div className="flex items-center justify-center">
                     <div className={`w-24 h-24 rounded-full border-4 border-slate-600 border-t-amber-500/80 border-r-emerald-500/80 transition-transform duration-[2000ms] ease-linear ${engine.isRunning ? 'animate-spin' : ''}`}></div>
                  </div>
               </div>
            </div>

          </div>

          {/* Bottom Row: Queues */}
          <div className="h-1/3 flex gap-4">
             {/* Microtasks */}
             <div className="flex-1">
                <VizBox title="Microtask Queue" color="amber-400" icon={<Zap className="w-4 h-4 text-amber-400"/>}>
                   <div className="flex flex-col gap-2">
                      {engine.microtaskQueue.map((task) => (
                         <div key={task.id} className="bg-amber-500/10 border border-amber-500/40 p-2 rounded flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <span className="text-sm text-amber-200 font-mono">{task.content}</span>
                         </div>
                      ))}
                       {engine.microtaskQueue.length === 0 && (
                         <div className="text-slate-500 text-center italic text-sm py-2">Queue empty</div>
                      )}
                   </div>
                </VizBox>
             </div>

             {/* Macrotasks */}
             <div className="flex-1">
                <VizBox title="Macrotask Queue" color="emerald-400" icon={<Box className="w-4 h-4 text-emerald-400"/>}>
                   <div className="flex flex-col gap-2">
                      {engine.macrotaskQueue.map((task) => (
                         <div key={task.id} className="bg-emerald-500/10 border border-emerald-500/40 p-2 rounded flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-sm text-emerald-200 font-mono">{task.content}</span>
                         </div>
                      ))}
                      {engine.macrotaskQueue.length === 0 && (
                         <div className="text-slate-500 text-center italic text-sm py-2">Queue empty</div>
                      )}
                   </div>
                </VizBox>
             </div>
          </div>

        </div>

        {/* RIGHT: CONSOLE & PREDICTION */}
        <div className="w-1/4 min-w-[300px] bg-slate-950 border-l border-slate-700 flex flex-col">
          
          {/* PREDICTION GAME */}
          <div className="flex-1 flex flex-col border-b border-slate-800">
            <div className="flex-none px-4 py-2 bg-slate-900 border-b border-slate-700 flex items-center justify-between text-slate-400">
               <div className="flex items-center gap-2">
                 <HelpCircle className="w-4 h-4" />
                 <span className="text-sm font-semibold uppercase tracking-wider">Output Prediction</span>
               </div>
               {engine.isFinished && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    JSON.stringify(prediction) === JSON.stringify(engine.consoleOutput) ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                  }`}>
                    {JSON.stringify(prediction) === JSON.stringify(engine.consoleOutput) ? 'CORRECT' : 'INCORRECT'}
                  </span>
               )}
            </div>
            <div className="flex-1 p-2 overflow-y-auto bg-slate-900/50">
              <div className="text-xs text-slate-500 mb-2 px-2">
                Drag logs to match the expected execution order.
              </div>
              <div className="space-y-2">
                {prediction.map((log, i) => {
                  let statusColor = "border-slate-700 bg-slate-800";
                  let icon = <GripVertical className="w-4 h-4 text-slate-500 cursor-move" />;
                  
                  if (engine.isFinished) {
                    const isCorrect = engine.consoleOutput[i] === log;
                    if (isCorrect) {
                       statusColor = "border-green-600/50 bg-green-900/20";
                       icon = <CheckCircle className="w-4 h-4 text-green-500" />;
                    } else {
                       statusColor = "border-red-600/50 bg-red-900/20";
                       icon = <XCircle className="w-4 h-4 text-red-500" />;
                    }
                  }

                  return (
                    <div 
                      key={`${i}-${log}`}
                      draggable={!engine.isFinished}
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDrop={handleDrop}
                      className={`flex items-center gap-3 p-2 rounded border ${statusColor} text-slate-300 text-sm font-mono select-none transition-colors`}
                    >
                      <div className="flex-none">
                         {icon}
                      </div>
                      <div className="flex-1 truncate">
                        {log}
                      </div>
                      <div className="text-xs text-slate-600">
                        #{i + 1}
                      </div>
                    </div>
                  );
                })}
                {prediction.length === 0 && (
                   <div className="text-slate-600 text-center italic text-xs py-4">No logs detected</div>
                )}
              </div>
            </div>
          </div>

          {/* ACTUAL CONSOLE */}
          <div className="h-1/2 flex flex-col">
            <div className="flex-none px-4 py-2 bg-slate-900 border-b border-slate-700 flex items-center gap-2 text-slate-400">
               <Terminal className="w-4 h-4" />
               <span className="text-sm font-semibold uppercase tracking-wider">Actual Output</span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-2 bg-slate-950">
               {engine.consoleOutput.map((log, i) => (
                  <div key={i} className="text-slate-300 border-b border-slate-800/50 pb-1 last:border-0 animate-[fadeIn_0.2s_ease-out] flex gap-2">
                     <span className="text-slate-600 select-none">{(i + 1).toString().padStart(2, '0')}</span>
                     <span className="text-green-400 mr-1 opacity-70">➜</span>
                     {log}
                  </div>
               ))}
               {engine.consoleOutput.length === 0 && (
                  <div className="text-slate-600 italic text-xs">Run code to see output...</div>
               )}
            </div>
          </div>

        </div>

      </main>

      {/* FOOTER Info */}
      <footer className="h-6 bg-slate-900 border-t border-slate-800 flex items-center px-4 text-[10px] text-slate-500 justify-between select-none">
        <div>
           <span className="mr-3">Call Stack: Executing code</span>
           <span className="mr-3">Web APIs: Browser features (Timer, Fetch)</span>
           <span className="mr-3">Microtasks: Promises, queueMicrotask</span>
           <span className="mr-3">Macrotasks: setTimeout, setImmediate, I/O</span>
        </div>
        <div>
           React + Tailwind + TypeScript
        </div>
      </footer>
    </div>
  );
}