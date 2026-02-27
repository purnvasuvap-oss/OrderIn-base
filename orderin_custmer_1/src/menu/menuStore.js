// Stable menu store for sharing products across the app
export const menuStore = (() => {
  let _products = [];
  let _subs = [];
  
  const get = () => _products;
  const set = (v) => { 
    _products = v; 
    _subs.forEach(fn => { 
      try { fn(v); } catch (e) { /* ignore */ } 
    }); 
  };
  const subscribe = (fn) => { 
    _subs.push(fn); 
    return () => { _subs = _subs.filter(f => f !== fn); }; 
  };

  const store = Object.freeze({ get, set, subscribe });

  // Dev-time health: log exported menuStore shape
  if (typeof window !== 'undefined' && typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV !== 'production') {
    try { console.info('menuStore exported with keys', Object.keys(store)); } catch (e) { /* ignore */ }
  }

  return store;
})();
