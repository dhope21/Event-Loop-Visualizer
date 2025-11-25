export type FeatureKey = 'log' | 'timeout' | 'promise' | 'microtask' | 'nextTick' | 'setImmediate';

export const INITIAL_FEATURES: Record<FeatureKey, boolean> = {
  log: true,
  timeout: true,
  promise: true,
  microtask: false,
  nextTick: false,
  setImmediate: false
};

export const generateCode = (complexity: 'simple' | 'complex', features: Record<FeatureKey, boolean>): string => {
  const parts: string[] = [];
  
  if (features.log) parts.push("console.log('Start');");

  if (complexity === 'simple') {
    // Simple flat structure
    if (features.nextTick) {
      parts.push(`process.nextTick(() => {\n  ${features.log ? "console.log('Next Tick');" : "// code"}\n});`);
    }

    if (features.promise) {
      parts.push(`Promise.resolve().then(() => {\n  ${features.log ? "console.log('Promise');" : "// code"}\n});`);
    }

    if (features.microtask) {
      parts.push(`queueMicrotask(() => {\n  ${features.log ? "console.log('Microtask');" : "// code"}\n});`);
    }

    if (features.timeout) {
      parts.push(`setTimeout(() => {\n  ${features.log ? "console.log('Timeout');" : "// code"}\n}, 0);`);
    }

    if (features.setImmediate) {
      parts.push(`setImmediate(() => {\n  ${features.log ? "console.log('Immediate');" : "// code"}\n});`);
    }
  } else {
    // Complex nested structure
    
    // 1. Timeout with nested Promise
    if (features.timeout) {
       let inner = "";
       if (features.log) inner += "  console.log('Timeout 1');\n";
       
       if (features.promise) {
          inner += `  Promise.resolve().then(() => {\n    ${features.log ? "console.log('Promise inside Timeout');" : "// code"}\n  });`;
       }
       
       if (features.nextTick) {
           inner += `\n  process.nextTick(() => {\n    ${features.log ? "console.log('Next Tick inside Timeout');" : "// code"}\n  });`;
       }

       parts.push(`setTimeout(() => {\n${inner}\n}, 0);`);
    }

    // 2. Promise with nested Timeout
    if (features.promise) {
        let inner = "";
        if (features.log) inner += "  console.log('Promise 1');\n";
        
        if (features.timeout) {
           inner += `  setTimeout(() => {\n    ${features.log ? "console.log('Timeout inside Promise');" : "// code"}\n  }, 0);`;
        }

        parts.push(`Promise.resolve().then(() => {\n${inner}\n});`);
    }

    // 3. Mixed Immediate / Microtask
    if (features.setImmediate) {
       let inner = "";
       if (features.log) inner += "  console.log('Immediate 1');\n";
       if (features.microtask) {
          inner += `  queueMicrotask(() => {\n    ${features.log ? "console.log('Microtask inside Immediate');" : "// code"}\n  });`;
       }
       parts.push(`setImmediate(() => {\n${inner}\n});`);
    }
  }

  if (features.log) parts.push("console.log('End');");

  return parts.join('\n\n');
};