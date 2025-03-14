global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(() => callback(Date.now()), 16) as unknown as number;
  };
  
  global.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
  };