## Performance Optimizations
* `fs.readFileSync` should be replaced with `fs.promises.readFile` inside `async` functions to avoid blocking the event loop.
* IPC handler functions can be asynchronous, and it's preferable to use `await` on configuration loading rather than performing synchronous file I/O operations.
