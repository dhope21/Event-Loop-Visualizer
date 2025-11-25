# JavaScript Event Loop Visualizer

An interactive playground to visualize and understand how the JavaScript Event Loop, Call Stack, Microtask Queue, and Macrotask Queue work together under the hood.

This project is a **purely client-side application** built with React, TypeScript, and Tailwind CSS. It runs entirely in your browser and simulates the JavaScript runtime environment.

## Features

- **Visual Runtime:** See how code moves from the Call Stack to Web APIs and into the Queues.
- **Micro vs Macro:** Clear distinction between Microtasks (Promises, `queueMicrotask`, `process.nextTick`) and Macrotasks (`setTimeout`, `setImmediate`).
- **Interactive Editor:** Write your own code or generate examples.
- **Code Generator:** Customize complexity (Easy/Complex) and toggle specific features (Promises, Timeouts, etc.) to generate study cases.
- **Prediction Game:** Drag and drop the expected console output order before running the code to test your knowledge.
- **Step-by-Step Execution:** Run automatically or step through line-by-line.

## Setup & Run

No API keys are required.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Open your browser to the local server address (usually `http://localhost:1234` or similar depending on your bundler).

## How it works

The application uses a custom regex-based parser (`utils/parser.ts`) to read a subset of JavaScript code and converts it into a list of executable "Tasks". The main `App.tsx` contains a simulation engine state that manages:

1.  **Call Stack:** Synchronous code execution.
2.  **Web APIs:** Background timers (simulated).
3.  **Microtask Queue:** High priority async callbacks.
4.  **Macrotask Queue:** Lower priority callbacks (Event Loop ticks).

## Supported Syntax

The visualizer supports a specific subset of JS for educational purposes:

- `console.log(...)`
- `setTimeout(() => { ... }, delay)`
- `setImmediate(() => { ... })`
- `Promise.resolve().then(() => { ... })`
- `queueMicrotask(() => { ... })`
- `process.nextTick(() => { ... })`

## Tech Stack

- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **Lucide React** (Icons)
