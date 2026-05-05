// node_modules/zone.js/fesm2015/zone.js
var global = globalThis;
function __symbol__(name) {
  const symbolPrefix = global["__Zone_symbol_prefix"] || "__zone_symbol__";
  return symbolPrefix + name;
}
function initZone() {
  const performance = global["performance"];
  function mark(name) {
    performance && performance["mark"] && performance["mark"](name);
  }
  function performanceMeasure(name, label) {
    performance && performance["measure"] && performance["measure"](name, label);
  }
  mark("Zone");
  class ZoneImpl {
    static __symbol__ = __symbol__;
    static assertZonePatched() {
      if (global["Promise"] !== patches["ZoneAwarePromise"]) {
        throw new Error("Zone.js has detected that ZoneAwarePromise `(window|global).Promise` has been overwritten.\nMost likely cause is that a Promise polyfill has been loaded after Zone.js (Polyfilling Promise api is not necessary when zone.js is loaded. If you must load one, do so before loading zone.js.)");
      }
    }
    static get root() {
      let zone = ZoneImpl.current;
      while (zone.parent) {
        zone = zone.parent;
      }
      return zone;
    }
    static get current() {
      return _currentZoneFrame.zone;
    }
    static get currentTask() {
      return _currentTask;
    }
    static __load_patch(name, fn, ignoreDuplicate = false) {
      if (patches.hasOwnProperty(name)) {
        const checkDuplicate = global[__symbol__("forceDuplicateZoneCheck")] === true;
        if (!ignoreDuplicate && checkDuplicate) {
          throw Error("Already loaded patch: " + name);
        }
      } else if (!global["__Zone_disable_" + name]) {
        const perfName = "Zone:" + name;
        mark(perfName);
        patches[name] = fn(global, ZoneImpl, _api);
        performanceMeasure(perfName, perfName);
      }
    }
    get parent() {
      return this._parent;
    }
    get name() {
      return this._name;
    }
    _parent;
    _name;
    _properties;
    _zoneDelegate;
    constructor(parent, zoneSpec) {
      this._parent = parent;
      this._name = zoneSpec ? zoneSpec.name || "unnamed" : "<root>";
      this._properties = zoneSpec && zoneSpec.properties || {};
      this._zoneDelegate = new _ZoneDelegate(this, this._parent && this._parent._zoneDelegate, zoneSpec);
    }
    get(key) {
      const zone = this.getZoneWith(key);
      if (zone)
        return zone._properties[key];
    }
    getZoneWith(key) {
      let current = this;
      while (current) {
        if (current._properties.hasOwnProperty(key)) {
          return current;
        }
        current = current._parent;
      }
      return null;
    }
    fork(zoneSpec) {
      if (!zoneSpec)
        throw new Error("ZoneSpec required!");
      return this._zoneDelegate.fork(this, zoneSpec);
    }
    wrap(callback, source) {
      if (typeof callback !== "function") {
        throw new Error("Expecting function got: " + callback);
      }
      const _callback = this._zoneDelegate.intercept(this, callback, source);
      const zone = this;
      return function() {
        return zone.runGuarded(_callback, this, arguments, source);
      };
    }
    run(callback, applyThis, applyArgs, source) {
      _currentZoneFrame = { parent: _currentZoneFrame, zone: this };
      try {
        return this._zoneDelegate.invoke(this, callback, applyThis, applyArgs, source);
      } finally {
        _currentZoneFrame = _currentZoneFrame.parent;
      }
    }
    runGuarded(callback, applyThis = null, applyArgs, source) {
      _currentZoneFrame = { parent: _currentZoneFrame, zone: this };
      try {
        try {
          return this._zoneDelegate.invoke(this, callback, applyThis, applyArgs, source);
        } catch (error) {
          if (this._zoneDelegate.handleError(this, error)) {
            throw error;
          }
        }
      } finally {
        _currentZoneFrame = _currentZoneFrame.parent;
      }
    }
    runTask(task, applyThis, applyArgs) {
      if (task.zone != this) {
        throw new Error("A task can only be run in the zone of creation! (Creation: " + (task.zone || NO_ZONE).name + "; Execution: " + this.name + ")");
      }
      const zoneTask = task;
      const { type, data: { isPeriodic = false, isRefreshable = false } = {} } = task;
      if (task.state === notScheduled && (type === eventTask || type === macroTask)) {
        return;
      }
      const reEntryGuard = task.state != running;
      reEntryGuard && zoneTask._transitionTo(running, scheduled);
      const previousTask = _currentTask;
      _currentTask = zoneTask;
      _currentZoneFrame = { parent: _currentZoneFrame, zone: this };
      try {
        if (type == macroTask && task.data && !isPeriodic && !isRefreshable) {
          task.cancelFn = void 0;
        }
        try {
          return this._zoneDelegate.invokeTask(this, zoneTask, applyThis, applyArgs);
        } catch (error) {
          if (this._zoneDelegate.handleError(this, error)) {
            throw error;
          }
        }
      } finally {
        const state = task.state;
        if (state !== notScheduled && state !== unknown) {
          if (type == eventTask || isPeriodic || isRefreshable && state === scheduling) {
            reEntryGuard && zoneTask._transitionTo(scheduled, running, scheduling);
          } else {
            const zoneDelegates = zoneTask._zoneDelegates;
            this._updateTaskCount(zoneTask, -1);
            reEntryGuard && zoneTask._transitionTo(notScheduled, running, notScheduled);
            if (isRefreshable) {
              zoneTask._zoneDelegates = zoneDelegates;
            }
          }
        }
        _currentZoneFrame = _currentZoneFrame.parent;
        _currentTask = previousTask;
      }
    }
    scheduleTask(task) {
      if (task.zone && task.zone !== this) {
        let newZone = this;
        while (newZone) {
          if (newZone === task.zone) {
            throw Error(`can not reschedule task to ${this.name} which is descendants of the original zone ${task.zone.name}`);
          }
          newZone = newZone.parent;
        }
      }
      task._transitionTo(scheduling, notScheduled);
      const zoneDelegates = [];
      task._zoneDelegates = zoneDelegates;
      task._zone = this;
      try {
        task = this._zoneDelegate.scheduleTask(this, task);
      } catch (err) {
        task._transitionTo(unknown, scheduling, notScheduled);
        this._zoneDelegate.handleError(this, err);
        throw err;
      }
      if (task._zoneDelegates === zoneDelegates) {
        this._updateTaskCount(task, 1);
      }
      if (task.state == scheduling) {
        task._transitionTo(scheduled, scheduling);
      }
      return task;
    }
    scheduleMicroTask(source, callback, data, customSchedule) {
      return this.scheduleTask(new ZoneTask(microTask, source, callback, data, customSchedule, void 0));
    }
    scheduleMacroTask(source, callback, data, customSchedule, customCancel) {
      return this.scheduleTask(new ZoneTask(macroTask, source, callback, data, customSchedule, customCancel));
    }
    scheduleEventTask(source, callback, data, customSchedule, customCancel) {
      return this.scheduleTask(new ZoneTask(eventTask, source, callback, data, customSchedule, customCancel));
    }
    cancelTask(task) {
      if (task.zone != this)
        throw new Error("A task can only be cancelled in the zone of creation! (Creation: " + (task.zone || NO_ZONE).name + "; Execution: " + this.name + ")");
      if (task.state !== scheduled && task.state !== running) {
        return;
      }
      task._transitionTo(canceling, scheduled, running);
      try {
        this._zoneDelegate.cancelTask(this, task);
      } catch (err) {
        task._transitionTo(unknown, canceling);
        this._zoneDelegate.handleError(this, err);
        throw err;
      }
      this._updateTaskCount(task, -1);
      task._transitionTo(notScheduled, canceling);
      task.runCount = -1;
      return task;
    }
    _updateTaskCount(task, count) {
      const zoneDelegates = task._zoneDelegates;
      if (count == -1) {
        task._zoneDelegates = null;
      }
      for (let i = 0; i < zoneDelegates.length; i++) {
        zoneDelegates[i]._updateTaskCount(task.type, count);
      }
    }
  }
  const DELEGATE_ZS = {
    name: "",
    onHasTask: (delegate, _, target, hasTaskState) => delegate.hasTask(target, hasTaskState),
    onScheduleTask: (delegate, _, target, task) => delegate.scheduleTask(target, task),
    onInvokeTask: (delegate, _, target, task, applyThis, applyArgs) => delegate.invokeTask(target, task, applyThis, applyArgs),
    onCancelTask: (delegate, _, target, task) => delegate.cancelTask(target, task)
  };
  class _ZoneDelegate {
    get zone() {
      return this._zone;
    }
    _zone;
    _taskCounts = {
      "microTask": 0,
      "macroTask": 0,
      "eventTask": 0
    };
    _parentDelegate;
    _forkDlgt;
    _forkZS;
    _forkCurrZone;
    _interceptDlgt;
    _interceptZS;
    _interceptCurrZone;
    _invokeDlgt;
    _invokeZS;
    _invokeCurrZone;
    _handleErrorDlgt;
    _handleErrorZS;
    _handleErrorCurrZone;
    _scheduleTaskDlgt;
    _scheduleTaskZS;
    _scheduleTaskCurrZone;
    _invokeTaskDlgt;
    _invokeTaskZS;
    _invokeTaskCurrZone;
    _cancelTaskDlgt;
    _cancelTaskZS;
    _cancelTaskCurrZone;
    _hasTaskDlgt;
    _hasTaskDlgtOwner;
    _hasTaskZS;
    _hasTaskCurrZone;
    constructor(zone, parentDelegate, zoneSpec) {
      this._zone = zone;
      this._parentDelegate = parentDelegate;
      this._forkZS = zoneSpec && (zoneSpec && zoneSpec.onFork ? zoneSpec : parentDelegate._forkZS);
      this._forkDlgt = zoneSpec && (zoneSpec.onFork ? parentDelegate : parentDelegate._forkDlgt);
      this._forkCurrZone = zoneSpec && (zoneSpec.onFork ? this._zone : parentDelegate._forkCurrZone);
      this._interceptZS = zoneSpec && (zoneSpec.onIntercept ? zoneSpec : parentDelegate._interceptZS);
      this._interceptDlgt = zoneSpec && (zoneSpec.onIntercept ? parentDelegate : parentDelegate._interceptDlgt);
      this._interceptCurrZone = zoneSpec && (zoneSpec.onIntercept ? this._zone : parentDelegate._interceptCurrZone);
      this._invokeZS = zoneSpec && (zoneSpec.onInvoke ? zoneSpec : parentDelegate._invokeZS);
      this._invokeDlgt = zoneSpec && (zoneSpec.onInvoke ? parentDelegate : parentDelegate._invokeDlgt);
      this._invokeCurrZone = zoneSpec && (zoneSpec.onInvoke ? this._zone : parentDelegate._invokeCurrZone);
      this._handleErrorZS = zoneSpec && (zoneSpec.onHandleError ? zoneSpec : parentDelegate._handleErrorZS);
      this._handleErrorDlgt = zoneSpec && (zoneSpec.onHandleError ? parentDelegate : parentDelegate._handleErrorDlgt);
      this._handleErrorCurrZone = zoneSpec && (zoneSpec.onHandleError ? this._zone : parentDelegate._handleErrorCurrZone);
      this._scheduleTaskZS = zoneSpec && (zoneSpec.onScheduleTask ? zoneSpec : parentDelegate._scheduleTaskZS);
      this._scheduleTaskDlgt = zoneSpec && (zoneSpec.onScheduleTask ? parentDelegate : parentDelegate._scheduleTaskDlgt);
      this._scheduleTaskCurrZone = zoneSpec && (zoneSpec.onScheduleTask ? this._zone : parentDelegate._scheduleTaskCurrZone);
      this._invokeTaskZS = zoneSpec && (zoneSpec.onInvokeTask ? zoneSpec : parentDelegate._invokeTaskZS);
      this._invokeTaskDlgt = zoneSpec && (zoneSpec.onInvokeTask ? parentDelegate : parentDelegate._invokeTaskDlgt);
      this._invokeTaskCurrZone = zoneSpec && (zoneSpec.onInvokeTask ? this._zone : parentDelegate._invokeTaskCurrZone);
      this._cancelTaskZS = zoneSpec && (zoneSpec.onCancelTask ? zoneSpec : parentDelegate._cancelTaskZS);
      this._cancelTaskDlgt = zoneSpec && (zoneSpec.onCancelTask ? parentDelegate : parentDelegate._cancelTaskDlgt);
      this._cancelTaskCurrZone = zoneSpec && (zoneSpec.onCancelTask ? this._zone : parentDelegate._cancelTaskCurrZone);
      this._hasTaskZS = null;
      this._hasTaskDlgt = null;
      this._hasTaskDlgtOwner = null;
      this._hasTaskCurrZone = null;
      const zoneSpecHasTask = zoneSpec && zoneSpec.onHasTask;
      const parentHasTask = parentDelegate && parentDelegate._hasTaskZS;
      if (zoneSpecHasTask || parentHasTask) {
        this._hasTaskZS = zoneSpecHasTask ? zoneSpec : DELEGATE_ZS;
        this._hasTaskDlgt = parentDelegate;
        this._hasTaskDlgtOwner = this;
        this._hasTaskCurrZone = this._zone;
        if (!zoneSpec.onScheduleTask) {
          this._scheduleTaskZS = DELEGATE_ZS;
          this._scheduleTaskDlgt = parentDelegate;
          this._scheduleTaskCurrZone = this._zone;
        }
        if (!zoneSpec.onInvokeTask) {
          this._invokeTaskZS = DELEGATE_ZS;
          this._invokeTaskDlgt = parentDelegate;
          this._invokeTaskCurrZone = this._zone;
        }
        if (!zoneSpec.onCancelTask) {
          this._cancelTaskZS = DELEGATE_ZS;
          this._cancelTaskDlgt = parentDelegate;
          this._cancelTaskCurrZone = this._zone;
        }
      }
    }
    fork(targetZone, zoneSpec) {
      return this._forkZS ? this._forkZS.onFork(this._forkDlgt, this.zone, targetZone, zoneSpec) : new ZoneImpl(targetZone, zoneSpec);
    }
    intercept(targetZone, callback, source) {
      return this._interceptZS ? this._interceptZS.onIntercept(this._interceptDlgt, this._interceptCurrZone, targetZone, callback, source) : callback;
    }
    invoke(targetZone, callback, applyThis, applyArgs, source) {
      return this._invokeZS ? this._invokeZS.onInvoke(this._invokeDlgt, this._invokeCurrZone, targetZone, callback, applyThis, applyArgs, source) : callback.apply(applyThis, applyArgs);
    }
    handleError(targetZone, error) {
      return this._handleErrorZS ? this._handleErrorZS.onHandleError(this._handleErrorDlgt, this._handleErrorCurrZone, targetZone, error) : true;
    }
    scheduleTask(targetZone, task) {
      let returnTask = task;
      if (this._scheduleTaskZS) {
        if (this._hasTaskZS) {
          returnTask._zoneDelegates.push(this._hasTaskDlgtOwner);
        }
        returnTask = this._scheduleTaskZS.onScheduleTask(this._scheduleTaskDlgt, this._scheduleTaskCurrZone, targetZone, task);
        if (!returnTask)
          returnTask = task;
      } else {
        if (task.scheduleFn) {
          task.scheduleFn(task);
        } else if (task.type == microTask) {
          scheduleMicroTask(task);
        } else {
          throw new Error("Task is missing scheduleFn.");
        }
      }
      return returnTask;
    }
    invokeTask(targetZone, task, applyThis, applyArgs) {
      return this._invokeTaskZS ? this._invokeTaskZS.onInvokeTask(this._invokeTaskDlgt, this._invokeTaskCurrZone, targetZone, task, applyThis, applyArgs) : task.callback.apply(applyThis, applyArgs);
    }
    cancelTask(targetZone, task) {
      let value;
      if (this._cancelTaskZS) {
        value = this._cancelTaskZS.onCancelTask(this._cancelTaskDlgt, this._cancelTaskCurrZone, targetZone, task);
      } else {
        if (!task.cancelFn) {
          throw Error("Task is not cancelable");
        }
        value = task.cancelFn(task);
      }
      return value;
    }
    hasTask(targetZone, isEmpty) {
      try {
        this._hasTaskZS && this._hasTaskZS.onHasTask(this._hasTaskDlgt, this._hasTaskCurrZone, targetZone, isEmpty);
      } catch (err) {
        this.handleError(targetZone, err);
      }
    }
    _updateTaskCount(type, count) {
      const counts = this._taskCounts;
      const prev = counts[type];
      const next = counts[type] = prev + count;
      if (next < 0) {
        throw new Error("More tasks executed then were scheduled.");
      }
      if (prev == 0 || next == 0) {
        const isEmpty = {
          microTask: counts["microTask"] > 0,
          macroTask: counts["macroTask"] > 0,
          eventTask: counts["eventTask"] > 0,
          change: type
        };
        this.hasTask(this._zone, isEmpty);
      }
    }
  }
  class ZoneTask {
    type;
    source;
    invoke;
    callback;
    data;
    scheduleFn;
    cancelFn;
    _zone = null;
    runCount = 0;
    _zoneDelegates = null;
    _state = "notScheduled";
    constructor(type, source, callback, options, scheduleFn, cancelFn) {
      this.type = type;
      this.source = source;
      this.data = options;
      this.scheduleFn = scheduleFn;
      this.cancelFn = cancelFn;
      if (!callback) {
        throw new Error("callback is not defined");
      }
      this.callback = callback;
      const self2 = this;
      if (type === eventTask && options && options.useG) {
        this.invoke = ZoneTask.invokeTask;
      } else {
        this.invoke = function() {
          return ZoneTask.invokeTask.call(global, self2, this, arguments);
        };
      }
    }
    static invokeTask(task, target, args) {
      if (!task) {
        task = this;
      }
      _numberOfNestedTaskFrames++;
      try {
        task.runCount++;
        return task.zone.runTask(task, target, args);
      } finally {
        if (_numberOfNestedTaskFrames == 1) {
          drainMicroTaskQueue();
        }
        _numberOfNestedTaskFrames--;
      }
    }
    get zone() {
      return this._zone;
    }
    get state() {
      return this._state;
    }
    cancelScheduleRequest() {
      this._transitionTo(notScheduled, scheduling);
    }
    _transitionTo(toState, fromState1, fromState2) {
      if (this._state === fromState1 || this._state === fromState2) {
        this._state = toState;
        if (toState == notScheduled) {
          this._zoneDelegates = null;
        }
      } else {
        throw new Error(`${this.type} '${this.source}': can not transition to '${toState}', expecting state '${fromState1}'${fromState2 ? " or '" + fromState2 + "'" : ""}, was '${this._state}'.`);
      }
    }
    toString() {
      if (this.data && typeof this.data.handleId !== "undefined") {
        return this.data.handleId.toString();
      } else {
        return Object.prototype.toString.call(this);
      }
    }
    // add toJSON method to prevent cyclic error when
    // call JSON.stringify(zoneTask)
    toJSON() {
      return {
        type: this.type,
        state: this.state,
        source: this.source,
        zone: this.zone.name,
        runCount: this.runCount
      };
    }
  }
  const symbolSetTimeout = __symbol__("setTimeout");
  const symbolPromise = __symbol__("Promise");
  const symbolThen = __symbol__("then");
  let _microTaskQueue = [];
  let _isDrainingMicrotaskQueue = false;
  let nativeMicroTaskQueuePromise;
  function nativeScheduleMicroTask(func) {
    if (!nativeMicroTaskQueuePromise) {
      if (global[symbolPromise]) {
        nativeMicroTaskQueuePromise = global[symbolPromise].resolve(0);
      }
    }
    if (nativeMicroTaskQueuePromise) {
      let nativeThen = nativeMicroTaskQueuePromise[symbolThen];
      if (!nativeThen) {
        nativeThen = nativeMicroTaskQueuePromise["then"];
      }
      nativeThen.call(nativeMicroTaskQueuePromise, func);
    } else {
      global[symbolSetTimeout](func, 0);
    }
  }
  function scheduleMicroTask(task) {
    if (_numberOfNestedTaskFrames === 0 && _microTaskQueue.length === 0) {
      nativeScheduleMicroTask(drainMicroTaskQueue);
    }
    task && _microTaskQueue.push(task);
  }
  function drainMicroTaskQueue() {
    if (!_isDrainingMicrotaskQueue) {
      _isDrainingMicrotaskQueue = true;
      while (_microTaskQueue.length) {
        const queue = _microTaskQueue;
        _microTaskQueue = [];
        for (let i = 0; i < queue.length; i++) {
          const task = queue[i];
          try {
            task.zone.runTask(task, null, null);
          } catch (error) {
            _api.onUnhandledError(error);
          }
        }
      }
      _api.microtaskDrainDone();
      _isDrainingMicrotaskQueue = false;
    }
  }
  const NO_ZONE = { name: "NO ZONE" };
  const notScheduled = "notScheduled", scheduling = "scheduling", scheduled = "scheduled", running = "running", canceling = "canceling", unknown = "unknown";
  const microTask = "microTask", macroTask = "macroTask", eventTask = "eventTask";
  const patches = {};
  const _api = {
    symbol: __symbol__,
    currentZoneFrame: () => _currentZoneFrame,
    onUnhandledError: noop,
    microtaskDrainDone: noop,
    scheduleMicroTask,
    showUncaughtError: () => !ZoneImpl[__symbol__("ignoreConsoleErrorUncaughtError")],
    patchEventTarget: () => [],
    patchOnProperties: noop,
    patchMethod: () => noop,
    bindArguments: () => [],
    patchThen: () => noop,
    patchMacroTask: () => noop,
    patchEventPrototype: () => noop,
    isIEOrEdge: () => false,
    getGlobalObjects: () => void 0,
    ObjectDefineProperty: () => noop,
    ObjectGetOwnPropertyDescriptor: () => void 0,
    ObjectCreate: () => void 0,
    ArraySlice: () => [],
    patchClass: () => noop,
    wrapWithCurrentZone: () => noop,
    filterProperties: () => [],
    attachOriginToPatched: () => noop,
    _redefineProperty: () => noop,
    patchCallbacks: () => noop,
    nativeScheduleMicroTask
  };
  let _currentZoneFrame = { parent: null, zone: new ZoneImpl(null, null) };
  let _currentTask = null;
  let _numberOfNestedTaskFrames = 0;
  function noop() {
  }
  performanceMeasure("Zone", "Zone");
  return ZoneImpl;
}
function loadZone() {
  const global2 = globalThis;
  const checkDuplicate = global2[__symbol__("forceDuplicateZoneCheck")] === true;
  if (global2["Zone"] && (checkDuplicate || typeof global2["Zone"].__symbol__ !== "function")) {
    throw new Error("Zone already loaded.");
  }
  global2["Zone"] ??= initZone();
  return global2["Zone"];
}
var ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
var ObjectDefineProperty = Object.defineProperty;
var ObjectGetPrototypeOf = Object.getPrototypeOf;
var ObjectCreate = Object.create;
var ArraySlice = Array.prototype.slice;
var ADD_EVENT_LISTENER_STR = "addEventListener";
var REMOVE_EVENT_LISTENER_STR = "removeEventListener";
var ZONE_SYMBOL_ADD_EVENT_LISTENER = __symbol__(ADD_EVENT_LISTENER_STR);
var ZONE_SYMBOL_REMOVE_EVENT_LISTENER = __symbol__(REMOVE_EVENT_LISTENER_STR);
var TRUE_STR = "true";
var FALSE_STR = "false";
var ZONE_SYMBOL_PREFIX = __symbol__("");
function wrapWithCurrentZone(callback, source) {
  return Zone.current.wrap(callback, source);
}
function scheduleMacroTaskWithCurrentZone(source, callback, data, customSchedule, customCancel) {
  return Zone.current.scheduleMacroTask(source, callback, data, customSchedule, customCancel);
}
var zoneSymbol = __symbol__;
var isWindowExists = typeof window !== "undefined";
var internalWindow = isWindowExists ? window : void 0;
var _global = isWindowExists && internalWindow || globalThis;
var REMOVE_ATTRIBUTE = "removeAttribute";
function bindArguments(args, source) {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === "function") {
      args[i] = wrapWithCurrentZone(args[i], source + "_" + i);
    }
  }
  return args;
}
function patchPrototype(prototype, fnNames) {
  const source = prototype.constructor["name"];
  for (let i = 0; i < fnNames.length; i++) {
    const name = fnNames[i];
    const delegate = prototype[name];
    if (delegate) {
      const prototypeDesc = ObjectGetOwnPropertyDescriptor(prototype, name);
      if (!isPropertyWritable(prototypeDesc)) {
        continue;
      }
      prototype[name] = ((delegate2) => {
        const patched = function() {
          return delegate2.apply(this, bindArguments(arguments, source + "." + name));
        };
        attachOriginToPatched(patched, delegate2);
        return patched;
      })(delegate);
    }
  }
}
function isPropertyWritable(propertyDesc) {
  if (!propertyDesc) {
    return true;
  }
  if (propertyDesc.writable === false) {
    return false;
  }
  return !(typeof propertyDesc.get === "function" && typeof propertyDesc.set === "undefined");
}
var isWebWorker = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
var isNode = !("nw" in _global) && typeof _global.process !== "undefined" && _global.process.toString() === "[object process]";
var isBrowser = !isNode && !isWebWorker && !!(isWindowExists && internalWindow["HTMLElement"]);
var isMix = typeof _global.process !== "undefined" && _global.process.toString() === "[object process]" && !isWebWorker && !!(isWindowExists && internalWindow["HTMLElement"]);
var zoneSymbolEventNames$1 = {};
var enableBeforeunloadSymbol = zoneSymbol("enable_beforeunload");
var wrapFn = function(event) {
  event = event || _global.event;
  if (!event) {
    return;
  }
  let eventNameSymbol = zoneSymbolEventNames$1[event.type];
  if (!eventNameSymbol) {
    eventNameSymbol = zoneSymbolEventNames$1[event.type] = zoneSymbol("ON_PROPERTY" + event.type);
  }
  const target = this || event.target || _global;
  const listener = target[eventNameSymbol];
  let result;
  if (isBrowser && target === internalWindow && event.type === "error") {
    const errorEvent = event;
    result = listener && listener.call(this, errorEvent.message, errorEvent.filename, errorEvent.lineno, errorEvent.colno, errorEvent.error);
    if (result === true) {
      event.preventDefault();
    }
  } else {
    result = listener && listener.apply(this, arguments);
    if (
      // https://github.com/angular/angular/issues/47579
      // https://www.w3.org/TR/2011/WD-html5-20110525/history.html#beforeunloadevent
      // This is the only specific case we should check for. The spec defines that the
      // `returnValue` attribute represents the message to show the user. When the event
      // is created, this attribute must be set to the empty string.
      event.type === "beforeunload" && // To prevent any breaking changes resulting from this change, given that
      // it was already causing a significant number of failures in G3, we have hidden
      // that behavior behind a global configuration flag. Consumers can enable this
      // flag explicitly if they want the `beforeunload` event to be handled as defined
      // in the specification.
      _global[enableBeforeunloadSymbol] && // The IDL event definition is `attribute DOMString returnValue`, so we check whether
      // `typeof result` is a string.
      typeof result === "string"
    ) {
      event.returnValue = result;
    } else if (result != void 0 && !result) {
      event.preventDefault();
    }
  }
  return result;
};
function patchProperty(obj, prop, prototype) {
  let desc = ObjectGetOwnPropertyDescriptor(obj, prop);
  if (!desc && prototype) {
    const prototypeDesc = ObjectGetOwnPropertyDescriptor(prototype, prop);
    if (prototypeDesc) {
      desc = { enumerable: true, configurable: true };
    }
  }
  if (!desc || !desc.configurable) {
    return;
  }
  const onPropPatchedSymbol = zoneSymbol("on" + prop + "patched");
  if (obj.hasOwnProperty(onPropPatchedSymbol) && obj[onPropPatchedSymbol]) {
    return;
  }
  delete desc.writable;
  delete desc.value;
  const originalDescGet = desc.get;
  const originalDescSet = desc.set;
  const eventName = prop.slice(2);
  let eventNameSymbol = zoneSymbolEventNames$1[eventName];
  if (!eventNameSymbol) {
    eventNameSymbol = zoneSymbolEventNames$1[eventName] = zoneSymbol("ON_PROPERTY" + eventName);
  }
  desc.set = function(newValue) {
    let target = this;
    if (!target && obj === _global) {
      target = _global;
    }
    if (!target) {
      return;
    }
    const previousValue = target[eventNameSymbol];
    if (typeof previousValue === "function") {
      target.removeEventListener(eventName, wrapFn);
    }
    originalDescSet?.call(target, null);
    target[eventNameSymbol] = newValue;
    if (typeof newValue === "function") {
      target.addEventListener(eventName, wrapFn, false);
    }
  };
  desc.get = function() {
    let target = this;
    if (!target && obj === _global) {
      target = _global;
    }
    if (!target) {
      return null;
    }
    const listener = target[eventNameSymbol];
    if (listener) {
      return listener;
    } else if (originalDescGet) {
      let value = originalDescGet.call(this);
      if (value) {
        desc.set.call(this, value);
        if (typeof target[REMOVE_ATTRIBUTE] === "function") {
          target.removeAttribute(prop);
        }
        return value;
      }
    }
    return null;
  };
  ObjectDefineProperty(obj, prop, desc);
  obj[onPropPatchedSymbol] = true;
}
function patchOnProperties(obj, properties, prototype) {
  if (properties) {
    for (let i = 0; i < properties.length; i++) {
      patchProperty(obj, "on" + properties[i], prototype);
    }
  } else {
    const onProperties = [];
    for (const prop in obj) {
      if (prop.slice(0, 2) == "on") {
        onProperties.push(prop);
      }
    }
    for (let j = 0; j < onProperties.length; j++) {
      patchProperty(obj, onProperties[j], prototype);
    }
  }
}
var originalInstanceKey = zoneSymbol("originalInstance");
function patchClass(className) {
  const OriginalClass = _global[className];
  if (!OriginalClass)
    return;
  _global[zoneSymbol(className)] = OriginalClass;
  _global[className] = function() {
    const a = bindArguments(arguments, className);
    switch (a.length) {
      case 0:
        this[originalInstanceKey] = new OriginalClass();
        break;
      case 1:
        this[originalInstanceKey] = new OriginalClass(a[0]);
        break;
      case 2:
        this[originalInstanceKey] = new OriginalClass(a[0], a[1]);
        break;
      case 3:
        this[originalInstanceKey] = new OriginalClass(a[0], a[1], a[2]);
        break;
      case 4:
        this[originalInstanceKey] = new OriginalClass(a[0], a[1], a[2], a[3]);
        break;
      default:
        throw new Error("Arg list too long.");
    }
  };
  attachOriginToPatched(_global[className], OriginalClass);
  const instance = new OriginalClass(function() {
  });
  let prop;
  for (prop in instance) {
    if (className === "XMLHttpRequest" && prop === "responseBlob")
      continue;
    (function(prop2) {
      if (typeof instance[prop2] === "function") {
        _global[className].prototype[prop2] = function() {
          return this[originalInstanceKey][prop2].apply(this[originalInstanceKey], arguments);
        };
      } else {
        ObjectDefineProperty(_global[className].prototype, prop2, {
          set: function(fn) {
            if (typeof fn === "function") {
              this[originalInstanceKey][prop2] = wrapWithCurrentZone(fn, className + "." + prop2);
              attachOriginToPatched(this[originalInstanceKey][prop2], fn);
            } else {
              this[originalInstanceKey][prop2] = fn;
            }
          },
          get: function() {
            return this[originalInstanceKey][prop2];
          }
        });
      }
    })(prop);
  }
  for (prop in OriginalClass) {
    if (prop !== "prototype" && OriginalClass.hasOwnProperty(prop)) {
      _global[className][prop] = OriginalClass[prop];
    }
  }
}
function patchMethod(target, name, patchFn) {
  let proto = target;
  while (proto && !proto.hasOwnProperty(name)) {
    proto = ObjectGetPrototypeOf(proto);
  }
  if (!proto && target[name]) {
    proto = target;
  }
  const delegateName = zoneSymbol(name);
  let delegate = null;
  if (proto && (!(delegate = proto[delegateName]) || !proto.hasOwnProperty(delegateName))) {
    delegate = proto[delegateName] = proto[name];
    const desc = proto && ObjectGetOwnPropertyDescriptor(proto, name);
    if (isPropertyWritable(desc)) {
      const patchDelegate = patchFn(delegate, delegateName, name);
      proto[name] = function() {
        return patchDelegate(this, arguments);
      };
      attachOriginToPatched(proto[name], delegate);
    }
  }
  return delegate;
}
function patchMacroTask(obj, funcName, metaCreator) {
  let setNative = null;
  function scheduleTask(task) {
    const data = task.data;
    data.args[data.cbIdx] = function() {
      task.invoke.apply(this, arguments);
    };
    setNative.apply(data.target, data.args);
    return task;
  }
  setNative = patchMethod(obj, funcName, (delegate) => function(self2, args) {
    const meta = metaCreator(self2, args);
    if (meta.cbIdx >= 0 && typeof args[meta.cbIdx] === "function") {
      return scheduleMacroTaskWithCurrentZone(meta.name, args[meta.cbIdx], meta, scheduleTask);
    } else {
      return delegate.apply(self2, args);
    }
  });
}
function attachOriginToPatched(patched, original) {
  patched[zoneSymbol("OriginalDelegate")] = original;
}
var isDetectedIEOrEdge = false;
var ieOrEdge = false;
function isIEOrEdge() {
  if (isDetectedIEOrEdge) {
    return ieOrEdge;
  }
  isDetectedIEOrEdge = true;
  try {
    const ua = internalWindow.navigator.userAgent;
    if (ua.indexOf("MSIE ") !== -1 || ua.indexOf("Trident/") !== -1 || ua.indexOf("Edge/") !== -1) {
      ieOrEdge = true;
    }
  } catch (error) {
  }
  return ieOrEdge;
}
function isFunction(value) {
  return typeof value === "function";
}
function isNumber(value) {
  return typeof value === "number";
}
var OPTIMIZED_ZONE_EVENT_TASK_DATA = {
  useG: true
};
var zoneSymbolEventNames = {};
var globalSources = {};
var EVENT_NAME_SYMBOL_REGX = new RegExp("^" + ZONE_SYMBOL_PREFIX + "(\\w+)(true|false)$");
var IMMEDIATE_PROPAGATION_SYMBOL = zoneSymbol("propagationStopped");
function prepareEventNames(eventName, eventNameToString) {
  const falseEventName = (eventNameToString ? eventNameToString(eventName) : eventName) + FALSE_STR;
  const trueEventName = (eventNameToString ? eventNameToString(eventName) : eventName) + TRUE_STR;
  const symbol = ZONE_SYMBOL_PREFIX + falseEventName;
  const symbolCapture = ZONE_SYMBOL_PREFIX + trueEventName;
  zoneSymbolEventNames[eventName] = {};
  zoneSymbolEventNames[eventName][FALSE_STR] = symbol;
  zoneSymbolEventNames[eventName][TRUE_STR] = symbolCapture;
}
function patchEventTarget(_global2, api, apis, patchOptions) {
  const ADD_EVENT_LISTENER = patchOptions && patchOptions.add || ADD_EVENT_LISTENER_STR;
  const REMOVE_EVENT_LISTENER = patchOptions && patchOptions.rm || REMOVE_EVENT_LISTENER_STR;
  const LISTENERS_EVENT_LISTENER = patchOptions && patchOptions.listeners || "eventListeners";
  const REMOVE_ALL_LISTENERS_EVENT_LISTENER = patchOptions && patchOptions.rmAll || "removeAllListeners";
  const zoneSymbolAddEventListener = zoneSymbol(ADD_EVENT_LISTENER);
  const ADD_EVENT_LISTENER_SOURCE = "." + ADD_EVENT_LISTENER + ":";
  const PREPEND_EVENT_LISTENER = "prependListener";
  const PREPEND_EVENT_LISTENER_SOURCE = "." + PREPEND_EVENT_LISTENER + ":";
  const invokeTask = function(task, target, event) {
    if (task.isRemoved) {
      return;
    }
    const delegate = task.callback;
    if (typeof delegate === "object" && delegate.handleEvent) {
      task.callback = (event2) => delegate.handleEvent(event2);
      task.originalDelegate = delegate;
    }
    let error;
    try {
      task.invoke(task, target, [event]);
    } catch (err) {
      error = err;
    }
    const options = task.options;
    if (options && typeof options === "object" && options.once) {
      const delegate2 = task.originalDelegate ? task.originalDelegate : task.callback;
      target[REMOVE_EVENT_LISTENER].call(target, event.type, delegate2, options);
    }
    return error;
  };
  function globalCallback(context, event, isCapture) {
    event = event || _global2.event;
    if (!event) {
      return;
    }
    const target = context || event.target || _global2;
    const tasks = target[zoneSymbolEventNames[event.type][isCapture ? TRUE_STR : FALSE_STR]];
    if (tasks) {
      const errors = [];
      if (tasks.length === 1) {
        const err = invokeTask(tasks[0], target, event);
        err && errors.push(err);
      } else {
        const copyTasks = tasks.slice();
        for (let i = 0; i < copyTasks.length; i++) {
          if (event && event[IMMEDIATE_PROPAGATION_SYMBOL] === true) {
            break;
          }
          const err = invokeTask(copyTasks[i], target, event);
          err && errors.push(err);
        }
      }
      if (errors.length === 1) {
        throw errors[0];
      } else {
        for (let i = 0; i < errors.length; i++) {
          const err = errors[i];
          api.nativeScheduleMicroTask(() => {
            throw err;
          });
        }
      }
    }
  }
  const globalZoneAwareCallback = function(event) {
    return globalCallback(this, event, false);
  };
  const globalZoneAwareCaptureCallback = function(event) {
    return globalCallback(this, event, true);
  };
  function patchEventTargetMethods(obj, patchOptions2) {
    if (!obj) {
      return false;
    }
    let useGlobalCallback = true;
    if (patchOptions2 && patchOptions2.useG !== void 0) {
      useGlobalCallback = patchOptions2.useG;
    }
    const validateHandler = patchOptions2 && patchOptions2.vh;
    let checkDuplicate = true;
    if (patchOptions2 && patchOptions2.chkDup !== void 0) {
      checkDuplicate = patchOptions2.chkDup;
    }
    let returnTarget = false;
    if (patchOptions2 && patchOptions2.rt !== void 0) {
      returnTarget = patchOptions2.rt;
    }
    let proto = obj;
    while (proto && !proto.hasOwnProperty(ADD_EVENT_LISTENER)) {
      proto = ObjectGetPrototypeOf(proto);
    }
    if (!proto && obj[ADD_EVENT_LISTENER]) {
      proto = obj;
    }
    if (!proto) {
      return false;
    }
    if (proto[zoneSymbolAddEventListener]) {
      return false;
    }
    const eventNameToString = patchOptions2 && patchOptions2.eventNameToString;
    const taskData = {};
    const nativeAddEventListener = proto[zoneSymbolAddEventListener] = proto[ADD_EVENT_LISTENER];
    const nativeRemoveEventListener = proto[zoneSymbol(REMOVE_EVENT_LISTENER)] = proto[REMOVE_EVENT_LISTENER];
    const nativeListeners = proto[zoneSymbol(LISTENERS_EVENT_LISTENER)] = proto[LISTENERS_EVENT_LISTENER];
    const nativeRemoveAllListeners = proto[zoneSymbol(REMOVE_ALL_LISTENERS_EVENT_LISTENER)] = proto[REMOVE_ALL_LISTENERS_EVENT_LISTENER];
    let nativePrependEventListener;
    if (patchOptions2 && patchOptions2.prepend) {
      nativePrependEventListener = proto[zoneSymbol(patchOptions2.prepend)] = proto[patchOptions2.prepend];
    }
    function buildEventListenerOptions(options, passive) {
      if (!passive) {
        return options;
      }
      if (typeof options === "boolean") {
        return { capture: options, passive: true };
      }
      if (!options) {
        return { passive: true };
      }
      if (typeof options === "object" && options.passive !== false) {
        return { ...options, passive: true };
      }
      return options;
    }
    const customScheduleGlobal = function(task) {
      if (taskData.isExisting) {
        return;
      }
      return nativeAddEventListener.call(taskData.target, taskData.eventName, taskData.capture ? globalZoneAwareCaptureCallback : globalZoneAwareCallback, taskData.options);
    };
    const customCancelGlobal = function(task) {
      if (!task.isRemoved) {
        const symbolEventNames = zoneSymbolEventNames[task.eventName];
        let symbolEventName;
        if (symbolEventNames) {
          symbolEventName = symbolEventNames[task.capture ? TRUE_STR : FALSE_STR];
        }
        const existingTasks = symbolEventName && task.target[symbolEventName];
        if (existingTasks) {
          for (let i = 0; i < existingTasks.length; i++) {
            const existingTask = existingTasks[i];
            if (existingTask === task) {
              existingTasks.splice(i, 1);
              task.isRemoved = true;
              if (task.removeAbortListener) {
                task.removeAbortListener();
                task.removeAbortListener = null;
              }
              if (existingTasks.length === 0) {
                task.allRemoved = true;
                task.target[symbolEventName] = null;
              }
              break;
            }
          }
        }
      }
      if (!task.allRemoved) {
        return;
      }
      return nativeRemoveEventListener.call(task.target, task.eventName, task.capture ? globalZoneAwareCaptureCallback : globalZoneAwareCallback, task.options);
    };
    const customScheduleNonGlobal = function(task) {
      return nativeAddEventListener.call(taskData.target, taskData.eventName, task.invoke, taskData.options);
    };
    const customSchedulePrepend = function(task) {
      return nativePrependEventListener.call(taskData.target, taskData.eventName, task.invoke, taskData.options);
    };
    const customCancelNonGlobal = function(task) {
      return nativeRemoveEventListener.call(task.target, task.eventName, task.invoke, task.options);
    };
    const customSchedule = useGlobalCallback ? customScheduleGlobal : customScheduleNonGlobal;
    const customCancel = useGlobalCallback ? customCancelGlobal : customCancelNonGlobal;
    const compareTaskCallbackVsDelegate = function(task, delegate) {
      const typeOfDelegate = typeof delegate;
      return typeOfDelegate === "function" && task.callback === delegate || typeOfDelegate === "object" && task.originalDelegate === delegate;
    };
    const compare = patchOptions2?.diff || compareTaskCallbackVsDelegate;
    const unpatchedEvents = Zone[zoneSymbol("UNPATCHED_EVENTS")];
    const passiveEvents = _global2[zoneSymbol("PASSIVE_EVENTS")];
    function copyEventListenerOptions(options) {
      if (typeof options === "object" && options !== null) {
        const newOptions = { ...options };
        if (options.signal) {
          newOptions.signal = options.signal;
        }
        return newOptions;
      }
      return options;
    }
    const makeAddListener = function(nativeListener, addSource, customScheduleFn, customCancelFn, returnTarget2 = false, prepend = false) {
      return function() {
        const target = this || _global2;
        let eventName = arguments[0];
        if (patchOptions2 && patchOptions2.transferEventName) {
          eventName = patchOptions2.transferEventName(eventName);
        }
        let delegate = arguments[1];
        if (!delegate) {
          return nativeListener.apply(this, arguments);
        }
        if (isNode && eventName === "uncaughtException") {
          return nativeListener.apply(this, arguments);
        }
        let isEventListenerObject = false;
        if (typeof delegate !== "function") {
          if (!delegate.handleEvent) {
            return nativeListener.apply(this, arguments);
          }
          isEventListenerObject = true;
        }
        if (validateHandler && !validateHandler(nativeListener, delegate, target, arguments)) {
          return;
        }
        const passive = !!passiveEvents && passiveEvents.indexOf(eventName) !== -1;
        const options = copyEventListenerOptions(buildEventListenerOptions(arguments[2], passive));
        const signal = options?.signal;
        if (signal?.aborted) {
          return;
        }
        if (unpatchedEvents) {
          for (let i = 0; i < unpatchedEvents.length; i++) {
            if (eventName === unpatchedEvents[i]) {
              if (passive) {
                return nativeListener.call(target, eventName, delegate, options);
              } else {
                return nativeListener.apply(this, arguments);
              }
            }
          }
        }
        const capture = !options ? false : typeof options === "boolean" ? true : options.capture;
        const once = options && typeof options === "object" ? options.once : false;
        const zone = Zone.current;
        let symbolEventNames = zoneSymbolEventNames[eventName];
        if (!symbolEventNames) {
          prepareEventNames(eventName, eventNameToString);
          symbolEventNames = zoneSymbolEventNames[eventName];
        }
        const symbolEventName = symbolEventNames[capture ? TRUE_STR : FALSE_STR];
        let existingTasks = target[symbolEventName];
        let isExisting = false;
        if (existingTasks) {
          isExisting = true;
          if (checkDuplicate) {
            for (let i = 0; i < existingTasks.length; i++) {
              if (compare(existingTasks[i], delegate)) {
                return;
              }
            }
          }
        } else {
          existingTasks = target[symbolEventName] = [];
        }
        let source;
        const constructorName = target.constructor["name"];
        const targetSource = globalSources[constructorName];
        if (targetSource) {
          source = targetSource[eventName];
        }
        if (!source) {
          source = constructorName + addSource + (eventNameToString ? eventNameToString(eventName) : eventName);
        }
        taskData.options = options;
        if (once) {
          taskData.options.once = false;
        }
        taskData.target = target;
        taskData.capture = capture;
        taskData.eventName = eventName;
        taskData.isExisting = isExisting;
        const data = useGlobalCallback ? OPTIMIZED_ZONE_EVENT_TASK_DATA : void 0;
        if (data) {
          data.taskData = taskData;
        }
        if (signal) {
          taskData.options.signal = void 0;
        }
        const task = zone.scheduleEventTask(source, delegate, data, customScheduleFn, customCancelFn);
        if (signal) {
          taskData.options.signal = signal;
          const onAbort = () => task.zone.cancelTask(task);
          nativeListener.call(signal, "abort", onAbort, { once: true });
          task.removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        }
        taskData.target = null;
        if (data) {
          data.taskData = null;
        }
        if (once) {
          taskData.options.once = true;
        }
        if (typeof task.options !== "boolean") {
          task.options = options;
        }
        task.target = target;
        task.capture = capture;
        task.eventName = eventName;
        if (isEventListenerObject) {
          task.originalDelegate = delegate;
        }
        if (!prepend) {
          existingTasks.push(task);
        } else {
          existingTasks.unshift(task);
        }
        if (returnTarget2) {
          return target;
        }
      };
    };
    proto[ADD_EVENT_LISTENER] = makeAddListener(nativeAddEventListener, ADD_EVENT_LISTENER_SOURCE, customSchedule, customCancel, returnTarget);
    if (nativePrependEventListener) {
      proto[PREPEND_EVENT_LISTENER] = makeAddListener(nativePrependEventListener, PREPEND_EVENT_LISTENER_SOURCE, customSchedulePrepend, customCancel, returnTarget, true);
    }
    proto[REMOVE_EVENT_LISTENER] = function() {
      const target = this || _global2;
      let eventName = arguments[0];
      if (patchOptions2 && patchOptions2.transferEventName) {
        eventName = patchOptions2.transferEventName(eventName);
      }
      const options = arguments[2];
      const capture = !options ? false : typeof options === "boolean" ? true : options.capture;
      const delegate = arguments[1];
      if (!delegate) {
        return nativeRemoveEventListener.apply(this, arguments);
      }
      if (validateHandler && !validateHandler(nativeRemoveEventListener, delegate, target, arguments)) {
        return;
      }
      const symbolEventNames = zoneSymbolEventNames[eventName];
      let symbolEventName;
      if (symbolEventNames) {
        symbolEventName = symbolEventNames[capture ? TRUE_STR : FALSE_STR];
      }
      const existingTasks = symbolEventName && target[symbolEventName];
      if (existingTasks) {
        for (let i = 0; i < existingTasks.length; i++) {
          const existingTask = existingTasks[i];
          if (compare(existingTask, delegate)) {
            existingTasks.splice(i, 1);
            existingTask.isRemoved = true;
            if (existingTasks.length === 0) {
              existingTask.allRemoved = true;
              target[symbolEventName] = null;
              if (!capture && typeof eventName === "string") {
                const onPropertySymbol = ZONE_SYMBOL_PREFIX + "ON_PROPERTY" + eventName;
                target[onPropertySymbol] = null;
              }
            }
            existingTask.zone.cancelTask(existingTask);
            if (returnTarget) {
              return target;
            }
            return;
          }
        }
      }
      return nativeRemoveEventListener.apply(this, arguments);
    };
    proto[LISTENERS_EVENT_LISTENER] = function() {
      const target = this || _global2;
      let eventName = arguments[0];
      if (patchOptions2 && patchOptions2.transferEventName) {
        eventName = patchOptions2.transferEventName(eventName);
      }
      const listeners = [];
      const tasks = findEventTasks(target, eventNameToString ? eventNameToString(eventName) : eventName);
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        let delegate = task.originalDelegate ? task.originalDelegate : task.callback;
        listeners.push(delegate);
      }
      return listeners;
    };
    proto[REMOVE_ALL_LISTENERS_EVENT_LISTENER] = function() {
      const target = this || _global2;
      let eventName = arguments[0];
      if (!eventName) {
        const keys = Object.keys(target);
        for (let i = 0; i < keys.length; i++) {
          const prop = keys[i];
          const match = EVENT_NAME_SYMBOL_REGX.exec(prop);
          let evtName = match && match[1];
          if (evtName && evtName !== "removeListener") {
            this[REMOVE_ALL_LISTENERS_EVENT_LISTENER].call(this, evtName);
          }
        }
        this[REMOVE_ALL_LISTENERS_EVENT_LISTENER].call(this, "removeListener");
      } else {
        if (patchOptions2 && patchOptions2.transferEventName) {
          eventName = patchOptions2.transferEventName(eventName);
        }
        const symbolEventNames = zoneSymbolEventNames[eventName];
        if (symbolEventNames) {
          const symbolEventName = symbolEventNames[FALSE_STR];
          const symbolCaptureEventName = symbolEventNames[TRUE_STR];
          const tasks = target[symbolEventName];
          const captureTasks = target[symbolCaptureEventName];
          if (tasks) {
            const removeTasks = tasks.slice();
            for (let i = 0; i < removeTasks.length; i++) {
              const task = removeTasks[i];
              let delegate = task.originalDelegate ? task.originalDelegate : task.callback;
              this[REMOVE_EVENT_LISTENER].call(this, eventName, delegate, task.options);
            }
          }
          if (captureTasks) {
            const removeTasks = captureTasks.slice();
            for (let i = 0; i < removeTasks.length; i++) {
              const task = removeTasks[i];
              let delegate = task.originalDelegate ? task.originalDelegate : task.callback;
              this[REMOVE_EVENT_LISTENER].call(this, eventName, delegate, task.options);
            }
          }
        }
      }
      if (returnTarget) {
        return this;
      }
    };
    attachOriginToPatched(proto[ADD_EVENT_LISTENER], nativeAddEventListener);
    attachOriginToPatched(proto[REMOVE_EVENT_LISTENER], nativeRemoveEventListener);
    if (nativeRemoveAllListeners) {
      attachOriginToPatched(proto[REMOVE_ALL_LISTENERS_EVENT_LISTENER], nativeRemoveAllListeners);
    }
    if (nativeListeners) {
      attachOriginToPatched(proto[LISTENERS_EVENT_LISTENER], nativeListeners);
    }
    return true;
  }
  let results = [];
  for (let i = 0; i < apis.length; i++) {
    results[i] = patchEventTargetMethods(apis[i], patchOptions);
  }
  return results;
}
function findEventTasks(target, eventName) {
  if (!eventName) {
    const foundTasks = [];
    for (let prop in target) {
      const match = EVENT_NAME_SYMBOL_REGX.exec(prop);
      let evtName = match && match[1];
      if (evtName && (!eventName || evtName === eventName)) {
        const tasks = target[prop];
        if (tasks) {
          for (let i = 0; i < tasks.length; i++) {
            foundTasks.push(tasks[i]);
          }
        }
      }
    }
    return foundTasks;
  }
  let symbolEventName = zoneSymbolEventNames[eventName];
  if (!symbolEventName) {
    prepareEventNames(eventName);
    symbolEventName = zoneSymbolEventNames[eventName];
  }
  const captureFalseTasks = target[symbolEventName[FALSE_STR]];
  const captureTrueTasks = target[symbolEventName[TRUE_STR]];
  if (!captureFalseTasks) {
    return captureTrueTasks ? captureTrueTasks.slice() : [];
  } else {
    return captureTrueTasks ? captureFalseTasks.concat(captureTrueTasks) : captureFalseTasks.slice();
  }
}
function patchEventPrototype(global2, api) {
  const Event = global2["Event"];
  if (Event && Event.prototype) {
    api.patchMethod(Event.prototype, "stopImmediatePropagation", (delegate) => function(self2, args) {
      self2[IMMEDIATE_PROPAGATION_SYMBOL] = true;
      delegate && delegate.apply(self2, args);
    });
  }
}
function patchQueueMicrotask(global2, api) {
  api.patchMethod(global2, "queueMicrotask", (delegate) => {
    return function(self2, args) {
      Zone.current.scheduleMicroTask("queueMicrotask", args[0]);
    };
  });
}
var taskSymbol = zoneSymbol("zoneTask");
function patchTimer(window2, setName, cancelName, nameSuffix) {
  let setNative = null;
  let clearNative = null;
  setName += nameSuffix;
  cancelName += nameSuffix;
  const tasksByHandleId = {};
  function scheduleTask(task) {
    const data = task.data;
    data.args[0] = function() {
      return task.invoke.apply(this, arguments);
    };
    const handleOrId = setNative.apply(window2, data.args);
    if (isNumber(handleOrId)) {
      data.handleId = handleOrId;
    } else {
      data.handle = handleOrId;
      data.isRefreshable = isFunction(handleOrId.refresh);
    }
    return task;
  }
  function clearTask(task) {
    const { handle, handleId } = task.data;
    return clearNative.call(window2, handle ?? handleId);
  }
  setNative = patchMethod(window2, setName, (delegate) => function(self2, args) {
    if (isFunction(args[0])) {
      const options = {
        isRefreshable: false,
        isPeriodic: nameSuffix === "Interval",
        delay: nameSuffix === "Timeout" || nameSuffix === "Interval" ? args[1] || 0 : void 0,
        args
      };
      const callback = args[0];
      args[0] = function timer() {
        try {
          return callback.apply(this, arguments);
        } finally {
          const { handle: handle2, handleId: handleId2, isPeriodic: isPeriodic2, isRefreshable: isRefreshable2 } = options;
          if (!isPeriodic2 && !isRefreshable2) {
            if (handleId2) {
              delete tasksByHandleId[handleId2];
            } else if (handle2) {
              handle2[taskSymbol] = null;
            }
          }
        }
      };
      const task = scheduleMacroTaskWithCurrentZone(setName, args[0], options, scheduleTask, clearTask);
      if (!task) {
        return task;
      }
      const { handleId, handle, isRefreshable, isPeriodic } = task.data;
      if (handleId) {
        tasksByHandleId[handleId] = task;
      } else if (handle) {
        handle[taskSymbol] = task;
        if (isRefreshable && !isPeriodic) {
          const originalRefresh = handle.refresh;
          handle.refresh = function() {
            const { zone, state } = task;
            if (state === "notScheduled") {
              task._state = "scheduled";
              zone._updateTaskCount(task, 1);
            } else if (state === "running") {
              task._state = "scheduling";
            }
            return originalRefresh.call(this);
          };
        }
      }
      return handle ?? handleId ?? task;
    } else {
      return delegate.apply(window2, args);
    }
  });
  clearNative = patchMethod(window2, cancelName, (delegate) => function(self2, args) {
    const id = args[0];
    let task;
    if (isNumber(id)) {
      task = tasksByHandleId[id];
      delete tasksByHandleId[id];
    } else {
      task = id?.[taskSymbol];
      if (task) {
        id[taskSymbol] = null;
      } else {
        task = id;
      }
    }
    if (task?.type) {
      if (task.cancelFn) {
        task.zone.cancelTask(task);
      }
    } else {
      delegate.apply(window2, args);
    }
  });
}
function patchCustomElements(_global2, api) {
  const { isBrowser: isBrowser2, isMix: isMix2 } = api.getGlobalObjects();
  if (!isBrowser2 && !isMix2 || !_global2["customElements"] || !("customElements" in _global2)) {
    return;
  }
  const callbacks = [
    "connectedCallback",
    "disconnectedCallback",
    "adoptedCallback",
    "attributeChangedCallback",
    "formAssociatedCallback",
    "formDisabledCallback",
    "formResetCallback",
    "formStateRestoreCallback"
  ];
  api.patchCallbacks(api, _global2.customElements, "customElements", "define", callbacks);
}
function eventTargetPatch(_global2, api) {
  if (Zone[api.symbol("patchEventTarget")]) {
    return;
  }
  const { eventNames, zoneSymbolEventNames: zoneSymbolEventNames2, TRUE_STR: TRUE_STR2, FALSE_STR: FALSE_STR2, ZONE_SYMBOL_PREFIX: ZONE_SYMBOL_PREFIX2 } = api.getGlobalObjects();
  for (let i = 0; i < eventNames.length; i++) {
    const eventName = eventNames[i];
    const falseEventName = eventName + FALSE_STR2;
    const trueEventName = eventName + TRUE_STR2;
    const symbol = ZONE_SYMBOL_PREFIX2 + falseEventName;
    const symbolCapture = ZONE_SYMBOL_PREFIX2 + trueEventName;
    zoneSymbolEventNames2[eventName] = {};
    zoneSymbolEventNames2[eventName][FALSE_STR2] = symbol;
    zoneSymbolEventNames2[eventName][TRUE_STR2] = symbolCapture;
  }
  const EVENT_TARGET = _global2["EventTarget"];
  if (!EVENT_TARGET || !EVENT_TARGET.prototype) {
    return;
  }
  api.patchEventTarget(_global2, api, [EVENT_TARGET && EVENT_TARGET.prototype]);
  return true;
}
function patchEvent(global2, api) {
  api.patchEventPrototype(global2, api);
}
function filterProperties(target, onProperties, ignoreProperties) {
  if (!ignoreProperties || ignoreProperties.length === 0) {
    return onProperties;
  }
  const tip = ignoreProperties.filter((ip) => ip.target === target);
  if (tip.length === 0) {
    return onProperties;
  }
  const targetIgnoreProperties = tip[0].ignoreProperties;
  return onProperties.filter((op) => targetIgnoreProperties.indexOf(op) === -1);
}
function patchFilteredProperties(target, onProperties, ignoreProperties, prototype) {
  if (!target) {
    return;
  }
  const filteredProperties = filterProperties(target, onProperties, ignoreProperties);
  patchOnProperties(target, filteredProperties, prototype);
}
function getOnEventNames(target) {
  return Object.getOwnPropertyNames(target).filter((name) => name.startsWith("on") && name.length > 2).map((name) => name.substring(2));
}
function propertyDescriptorPatch(api, _global2) {
  if (isNode && !isMix) {
    return;
  }
  if (Zone[api.symbol("patchEvents")]) {
    return;
  }
  const ignoreProperties = _global2["__Zone_ignore_on_properties"];
  let patchTargets = [];
  if (isBrowser) {
    const internalWindow2 = window;
    patchTargets = patchTargets.concat([
      "Document",
      "SVGElement",
      "Element",
      "HTMLElement",
      "HTMLBodyElement",
      "HTMLMediaElement",
      "HTMLFrameSetElement",
      "HTMLFrameElement",
      "HTMLIFrameElement",
      "HTMLMarqueeElement",
      "Worker"
    ]);
    const ignoreErrorProperties = [];
    patchFilteredProperties(internalWindow2, getOnEventNames(internalWindow2), ignoreProperties ? ignoreProperties.concat(ignoreErrorProperties) : ignoreProperties, ObjectGetPrototypeOf(internalWindow2));
  }
  patchTargets = patchTargets.concat([
    "XMLHttpRequest",
    "XMLHttpRequestEventTarget",
    "IDBIndex",
    "IDBRequest",
    "IDBOpenDBRequest",
    "IDBDatabase",
    "IDBTransaction",
    "IDBCursor",
    "WebSocket"
  ]);
  for (let i = 0; i < patchTargets.length; i++) {
    const target = _global2[patchTargets[i]];
    target?.prototype && patchFilteredProperties(target.prototype, getOnEventNames(target.prototype), ignoreProperties);
  }
}
function patchBrowser(Zone2) {
  Zone2.__load_patch("legacy", (global2) => {
    const legacyPatch = global2[Zone2.__symbol__("legacyPatch")];
    if (legacyPatch) {
      legacyPatch();
    }
  });
  Zone2.__load_patch("timers", (global2) => {
    const set = "set";
    const clear = "clear";
    patchTimer(global2, set, clear, "Timeout");
    patchTimer(global2, set, clear, "Interval");
    patchTimer(global2, set, clear, "Immediate");
  });
  Zone2.__load_patch("requestAnimationFrame", (global2) => {
    patchTimer(global2, "request", "cancel", "AnimationFrame");
    patchTimer(global2, "mozRequest", "mozCancel", "AnimationFrame");
    patchTimer(global2, "webkitRequest", "webkitCancel", "AnimationFrame");
  });
  Zone2.__load_patch("blocking", (global2, Zone3) => {
    const blockingMethods = ["alert", "prompt", "confirm"];
    for (let i = 0; i < blockingMethods.length; i++) {
      const name = blockingMethods[i];
      patchMethod(global2, name, (delegate, symbol, name2) => {
        return function(s, args) {
          return Zone3.current.run(delegate, global2, args, name2);
        };
      });
    }
  });
  Zone2.__load_patch("EventTarget", (global2, Zone3, api) => {
    patchEvent(global2, api);
    eventTargetPatch(global2, api);
    const XMLHttpRequestEventTarget = global2["XMLHttpRequestEventTarget"];
    if (XMLHttpRequestEventTarget && XMLHttpRequestEventTarget.prototype) {
      api.patchEventTarget(global2, api, [XMLHttpRequestEventTarget.prototype]);
    }
  });
  Zone2.__load_patch("MutationObserver", (global2, Zone3, api) => {
    patchClass("MutationObserver");
    patchClass("WebKitMutationObserver");
  });
  Zone2.__load_patch("IntersectionObserver", (global2, Zone3, api) => {
    patchClass("IntersectionObserver");
  });
  Zone2.__load_patch("FileReader", (global2, Zone3, api) => {
    patchClass("FileReader");
  });
  Zone2.__load_patch("on_property", (global2, Zone3, api) => {
    propertyDescriptorPatch(api, global2);
  });
  Zone2.__load_patch("customElements", (global2, Zone3, api) => {
    patchCustomElements(global2, api);
  });
  Zone2.__load_patch("XHR", (global2, Zone3) => {
    patchXHR(global2);
    const XHR_TASK = zoneSymbol("xhrTask");
    const XHR_SYNC = zoneSymbol("xhrSync");
    const XHR_LISTENER = zoneSymbol("xhrListener");
    const XHR_SCHEDULED = zoneSymbol("xhrScheduled");
    const XHR_URL = zoneSymbol("xhrURL");
    const XHR_ERROR_BEFORE_SCHEDULED = zoneSymbol("xhrErrorBeforeScheduled");
    function patchXHR(window2) {
      const XMLHttpRequest = window2["XMLHttpRequest"];
      if (!XMLHttpRequest) {
        return;
      }
      const XMLHttpRequestPrototype = XMLHttpRequest.prototype;
      function findPendingTask(target) {
        return target[XHR_TASK];
      }
      let oriAddListener = XMLHttpRequestPrototype[ZONE_SYMBOL_ADD_EVENT_LISTENER];
      let oriRemoveListener = XMLHttpRequestPrototype[ZONE_SYMBOL_REMOVE_EVENT_LISTENER];
      if (!oriAddListener) {
        const XMLHttpRequestEventTarget = window2["XMLHttpRequestEventTarget"];
        if (XMLHttpRequestEventTarget) {
          const XMLHttpRequestEventTargetPrototype = XMLHttpRequestEventTarget.prototype;
          oriAddListener = XMLHttpRequestEventTargetPrototype[ZONE_SYMBOL_ADD_EVENT_LISTENER];
          oriRemoveListener = XMLHttpRequestEventTargetPrototype[ZONE_SYMBOL_REMOVE_EVENT_LISTENER];
        }
      }
      const READY_STATE_CHANGE = "readystatechange";
      const SCHEDULED = "scheduled";
      function scheduleTask(task) {
        const data = task.data;
        const target = data.target;
        target[XHR_SCHEDULED] = false;
        target[XHR_ERROR_BEFORE_SCHEDULED] = false;
        const listener = target[XHR_LISTENER];
        if (!oriAddListener) {
          oriAddListener = target[ZONE_SYMBOL_ADD_EVENT_LISTENER];
          oriRemoveListener = target[ZONE_SYMBOL_REMOVE_EVENT_LISTENER];
        }
        if (listener) {
          oriRemoveListener.call(target, READY_STATE_CHANGE, listener);
        }
        const newListener = target[XHR_LISTENER] = () => {
          if (target.readyState === target.DONE) {
            if (!data.aborted && target[XHR_SCHEDULED] && task.state === SCHEDULED) {
              const loadTasks = target[Zone3.__symbol__("loadfalse")];
              if (target.status !== 0 && loadTasks && loadTasks.length > 0) {
                const oriInvoke = task.invoke;
                task.invoke = function() {
                  const loadTasks2 = target[Zone3.__symbol__("loadfalse")];
                  for (let i = 0; i < loadTasks2.length; i++) {
                    if (loadTasks2[i] === task) {
                      loadTasks2.splice(i, 1);
                    }
                  }
                  if (!data.aborted && task.state === SCHEDULED) {
                    oriInvoke.call(task);
                  }
                };
                loadTasks.push(task);
              } else {
                task.invoke();
              }
            } else if (!data.aborted && target[XHR_SCHEDULED] === false) {
              target[XHR_ERROR_BEFORE_SCHEDULED] = true;
            }
          }
        };
        oriAddListener.call(target, READY_STATE_CHANGE, newListener);
        const storedTask = target[XHR_TASK];
        if (!storedTask) {
          target[XHR_TASK] = task;
        }
        sendNative.apply(target, data.args);
        target[XHR_SCHEDULED] = true;
        return task;
      }
      function placeholderCallback() {
      }
      function clearTask(task) {
        const data = task.data;
        data.aborted = true;
        return abortNative.apply(data.target, data.args);
      }
      const openNative = patchMethod(XMLHttpRequestPrototype, "open", () => function(self2, args) {
        self2[XHR_SYNC] = args[2] == false;
        self2[XHR_URL] = args[1];
        return openNative.apply(self2, args);
      });
      const XMLHTTPREQUEST_SOURCE = "XMLHttpRequest.send";
      const fetchTaskAborting = zoneSymbol("fetchTaskAborting");
      const fetchTaskScheduling = zoneSymbol("fetchTaskScheduling");
      const sendNative = patchMethod(XMLHttpRequestPrototype, "send", () => function(self2, args) {
        if (Zone3.current[fetchTaskScheduling] === true) {
          return sendNative.apply(self2, args);
        }
        if (self2[XHR_SYNC]) {
          return sendNative.apply(self2, args);
        } else {
          const options = {
            target: self2,
            url: self2[XHR_URL],
            isPeriodic: false,
            args,
            aborted: false
          };
          const task = scheduleMacroTaskWithCurrentZone(XMLHTTPREQUEST_SOURCE, placeholderCallback, options, scheduleTask, clearTask);
          if (self2 && self2[XHR_ERROR_BEFORE_SCHEDULED] === true && !options.aborted && task.state === SCHEDULED) {
            task.invoke();
          }
        }
      });
      const abortNative = patchMethod(XMLHttpRequestPrototype, "abort", () => function(self2, args) {
        const task = findPendingTask(self2);
        if (task && typeof task.type == "string") {
          if (task.cancelFn == null || task.data && task.data.aborted) {
            return;
          }
          task.zone.cancelTask(task);
        } else if (Zone3.current[fetchTaskAborting] === true) {
          return abortNative.apply(self2, args);
        }
      });
    }
  });
  Zone2.__load_patch("geolocation", (global2) => {
    if (global2["navigator"] && global2["navigator"].geolocation) {
      patchPrototype(global2["navigator"].geolocation, ["getCurrentPosition", "watchPosition"]);
    }
  });
  Zone2.__load_patch("PromiseRejectionEvent", (global2, Zone3) => {
    function findPromiseRejectionHandler(evtName) {
      return function(e) {
        const eventTasks = findEventTasks(global2, evtName);
        eventTasks.forEach((eventTask) => {
          const PromiseRejectionEvent = global2["PromiseRejectionEvent"];
          if (PromiseRejectionEvent) {
            const evt = new PromiseRejectionEvent(evtName, {
              promise: e.promise,
              reason: e.rejection
            });
            eventTask.invoke(evt);
          }
        });
      };
    }
    if (global2["PromiseRejectionEvent"]) {
      Zone3[zoneSymbol("unhandledPromiseRejectionHandler")] = findPromiseRejectionHandler("unhandledrejection");
      Zone3[zoneSymbol("rejectionHandledHandler")] = findPromiseRejectionHandler("rejectionhandled");
    }
  });
  Zone2.__load_patch("queueMicrotask", (global2, Zone3, api) => {
    patchQueueMicrotask(global2, api);
  });
}
function patchPromise(Zone2) {
  Zone2.__load_patch("ZoneAwarePromise", (global2, Zone3, api) => {
    const ObjectGetOwnPropertyDescriptor2 = Object.getOwnPropertyDescriptor;
    const ObjectDefineProperty2 = Object.defineProperty;
    function readableObjectToString(obj) {
      if (obj && obj.toString === Object.prototype.toString) {
        const className = obj.constructor && obj.constructor.name;
        return (className ? className : "") + ": " + JSON.stringify(obj);
      }
      return obj ? obj.toString() : Object.prototype.toString.call(obj);
    }
    const __symbol__2 = api.symbol;
    const _uncaughtPromiseErrors = [];
    const isDisableWrappingUncaughtPromiseRejection = global2[__symbol__2("DISABLE_WRAPPING_UNCAUGHT_PROMISE_REJECTION")] !== false;
    const symbolPromise = __symbol__2("Promise");
    const symbolThen = __symbol__2("then");
    const creationTrace = "__creationTrace__";
    api.onUnhandledError = (e) => {
      if (api.showUncaughtError()) {
        const rejection = e && e.rejection;
        if (rejection) {
          console.error("Unhandled Promise rejection:", rejection instanceof Error ? rejection.message : rejection, "; Zone:", e.zone.name, "; Task:", e.task && e.task.source, "; Value:", rejection, rejection instanceof Error ? rejection.stack : void 0);
        } else {
          console.error(e);
        }
      }
    };
    api.microtaskDrainDone = () => {
      while (_uncaughtPromiseErrors.length) {
        const uncaughtPromiseError = _uncaughtPromiseErrors.shift();
        try {
          uncaughtPromiseError.zone.runGuarded(() => {
            if (uncaughtPromiseError.throwOriginal) {
              throw uncaughtPromiseError.rejection;
            }
            throw uncaughtPromiseError;
          });
        } catch (error) {
          handleUnhandledRejection(error);
        }
      }
    };
    const UNHANDLED_PROMISE_REJECTION_HANDLER_SYMBOL = __symbol__2("unhandledPromiseRejectionHandler");
    function handleUnhandledRejection(e) {
      api.onUnhandledError(e);
      try {
        const handler = Zone3[UNHANDLED_PROMISE_REJECTION_HANDLER_SYMBOL];
        if (typeof handler === "function") {
          handler.call(this, e);
        }
      } catch (err) {
      }
    }
    function isThenable(value) {
      return value && typeof value.then === "function";
    }
    function forwardResolution(value) {
      return value;
    }
    function forwardRejection(rejection) {
      return ZoneAwarePromise.reject(rejection);
    }
    const symbolState = __symbol__2("state");
    const symbolValue = __symbol__2("value");
    const symbolFinally = __symbol__2("finally");
    const symbolParentPromiseValue = __symbol__2("parentPromiseValue");
    const symbolParentPromiseState = __symbol__2("parentPromiseState");
    const source = "Promise.then";
    const UNRESOLVED = null;
    const RESOLVED = true;
    const REJECTED = false;
    const REJECTED_NO_CATCH = 0;
    function makeResolver(promise, state) {
      return (v) => {
        try {
          resolvePromise(promise, state, v);
        } catch (err) {
          resolvePromise(promise, false, err);
        }
      };
    }
    const once = function() {
      let wasCalled = false;
      return function wrapper(wrappedFunction) {
        return function() {
          if (wasCalled) {
            return;
          }
          wasCalled = true;
          wrappedFunction.apply(null, arguments);
        };
      };
    };
    const TYPE_ERROR = "Promise resolved with itself";
    const CURRENT_TASK_TRACE_SYMBOL = __symbol__2("currentTaskTrace");
    function resolvePromise(promise, state, value) {
      const onceWrapper = once();
      if (promise === value) {
        throw new TypeError(TYPE_ERROR);
      }
      if (promise[symbolState] === UNRESOLVED) {
        let then = null;
        try {
          if (typeof value === "object" || typeof value === "function") {
            then = value && value.then;
          }
        } catch (err) {
          onceWrapper(() => {
            resolvePromise(promise, false, err);
          })();
          return promise;
        }
        if (state !== REJECTED && value instanceof ZoneAwarePromise && value.hasOwnProperty(symbolState) && value.hasOwnProperty(symbolValue) && value[symbolState] !== UNRESOLVED) {
          clearRejectedNoCatch(value);
          resolvePromise(promise, value[symbolState], value[symbolValue]);
        } else if (state !== REJECTED && typeof then === "function") {
          try {
            then.call(value, onceWrapper(makeResolver(promise, state)), onceWrapper(makeResolver(promise, false)));
          } catch (err) {
            onceWrapper(() => {
              resolvePromise(promise, false, err);
            })();
          }
        } else {
          promise[symbolState] = state;
          const queue = promise[symbolValue];
          promise[symbolValue] = value;
          if (promise[symbolFinally] === symbolFinally) {
            if (state === RESOLVED) {
              promise[symbolState] = promise[symbolParentPromiseState];
              promise[symbolValue] = promise[symbolParentPromiseValue];
            }
          }
          if (state === REJECTED && value instanceof Error) {
            const trace = Zone3.currentTask && Zone3.currentTask.data && Zone3.currentTask.data[creationTrace];
            if (trace) {
              ObjectDefineProperty2(value, CURRENT_TASK_TRACE_SYMBOL, {
                configurable: true,
                enumerable: false,
                writable: true,
                value: trace
              });
            }
          }
          for (let i = 0; i < queue.length; ) {
            scheduleResolveOrReject(promise, queue[i++], queue[i++], queue[i++], queue[i++]);
          }
          if (queue.length == 0 && state == REJECTED) {
            promise[symbolState] = REJECTED_NO_CATCH;
            let uncaughtPromiseError = value;
            try {
              throw new Error("Uncaught (in promise): " + readableObjectToString(value) + (value && value.stack ? "\n" + value.stack : ""));
            } catch (err) {
              uncaughtPromiseError = err;
            }
            if (isDisableWrappingUncaughtPromiseRejection) {
              uncaughtPromiseError.throwOriginal = true;
            }
            uncaughtPromiseError.rejection = value;
            uncaughtPromiseError.promise = promise;
            uncaughtPromiseError.zone = Zone3.current;
            uncaughtPromiseError.task = Zone3.currentTask;
            _uncaughtPromiseErrors.push(uncaughtPromiseError);
            api.scheduleMicroTask();
          }
        }
      }
      return promise;
    }
    const REJECTION_HANDLED_HANDLER = __symbol__2("rejectionHandledHandler");
    function clearRejectedNoCatch(promise) {
      if (promise[symbolState] === REJECTED_NO_CATCH) {
        try {
          const handler = Zone3[REJECTION_HANDLED_HANDLER];
          if (handler && typeof handler === "function") {
            handler.call(this, { rejection: promise[symbolValue], promise });
          }
        } catch (err) {
        }
        promise[symbolState] = REJECTED;
        for (let i = 0; i < _uncaughtPromiseErrors.length; i++) {
          if (promise === _uncaughtPromiseErrors[i].promise) {
            _uncaughtPromiseErrors.splice(i, 1);
          }
        }
      }
    }
    function scheduleResolveOrReject(promise, zone, chainPromise, onFulfilled, onRejected) {
      clearRejectedNoCatch(promise);
      const promiseState = promise[symbolState];
      const delegate = promiseState ? typeof onFulfilled === "function" ? onFulfilled : forwardResolution : typeof onRejected === "function" ? onRejected : forwardRejection;
      zone.scheduleMicroTask(source, () => {
        try {
          const parentPromiseValue = promise[symbolValue];
          const isFinallyPromise = !!chainPromise && symbolFinally === chainPromise[symbolFinally];
          if (isFinallyPromise) {
            chainPromise[symbolParentPromiseValue] = parentPromiseValue;
            chainPromise[symbolParentPromiseState] = promiseState;
          }
          const value = zone.run(delegate, void 0, isFinallyPromise && delegate !== forwardRejection && delegate !== forwardResolution ? [] : [parentPromiseValue]);
          resolvePromise(chainPromise, true, value);
        } catch (error) {
          resolvePromise(chainPromise, false, error);
        }
      }, chainPromise);
    }
    const ZONE_AWARE_PROMISE_TO_STRING = "function ZoneAwarePromise() { [native code] }";
    const noop = function() {
    };
    const AggregateError = global2.AggregateError;
    class ZoneAwarePromise {
      static toString() {
        return ZONE_AWARE_PROMISE_TO_STRING;
      }
      static resolve(value) {
        if (value instanceof ZoneAwarePromise) {
          return value;
        }
        return resolvePromise(new this(null), RESOLVED, value);
      }
      static reject(error) {
        return resolvePromise(new this(null), REJECTED, error);
      }
      static withResolvers() {
        const result = {};
        result.promise = new ZoneAwarePromise((res, rej) => {
          result.resolve = res;
          result.reject = rej;
        });
        return result;
      }
      static any(values) {
        if (!values || typeof values[Symbol.iterator] !== "function") {
          return Promise.reject(new AggregateError([], "All promises were rejected"));
        }
        const promises = [];
        let count = 0;
        try {
          for (let v of values) {
            count++;
            promises.push(ZoneAwarePromise.resolve(v));
          }
        } catch (err) {
          return Promise.reject(new AggregateError([], "All promises were rejected"));
        }
        if (count === 0) {
          return Promise.reject(new AggregateError([], "All promises were rejected"));
        }
        let finished = false;
        const errors = [];
        return new ZoneAwarePromise((resolve, reject) => {
          for (let i = 0; i < promises.length; i++) {
            promises[i].then((v) => {
              if (finished) {
                return;
              }
              finished = true;
              resolve(v);
            }, (err) => {
              errors.push(err);
              count--;
              if (count === 0) {
                finished = true;
                reject(new AggregateError(errors, "All promises were rejected"));
              }
            });
          }
        });
      }
      static race(values) {
        let resolve;
        let reject;
        let promise = new this((res, rej) => {
          resolve = res;
          reject = rej;
        });
        function onResolve(value) {
          resolve(value);
        }
        function onReject(error) {
          reject(error);
        }
        for (let value of values) {
          if (!isThenable(value)) {
            value = this.resolve(value);
          }
          value.then(onResolve, onReject);
        }
        return promise;
      }
      static all(values) {
        return ZoneAwarePromise.allWithCallback(values);
      }
      static allSettled(values) {
        const P = this && this.prototype instanceof ZoneAwarePromise ? this : ZoneAwarePromise;
        return P.allWithCallback(values, {
          thenCallback: (value) => ({ status: "fulfilled", value }),
          errorCallback: (err) => ({ status: "rejected", reason: err })
        });
      }
      static allWithCallback(values, callback) {
        let resolve;
        let reject;
        let promise = new this((res, rej) => {
          resolve = res;
          reject = rej;
        });
        let unresolvedCount = 2;
        let valueIndex = 0;
        const resolvedValues = [];
        for (let value of values) {
          if (!isThenable(value)) {
            value = this.resolve(value);
          }
          const curValueIndex = valueIndex;
          try {
            value.then((value2) => {
              resolvedValues[curValueIndex] = callback ? callback.thenCallback(value2) : value2;
              unresolvedCount--;
              if (unresolvedCount === 0) {
                resolve(resolvedValues);
              }
            }, (err) => {
              if (!callback) {
                reject(err);
              } else {
                resolvedValues[curValueIndex] = callback.errorCallback(err);
                unresolvedCount--;
                if (unresolvedCount === 0) {
                  resolve(resolvedValues);
                }
              }
            });
          } catch (thenErr) {
            reject(thenErr);
          }
          unresolvedCount++;
          valueIndex++;
        }
        unresolvedCount -= 2;
        if (unresolvedCount === 0) {
          resolve(resolvedValues);
        }
        return promise;
      }
      constructor(executor) {
        const promise = this;
        if (!(promise instanceof ZoneAwarePromise)) {
          throw new Error("Must be an instanceof Promise.");
        }
        promise[symbolState] = UNRESOLVED;
        promise[symbolValue] = [];
        try {
          const onceWrapper = once();
          executor && executor(onceWrapper(makeResolver(promise, RESOLVED)), onceWrapper(makeResolver(promise, REJECTED)));
        } catch (error) {
          resolvePromise(promise, false, error);
        }
      }
      get [Symbol.toStringTag]() {
        return "Promise";
      }
      get [Symbol.species]() {
        return ZoneAwarePromise;
      }
      then(onFulfilled, onRejected) {
        let C = this.constructor?.[Symbol.species];
        if (!C || typeof C !== "function") {
          C = this.constructor || ZoneAwarePromise;
        }
        const chainPromise = new C(noop);
        const zone = Zone3.current;
        if (this[symbolState] == UNRESOLVED) {
          this[symbolValue].push(zone, chainPromise, onFulfilled, onRejected);
        } else {
          scheduleResolveOrReject(this, zone, chainPromise, onFulfilled, onRejected);
        }
        return chainPromise;
      }
      catch(onRejected) {
        return this.then(null, onRejected);
      }
      finally(onFinally) {
        let C = this.constructor?.[Symbol.species];
        if (!C || typeof C !== "function") {
          C = ZoneAwarePromise;
        }
        const chainPromise = new C(noop);
        chainPromise[symbolFinally] = symbolFinally;
        const zone = Zone3.current;
        if (this[symbolState] == UNRESOLVED) {
          this[symbolValue].push(zone, chainPromise, onFinally, onFinally);
        } else {
          scheduleResolveOrReject(this, zone, chainPromise, onFinally, onFinally);
        }
        return chainPromise;
      }
    }
    ZoneAwarePromise["resolve"] = ZoneAwarePromise.resolve;
    ZoneAwarePromise["reject"] = ZoneAwarePromise.reject;
    ZoneAwarePromise["race"] = ZoneAwarePromise.race;
    ZoneAwarePromise["all"] = ZoneAwarePromise.all;
    const NativePromise = global2[symbolPromise] = global2["Promise"];
    global2["Promise"] = ZoneAwarePromise;
    const symbolThenPatched = __symbol__2("thenPatched");
    function patchThen(Ctor) {
      const proto = Ctor.prototype;
      const prop = ObjectGetOwnPropertyDescriptor2(proto, "then");
      if (prop && (prop.writable === false || !prop.configurable)) {
        return;
      }
      const originalThen = proto.then;
      proto[symbolThen] = originalThen;
      Ctor.prototype.then = function(onResolve, onReject) {
        const wrapped = new ZoneAwarePromise((resolve, reject) => {
          originalThen.call(this, resolve, reject);
        });
        return wrapped.then(onResolve, onReject);
      };
      Ctor[symbolThenPatched] = true;
    }
    api.patchThen = patchThen;
    function zoneify(fn) {
      return function(self2, args) {
        let resultPromise = fn.apply(self2, args);
        if (resultPromise instanceof ZoneAwarePromise) {
          return resultPromise;
        }
        let ctor = resultPromise.constructor;
        if (!ctor[symbolThenPatched]) {
          patchThen(ctor);
        }
        return resultPromise;
      };
    }
    if (NativePromise) {
      patchThen(NativePromise);
      patchMethod(global2, "fetch", (delegate) => zoneify(delegate));
    }
    Promise[Zone3.__symbol__("uncaughtPromiseErrors")] = _uncaughtPromiseErrors;
    return ZoneAwarePromise;
  });
}
function patchToString(Zone2) {
  Zone2.__load_patch("toString", (global2) => {
    const originalFunctionToString = Function.prototype.toString;
    const ORIGINAL_DELEGATE_SYMBOL = zoneSymbol("OriginalDelegate");
    const PROMISE_SYMBOL = zoneSymbol("Promise");
    const ERROR_SYMBOL = zoneSymbol("Error");
    const newFunctionToString = function toString() {
      if (typeof this === "function") {
        const originalDelegate = this[ORIGINAL_DELEGATE_SYMBOL];
        if (originalDelegate) {
          if (typeof originalDelegate === "function") {
            return originalFunctionToString.call(originalDelegate);
          } else {
            return Object.prototype.toString.call(originalDelegate);
          }
        }
        if (this === Promise) {
          const nativePromise = global2[PROMISE_SYMBOL];
          if (nativePromise) {
            return originalFunctionToString.call(nativePromise);
          }
        }
        if (this === Error) {
          const nativeError = global2[ERROR_SYMBOL];
          if (nativeError) {
            return originalFunctionToString.call(nativeError);
          }
        }
      }
      return originalFunctionToString.call(this);
    };
    newFunctionToString[ORIGINAL_DELEGATE_SYMBOL] = originalFunctionToString;
    Function.prototype.toString = newFunctionToString;
    const originalObjectToString = Object.prototype.toString;
    const PROMISE_OBJECT_TO_STRING = "[object Promise]";
    Object.prototype.toString = function() {
      if (typeof Promise === "function" && this instanceof Promise) {
        return PROMISE_OBJECT_TO_STRING;
      }
      return originalObjectToString.call(this);
    };
  });
}
function patchCallbacks(api, target, targetName, method, callbacks) {
  const symbol = Zone.__symbol__(method);
  if (target[symbol]) {
    return;
  }
  const nativeDelegate = target[symbol] = target[method];
  target[method] = function(name, opts, options) {
    if (opts && opts.prototype) {
      callbacks.forEach(function(callback) {
        const source = `${targetName}.${method}::` + callback;
        const prototype = opts.prototype;
        try {
          if (prototype.hasOwnProperty(callback)) {
            const descriptor = api.ObjectGetOwnPropertyDescriptor(prototype, callback);
            if (descriptor && descriptor.value) {
              descriptor.value = api.wrapWithCurrentZone(descriptor.value, source);
              api._redefineProperty(opts.prototype, callback, descriptor);
            } else if (prototype[callback]) {
              prototype[callback] = api.wrapWithCurrentZone(prototype[callback], source);
            }
          } else if (prototype[callback]) {
            prototype[callback] = api.wrapWithCurrentZone(prototype[callback], source);
          }
        } catch {
        }
      });
    }
    return nativeDelegate.call(target, name, opts, options);
  };
  api.attachOriginToPatched(target[method], nativeDelegate);
}
function patchUtil(Zone2) {
  Zone2.__load_patch("util", (global2, Zone3, api) => {
    const eventNames = getOnEventNames(global2);
    api.patchOnProperties = patchOnProperties;
    api.patchMethod = patchMethod;
    api.bindArguments = bindArguments;
    api.patchMacroTask = patchMacroTask;
    const SYMBOL_BLACK_LISTED_EVENTS = Zone3.__symbol__("BLACK_LISTED_EVENTS");
    const SYMBOL_UNPATCHED_EVENTS = Zone3.__symbol__("UNPATCHED_EVENTS");
    if (global2[SYMBOL_UNPATCHED_EVENTS]) {
      global2[SYMBOL_BLACK_LISTED_EVENTS] = global2[SYMBOL_UNPATCHED_EVENTS];
    }
    if (global2[SYMBOL_BLACK_LISTED_EVENTS]) {
      Zone3[SYMBOL_BLACK_LISTED_EVENTS] = Zone3[SYMBOL_UNPATCHED_EVENTS] = global2[SYMBOL_BLACK_LISTED_EVENTS];
    }
    api.patchEventPrototype = patchEventPrototype;
    api.patchEventTarget = patchEventTarget;
    api.isIEOrEdge = isIEOrEdge;
    api.ObjectDefineProperty = ObjectDefineProperty;
    api.ObjectGetOwnPropertyDescriptor = ObjectGetOwnPropertyDescriptor;
    api.ObjectCreate = ObjectCreate;
    api.ArraySlice = ArraySlice;
    api.patchClass = patchClass;
    api.wrapWithCurrentZone = wrapWithCurrentZone;
    api.filterProperties = filterProperties;
    api.attachOriginToPatched = attachOriginToPatched;
    api._redefineProperty = Object.defineProperty;
    api.patchCallbacks = patchCallbacks;
    api.getGlobalObjects = () => ({
      globalSources,
      zoneSymbolEventNames,
      eventNames,
      isBrowser,
      isMix,
      isNode,
      TRUE_STR,
      FALSE_STR,
      ZONE_SYMBOL_PREFIX,
      ADD_EVENT_LISTENER_STR,
      REMOVE_EVENT_LISTENER_STR
    });
  });
}
function patchCommon(Zone2) {
  patchPromise(Zone2);
  patchToString(Zone2);
  patchUtil(Zone2);
}
var Zone$1 = loadZone();
patchCommon(Zone$1);
patchBrowser(Zone$1);
/*! Bundled license information:

zone.js/fesm2015/zone.js:
  (**
   * @license Angular v<unknown>
   * (c) 2010-2025 Google LLC. https://angular.io/
   * License: MIT
   *)
*/


//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy96b25lLmpzL2Zlc20yMDE1L3pvbmUuanMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuLyoqXG4gKiBAbGljZW5zZSBBbmd1bGFyIHY8dW5rbm93bj5cbiAqIChjKSAyMDEwLTIwMjUgR29vZ2xlIExMQy4gaHR0cHM6Ly9hbmd1bGFyLmlvL1xuICogTGljZW5zZTogTUlUXG4gKi9cbmNvbnN0IGdsb2JhbCA9IGdsb2JhbFRoaXM7XG4vLyBfX1pvbmVfc3ltYm9sX3ByZWZpeCBnbG9iYWwgY2FuIGJlIHVzZWQgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgem9uZVxuLy8gc3ltYm9sIHByZWZpeCB3aXRoIGEgY3VzdG9tIG9uZSBpZiBuZWVkZWQuXG5mdW5jdGlvbiBfX3N5bWJvbF9fKG5hbWUpIHtcbiAgICBjb25zdCBzeW1ib2xQcmVmaXggPSBnbG9iYWxbJ19fWm9uZV9zeW1ib2xfcHJlZml4J10gfHwgJ19fem9uZV9zeW1ib2xfXyc7XG4gICAgcmV0dXJuIHN5bWJvbFByZWZpeCArIG5hbWU7XG59XG5mdW5jdGlvbiBpbml0Wm9uZSgpIHtcbiAgICBjb25zdCBwZXJmb3JtYW5jZSA9IGdsb2JhbFsncGVyZm9ybWFuY2UnXTtcbiAgICBmdW5jdGlvbiBtYXJrKG5hbWUpIHtcbiAgICAgICAgcGVyZm9ybWFuY2UgJiYgcGVyZm9ybWFuY2VbJ21hcmsnXSAmJiBwZXJmb3JtYW5jZVsnbWFyayddKG5hbWUpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBwZXJmb3JtYW5jZU1lYXN1cmUobmFtZSwgbGFiZWwpIHtcbiAgICAgICAgcGVyZm9ybWFuY2UgJiYgcGVyZm9ybWFuY2VbJ21lYXN1cmUnXSAmJiBwZXJmb3JtYW5jZVsnbWVhc3VyZSddKG5hbWUsIGxhYmVsKTtcbiAgICB9XG4gICAgbWFyaygnWm9uZScpO1xuICAgIGNsYXNzIFpvbmVJbXBsIHtcbiAgICAgICAgc3RhdGljIF9fc3ltYm9sX18gPSBfX3N5bWJvbF9fO1xuICAgICAgICBzdGF0aWMgYXNzZXJ0Wm9uZVBhdGNoZWQoKSB7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsWydQcm9taXNlJ10gIT09IHBhdGNoZXNbJ1pvbmVBd2FyZVByb21pc2UnXSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWm9uZS5qcyBoYXMgZGV0ZWN0ZWQgdGhhdCBab25lQXdhcmVQcm9taXNlIGAod2luZG93fGdsb2JhbCkuUHJvbWlzZWAgJyArXG4gICAgICAgICAgICAgICAgICAgICdoYXMgYmVlbiBvdmVyd3JpdHRlbi5cXG4nICtcbiAgICAgICAgICAgICAgICAgICAgJ01vc3QgbGlrZWx5IGNhdXNlIGlzIHRoYXQgYSBQcm9taXNlIHBvbHlmaWxsIGhhcyBiZWVuIGxvYWRlZCAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2FmdGVyIFpvbmUuanMgKFBvbHlmaWxsaW5nIFByb21pc2UgYXBpIGlzIG5vdCBuZWNlc3Nhcnkgd2hlbiB6b25lLmpzIGlzIGxvYWRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICdJZiB5b3UgbXVzdCBsb2FkIG9uZSwgZG8gc28gYmVmb3JlIGxvYWRpbmcgem9uZS5qcy4pJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGljIGdldCByb290KCkge1xuICAgICAgICAgICAgbGV0IHpvbmUgPSBab25lSW1wbC5jdXJyZW50O1xuICAgICAgICAgICAgd2hpbGUgKHpvbmUucGFyZW50KSB7XG4gICAgICAgICAgICAgICAgem9uZSA9IHpvbmUucGFyZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHpvbmU7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGljIGdldCBjdXJyZW50KCkge1xuICAgICAgICAgICAgcmV0dXJuIF9jdXJyZW50Wm9uZUZyYW1lLnpvbmU7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGljIGdldCBjdXJyZW50VGFzaygpIHtcbiAgICAgICAgICAgIHJldHVybiBfY3VycmVudFRhc2s7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGljIF9fbG9hZF9wYXRjaChuYW1lLCBmbiwgaWdub3JlRHVwbGljYXRlID0gZmFsc2UpIHtcbiAgICAgICAgICAgIGlmIChwYXRjaGVzLmhhc093blByb3BlcnR5KG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gYGNoZWNrRHVwbGljYXRlYCBvcHRpb24gaXMgZGVmaW5lZCBmcm9tIGdsb2JhbCB2YXJpYWJsZVxuICAgICAgICAgICAgICAgIC8vIHNvIGl0IHdvcmtzIGZvciBhbGwgbW9kdWxlcy5cbiAgICAgICAgICAgICAgICAvLyBgaWdub3JlRHVwbGljYXRlYCBjYW4gd29yayBmb3IgdGhlIHNwZWNpZmllZCBtb2R1bGVcbiAgICAgICAgICAgICAgICBjb25zdCBjaGVja0R1cGxpY2F0ZSA9IGdsb2JhbFtfX3N5bWJvbF9fKCdmb3JjZUR1cGxpY2F0ZVpvbmVDaGVjaycpXSA9PT0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIWlnbm9yZUR1cGxpY2F0ZSAmJiBjaGVja0R1cGxpY2F0ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcignQWxyZWFkeSBsb2FkZWQgcGF0Y2g6ICcgKyBuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICghZ2xvYmFsWydfX1pvbmVfZGlzYWJsZV8nICsgbmFtZV0pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwZXJmTmFtZSA9ICdab25lOicgKyBuYW1lO1xuICAgICAgICAgICAgICAgIG1hcmsocGVyZk5hbWUpO1xuICAgICAgICAgICAgICAgIHBhdGNoZXNbbmFtZV0gPSBmbihnbG9iYWwsIFpvbmVJbXBsLCBfYXBpKTtcbiAgICAgICAgICAgICAgICBwZXJmb3JtYW5jZU1lYXN1cmUocGVyZk5hbWUsIHBlcmZOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBnZXQgcGFyZW50KCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BhcmVudDtcbiAgICAgICAgfVxuICAgICAgICBnZXQgbmFtZSgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9uYW1lO1xuICAgICAgICB9XG4gICAgICAgIF9wYXJlbnQ7XG4gICAgICAgIF9uYW1lO1xuICAgICAgICBfcHJvcGVydGllcztcbiAgICAgICAgX3pvbmVEZWxlZ2F0ZTtcbiAgICAgICAgY29uc3RydWN0b3IocGFyZW50LCB6b25lU3BlYykge1xuICAgICAgICAgICAgdGhpcy5fcGFyZW50ID0gcGFyZW50O1xuICAgICAgICAgICAgdGhpcy5fbmFtZSA9IHpvbmVTcGVjID8gem9uZVNwZWMubmFtZSB8fCAndW5uYW1lZCcgOiAnPHJvb3Q+JztcbiAgICAgICAgICAgIHRoaXMuX3Byb3BlcnRpZXMgPSAoem9uZVNwZWMgJiYgem9uZVNwZWMucHJvcGVydGllcykgfHwge307XG4gICAgICAgICAgICB0aGlzLl96b25lRGVsZWdhdGUgPSBuZXcgX1pvbmVEZWxlZ2F0ZSh0aGlzLCB0aGlzLl9wYXJlbnQgJiYgdGhpcy5fcGFyZW50Ll96b25lRGVsZWdhdGUsIHpvbmVTcGVjKTtcbiAgICAgICAgfVxuICAgICAgICBnZXQoa2V5KSB7XG4gICAgICAgICAgICBjb25zdCB6b25lID0gdGhpcy5nZXRab25lV2l0aChrZXkpO1xuICAgICAgICAgICAgaWYgKHpvbmUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHpvbmUuX3Byb3BlcnRpZXNba2V5XTtcbiAgICAgICAgfVxuICAgICAgICBnZXRab25lV2l0aChrZXkpIHtcbiAgICAgICAgICAgIGxldCBjdXJyZW50ID0gdGhpcztcbiAgICAgICAgICAgIHdoaWxlIChjdXJyZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQuX3Byb3BlcnRpZXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQuX3BhcmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGZvcmsoem9uZVNwZWMpIHtcbiAgICAgICAgICAgIGlmICghem9uZVNwZWMpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdab25lU3BlYyByZXF1aXJlZCEnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl96b25lRGVsZWdhdGUuZm9yayh0aGlzLCB6b25lU3BlYyk7XG4gICAgICAgIH1cbiAgICAgICAgd3JhcChjYWxsYmFjaywgc291cmNlKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdFeHBlY3RpbmcgZnVuY3Rpb24gZ290OiAnICsgY2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgX2NhbGxiYWNrID0gdGhpcy5fem9uZURlbGVnYXRlLmludGVyY2VwdCh0aGlzLCBjYWxsYmFjaywgc291cmNlKTtcbiAgICAgICAgICAgIGNvbnN0IHpvbmUgPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gem9uZS5ydW5HdWFyZGVkKF9jYWxsYmFjaywgdGhpcywgYXJndW1lbnRzLCBzb3VyY2UpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBydW4oY2FsbGJhY2ssIGFwcGx5VGhpcywgYXBwbHlBcmdzLCBzb3VyY2UpIHtcbiAgICAgICAgICAgIF9jdXJyZW50Wm9uZUZyYW1lID0geyBwYXJlbnQ6IF9jdXJyZW50Wm9uZUZyYW1lLCB6b25lOiB0aGlzIH07XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl96b25lRGVsZWdhdGUuaW52b2tlKHRoaXMsIGNhbGxiYWNrLCBhcHBseVRoaXMsIGFwcGx5QXJncywgc291cmNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgICAgIF9jdXJyZW50Wm9uZUZyYW1lID0gX2N1cnJlbnRab25lRnJhbWUucGFyZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJ1bkd1YXJkZWQoY2FsbGJhY2ssIGFwcGx5VGhpcyA9IG51bGwsIGFwcGx5QXJncywgc291cmNlKSB7XG4gICAgICAgICAgICBfY3VycmVudFpvbmVGcmFtZSA9IHsgcGFyZW50OiBfY3VycmVudFpvbmVGcmFtZSwgem9uZTogdGhpcyB9O1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fem9uZURlbGVnYXRlLmludm9rZSh0aGlzLCBjYWxsYmFjaywgYXBwbHlUaGlzLCBhcHBseUFyZ3MsIHNvdXJjZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fem9uZURlbGVnYXRlLmhhbmRsZUVycm9yKHRoaXMsIGVycm9yKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBfY3VycmVudFpvbmVGcmFtZSA9IF9jdXJyZW50Wm9uZUZyYW1lLnBhcmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBydW5UYXNrKHRhc2ssIGFwcGx5VGhpcywgYXBwbHlBcmdzKSB7XG4gICAgICAgICAgICBpZiAodGFzay56b25lICE9IHRoaXMpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgdGFzayBjYW4gb25seSBiZSBydW4gaW4gdGhlIHpvbmUgb2YgY3JlYXRpb24hIChDcmVhdGlvbjogJyArXG4gICAgICAgICAgICAgICAgICAgICh0YXNrLnpvbmUgfHwgTk9fWk9ORSkubmFtZSArXG4gICAgICAgICAgICAgICAgICAgICc7IEV4ZWN1dGlvbjogJyArXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZSArXG4gICAgICAgICAgICAgICAgICAgICcpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB6b25lVGFzayA9IHRhc2s7XG4gICAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci96b25lLmpzL2lzc3Vlcy83NzgsIHNvbWV0aW1lcyBldmVudFRhc2tcbiAgICAgICAgICAgIC8vIHdpbGwgcnVuIGluIG5vdFNjaGVkdWxlZChjYW5jZWxlZCkgc3RhdGUsIHdlIHNob3VsZCBub3QgdHJ5IHRvXG4gICAgICAgICAgICAvLyBydW4gc3VjaCBraW5kIG9mIHRhc2sgYnV0IGp1c3QgcmV0dXJuXG4gICAgICAgICAgICBjb25zdCB7IHR5cGUsIGRhdGE6IHsgaXNQZXJpb2RpYyA9IGZhbHNlLCBpc1JlZnJlc2hhYmxlID0gZmFsc2UgfSA9IHt9IH0gPSB0YXNrO1xuICAgICAgICAgICAgaWYgKHRhc2suc3RhdGUgPT09IG5vdFNjaGVkdWxlZCAmJiAodHlwZSA9PT0gZXZlbnRUYXNrIHx8IHR5cGUgPT09IG1hY3JvVGFzaykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByZUVudHJ5R3VhcmQgPSB0YXNrLnN0YXRlICE9IHJ1bm5pbmc7XG4gICAgICAgICAgICByZUVudHJ5R3VhcmQgJiYgem9uZVRhc2suX3RyYW5zaXRpb25UbyhydW5uaW5nLCBzY2hlZHVsZWQpO1xuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNUYXNrID0gX2N1cnJlbnRUYXNrO1xuICAgICAgICAgICAgX2N1cnJlbnRUYXNrID0gem9uZVRhc2s7XG4gICAgICAgICAgICBfY3VycmVudFpvbmVGcmFtZSA9IHsgcGFyZW50OiBfY3VycmVudFpvbmVGcmFtZSwgem9uZTogdGhpcyB9O1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZSA9PSBtYWNyb1Rhc2sgJiYgdGFzay5kYXRhICYmICFpc1BlcmlvZGljICYmICFpc1JlZnJlc2hhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhc2suY2FuY2VsRm4gPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl96b25lRGVsZWdhdGUuaW52b2tlVGFzayh0aGlzLCB6b25lVGFzaywgYXBwbHlUaGlzLCBhcHBseUFyZ3MpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX3pvbmVEZWxlZ2F0ZS5oYW5kbGVFcnJvcih0aGlzLCBlcnJvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmluYWxseSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIHRhc2sncyBzdGF0ZSBpcyBub3RTY2hlZHVsZWQgb3IgdW5rbm93biwgdGhlbiBpdCBoYXMgYWxyZWFkeSBiZWVuIGNhbmNlbGxlZFxuICAgICAgICAgICAgICAgIC8vIHdlIHNob3VsZCBub3QgcmVzZXQgdGhlIHN0YXRlIHRvIHNjaGVkdWxlZFxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gdGFzay5zdGF0ZTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUgIT09IG5vdFNjaGVkdWxlZCAmJiBzdGF0ZSAhPT0gdW5rbm93bikge1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZSA9PSBldmVudFRhc2sgfHwgaXNQZXJpb2RpYyB8fCAoaXNSZWZyZXNoYWJsZSAmJiBzdGF0ZSA9PT0gc2NoZWR1bGluZykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlRW50cnlHdWFyZCAmJiB6b25lVGFzay5fdHJhbnNpdGlvblRvKHNjaGVkdWxlZCwgcnVubmluZywgc2NoZWR1bGluZyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB6b25lRGVsZWdhdGVzID0gem9uZVRhc2suX3pvbmVEZWxlZ2F0ZXM7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl91cGRhdGVUYXNrQ291bnQoem9uZVRhc2ssIC0xKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlRW50cnlHdWFyZCAmJiB6b25lVGFzay5fdHJhbnNpdGlvblRvKG5vdFNjaGVkdWxlZCwgcnVubmluZywgbm90U2NoZWR1bGVkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc1JlZnJlc2hhYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgem9uZVRhc2suX3pvbmVEZWxlZ2F0ZXMgPSB6b25lRGVsZWdhdGVzO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF9jdXJyZW50Wm9uZUZyYW1lID0gX2N1cnJlbnRab25lRnJhbWUucGFyZW50O1xuICAgICAgICAgICAgICAgIF9jdXJyZW50VGFzayA9IHByZXZpb3VzVGFzaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzY2hlZHVsZVRhc2sodGFzaykge1xuICAgICAgICAgICAgaWYgKHRhc2suem9uZSAmJiB0YXNrLnpvbmUgIT09IHRoaXMpIHtcbiAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgdGFzayB3YXMgcmVzY2hlZHVsZWQsIHRoZSBuZXdab25lXG4gICAgICAgICAgICAgICAgLy8gc2hvdWxkIG5vdCBiZSB0aGUgY2hpbGRyZW4gb2YgdGhlIG9yaWdpbmFsIHpvbmVcbiAgICAgICAgICAgICAgICBsZXQgbmV3Wm9uZSA9IHRoaXM7XG4gICAgICAgICAgICAgICAgd2hpbGUgKG5ld1pvbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ld1pvbmUgPT09IHRhc2suem9uZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoYGNhbiBub3QgcmVzY2hlZHVsZSB0YXNrIHRvICR7dGhpcy5uYW1lfSB3aGljaCBpcyBkZXNjZW5kYW50cyBvZiB0aGUgb3JpZ2luYWwgem9uZSAke3Rhc2suem9uZS5uYW1lfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIG5ld1pvbmUgPSBuZXdab25lLnBhcmVudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0YXNrLl90cmFuc2l0aW9uVG8oc2NoZWR1bGluZywgbm90U2NoZWR1bGVkKTtcbiAgICAgICAgICAgIGNvbnN0IHpvbmVEZWxlZ2F0ZXMgPSBbXTtcbiAgICAgICAgICAgIHRhc2suX3pvbmVEZWxlZ2F0ZXMgPSB6b25lRGVsZWdhdGVzO1xuICAgICAgICAgICAgdGFzay5fem9uZSA9IHRoaXM7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRhc2sgPSB0aGlzLl96b25lRGVsZWdhdGUuc2NoZWR1bGVUYXNrKHRoaXMsIHRhc2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIC8vIHNob3VsZCBzZXQgdGFzaydzIHN0YXRlIHRvIHVua25vd24gd2hlbiBzY2hlZHVsZVRhc2sgdGhyb3cgZXJyb3JcbiAgICAgICAgICAgICAgICAvLyBiZWNhdXNlIHRoZSBlcnIgbWF5IGZyb20gcmVzY2hlZHVsZSwgc28gdGhlIGZyb21TdGF0ZSBtYXliZSBub3RTY2hlZHVsZWRcbiAgICAgICAgICAgICAgICB0YXNrLl90cmFuc2l0aW9uVG8odW5rbm93biwgc2NoZWR1bGluZywgbm90U2NoZWR1bGVkKTtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBASmlhTGlQYXNzaW9uLCBzaG91bGQgd2UgY2hlY2sgdGhlIHJlc3VsdCBmcm9tIGhhbmRsZUVycm9yP1xuICAgICAgICAgICAgICAgIHRoaXMuX3pvbmVEZWxlZ2F0ZS5oYW5kbGVFcnJvcih0aGlzLCBlcnIpO1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0YXNrLl96b25lRGVsZWdhdGVzID09PSB6b25lRGVsZWdhdGVzKSB7XG4gICAgICAgICAgICAgICAgLy8gd2UgaGF2ZSB0byBjaGVjayBiZWNhdXNlIGludGVybmFsbHkgdGhlIGRlbGVnYXRlIGNhbiByZXNjaGVkdWxlIHRoZSB0YXNrLlxuICAgICAgICAgICAgICAgIHRoaXMuX3VwZGF0ZVRhc2tDb3VudCh0YXNrLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0YXNrLnN0YXRlID09IHNjaGVkdWxpbmcpIHtcbiAgICAgICAgICAgICAgICB0YXNrLl90cmFuc2l0aW9uVG8oc2NoZWR1bGVkLCBzY2hlZHVsaW5nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0YXNrO1xuICAgICAgICB9XG4gICAgICAgIHNjaGVkdWxlTWljcm9UYXNrKHNvdXJjZSwgY2FsbGJhY2ssIGRhdGEsIGN1c3RvbVNjaGVkdWxlKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zY2hlZHVsZVRhc2sobmV3IFpvbmVUYXNrKG1pY3JvVGFzaywgc291cmNlLCBjYWxsYmFjaywgZGF0YSwgY3VzdG9tU2NoZWR1bGUsIHVuZGVmaW5lZCkpO1xuICAgICAgICB9XG4gICAgICAgIHNjaGVkdWxlTWFjcm9UYXNrKHNvdXJjZSwgY2FsbGJhY2ssIGRhdGEsIGN1c3RvbVNjaGVkdWxlLCBjdXN0b21DYW5jZWwpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNjaGVkdWxlVGFzayhuZXcgWm9uZVRhc2sobWFjcm9UYXNrLCBzb3VyY2UsIGNhbGxiYWNrLCBkYXRhLCBjdXN0b21TY2hlZHVsZSwgY3VzdG9tQ2FuY2VsKSk7XG4gICAgICAgIH1cbiAgICAgICAgc2NoZWR1bGVFdmVudFRhc2soc291cmNlLCBjYWxsYmFjaywgZGF0YSwgY3VzdG9tU2NoZWR1bGUsIGN1c3RvbUNhbmNlbCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NoZWR1bGVUYXNrKG5ldyBab25lVGFzayhldmVudFRhc2ssIHNvdXJjZSwgY2FsbGJhY2ssIGRhdGEsIGN1c3RvbVNjaGVkdWxlLCBjdXN0b21DYW5jZWwpKTtcbiAgICAgICAgfVxuICAgICAgICBjYW5jZWxUYXNrKHRhc2spIHtcbiAgICAgICAgICAgIGlmICh0YXNrLnpvbmUgIT0gdGhpcylcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgdGFzayBjYW4gb25seSBiZSBjYW5jZWxsZWQgaW4gdGhlIHpvbmUgb2YgY3JlYXRpb24hIChDcmVhdGlvbjogJyArXG4gICAgICAgICAgICAgICAgICAgICh0YXNrLnpvbmUgfHwgTk9fWk9ORSkubmFtZSArXG4gICAgICAgICAgICAgICAgICAgICc7IEV4ZWN1dGlvbjogJyArXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZSArXG4gICAgICAgICAgICAgICAgICAgICcpJyk7XG4gICAgICAgICAgICBpZiAodGFzay5zdGF0ZSAhPT0gc2NoZWR1bGVkICYmIHRhc2suc3RhdGUgIT09IHJ1bm5pbmcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0YXNrLl90cmFuc2l0aW9uVG8oY2FuY2VsaW5nLCBzY2hlZHVsZWQsIHJ1bm5pbmcpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB0aGlzLl96b25lRGVsZWdhdGUuY2FuY2VsVGFzayh0aGlzLCB0YXNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiBlcnJvciBvY2N1cnMgd2hlbiBjYW5jZWxUYXNrLCB0cmFuc2l0IHRoZSBzdGF0ZSB0byB1bmtub3duXG4gICAgICAgICAgICAgICAgdGFzay5fdHJhbnNpdGlvblRvKHVua25vd24sIGNhbmNlbGluZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fem9uZURlbGVnYXRlLmhhbmRsZUVycm9yKHRoaXMsIGVycik7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fdXBkYXRlVGFza0NvdW50KHRhc2ssIC0xKTtcbiAgICAgICAgICAgIHRhc2suX3RyYW5zaXRpb25Ubyhub3RTY2hlZHVsZWQsIGNhbmNlbGluZyk7XG4gICAgICAgICAgICB0YXNrLnJ1bkNvdW50ID0gLTE7XG4gICAgICAgICAgICByZXR1cm4gdGFzaztcbiAgICAgICAgfVxuICAgICAgICBfdXBkYXRlVGFza0NvdW50KHRhc2ssIGNvdW50KSB7XG4gICAgICAgICAgICBjb25zdCB6b25lRGVsZWdhdGVzID0gdGFzay5fem9uZURlbGVnYXRlcztcbiAgICAgICAgICAgIGlmIChjb3VudCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIHRhc2suX3pvbmVEZWxlZ2F0ZXMgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB6b25lRGVsZWdhdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgem9uZURlbGVnYXRlc1tpXS5fdXBkYXRlVGFza0NvdW50KHRhc2sudHlwZSwgY291bnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IERFTEVHQVRFX1pTID0ge1xuICAgICAgICBuYW1lOiAnJyxcbiAgICAgICAgb25IYXNUYXNrOiAoZGVsZWdhdGUsIF8sIHRhcmdldCwgaGFzVGFza1N0YXRlKSA9PiBkZWxlZ2F0ZS5oYXNUYXNrKHRhcmdldCwgaGFzVGFza1N0YXRlKSxcbiAgICAgICAgb25TY2hlZHVsZVRhc2s6IChkZWxlZ2F0ZSwgXywgdGFyZ2V0LCB0YXNrKSA9PiBkZWxlZ2F0ZS5zY2hlZHVsZVRhc2sodGFyZ2V0LCB0YXNrKSxcbiAgICAgICAgb25JbnZva2VUYXNrOiAoZGVsZWdhdGUsIF8sIHRhcmdldCwgdGFzaywgYXBwbHlUaGlzLCBhcHBseUFyZ3MpID0+IGRlbGVnYXRlLmludm9rZVRhc2sodGFyZ2V0LCB0YXNrLCBhcHBseVRoaXMsIGFwcGx5QXJncyksXG4gICAgICAgIG9uQ2FuY2VsVGFzazogKGRlbGVnYXRlLCBfLCB0YXJnZXQsIHRhc2spID0+IGRlbGVnYXRlLmNhbmNlbFRhc2sodGFyZ2V0LCB0YXNrKSxcbiAgICB9O1xuICAgIGNsYXNzIF9ab25lRGVsZWdhdGUge1xuICAgICAgICBnZXQgem9uZSgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl96b25lO1xuICAgICAgICB9XG4gICAgICAgIF96b25lO1xuICAgICAgICBfdGFza0NvdW50cyA9IHtcbiAgICAgICAgICAgICdtaWNyb1Rhc2snOiAwLFxuICAgICAgICAgICAgJ21hY3JvVGFzayc6IDAsXG4gICAgICAgICAgICAnZXZlbnRUYXNrJzogMCxcbiAgICAgICAgfTtcbiAgICAgICAgX3BhcmVudERlbGVnYXRlO1xuICAgICAgICBfZm9ya0RsZ3Q7XG4gICAgICAgIF9mb3JrWlM7XG4gICAgICAgIF9mb3JrQ3VyclpvbmU7XG4gICAgICAgIF9pbnRlcmNlcHREbGd0O1xuICAgICAgICBfaW50ZXJjZXB0WlM7XG4gICAgICAgIF9pbnRlcmNlcHRDdXJyWm9uZTtcbiAgICAgICAgX2ludm9rZURsZ3Q7XG4gICAgICAgIF9pbnZva2VaUztcbiAgICAgICAgX2ludm9rZUN1cnJab25lO1xuICAgICAgICBfaGFuZGxlRXJyb3JEbGd0O1xuICAgICAgICBfaGFuZGxlRXJyb3JaUztcbiAgICAgICAgX2hhbmRsZUVycm9yQ3VyclpvbmU7XG4gICAgICAgIF9zY2hlZHVsZVRhc2tEbGd0O1xuICAgICAgICBfc2NoZWR1bGVUYXNrWlM7XG4gICAgICAgIF9zY2hlZHVsZVRhc2tDdXJyWm9uZTtcbiAgICAgICAgX2ludm9rZVRhc2tEbGd0O1xuICAgICAgICBfaW52b2tlVGFza1pTO1xuICAgICAgICBfaW52b2tlVGFza0N1cnJab25lO1xuICAgICAgICBfY2FuY2VsVGFza0RsZ3Q7XG4gICAgICAgIF9jYW5jZWxUYXNrWlM7XG4gICAgICAgIF9jYW5jZWxUYXNrQ3VyclpvbmU7XG4gICAgICAgIF9oYXNUYXNrRGxndDtcbiAgICAgICAgX2hhc1Rhc2tEbGd0T3duZXI7XG4gICAgICAgIF9oYXNUYXNrWlM7XG4gICAgICAgIF9oYXNUYXNrQ3VyclpvbmU7XG4gICAgICAgIGNvbnN0cnVjdG9yKHpvbmUsIHBhcmVudERlbGVnYXRlLCB6b25lU3BlYykge1xuICAgICAgICAgICAgdGhpcy5fem9uZSA9IHpvbmU7XG4gICAgICAgICAgICB0aGlzLl9wYXJlbnREZWxlZ2F0ZSA9IHBhcmVudERlbGVnYXRlO1xuICAgICAgICAgICAgdGhpcy5fZm9ya1pTID0gem9uZVNwZWMgJiYgKHpvbmVTcGVjICYmIHpvbmVTcGVjLm9uRm9yayA/IHpvbmVTcGVjIDogcGFyZW50RGVsZWdhdGUuX2ZvcmtaUyk7XG4gICAgICAgICAgICB0aGlzLl9mb3JrRGxndCA9IHpvbmVTcGVjICYmICh6b25lU3BlYy5vbkZvcmsgPyBwYXJlbnREZWxlZ2F0ZSA6IHBhcmVudERlbGVnYXRlLl9mb3JrRGxndCk7XG4gICAgICAgICAgICB0aGlzLl9mb3JrQ3VyclpvbmUgPVxuICAgICAgICAgICAgICAgIHpvbmVTcGVjICYmICh6b25lU3BlYy5vbkZvcmsgPyB0aGlzLl96b25lIDogcGFyZW50RGVsZWdhdGUuX2ZvcmtDdXJyWm9uZSk7XG4gICAgICAgICAgICB0aGlzLl9pbnRlcmNlcHRaUyA9XG4gICAgICAgICAgICAgICAgem9uZVNwZWMgJiYgKHpvbmVTcGVjLm9uSW50ZXJjZXB0ID8gem9uZVNwZWMgOiBwYXJlbnREZWxlZ2F0ZS5faW50ZXJjZXB0WlMpO1xuICAgICAgICAgICAgdGhpcy5faW50ZXJjZXB0RGxndCA9XG4gICAgICAgICAgICAgICAgem9uZVNwZWMgJiYgKHpvbmVTcGVjLm9uSW50ZXJjZXB0ID8gcGFyZW50RGVsZWdhdGUgOiBwYXJlbnREZWxlZ2F0ZS5faW50ZXJjZXB0RGxndCk7XG4gICAgICAgICAgICB0aGlzLl9pbnRlcmNlcHRDdXJyWm9uZSA9XG4gICAgICAgICAgICAgICAgem9uZVNwZWMgJiYgKHpvbmVTcGVjLm9uSW50ZXJjZXB0ID8gdGhpcy5fem9uZSA6IHBhcmVudERlbGVnYXRlLl9pbnRlcmNlcHRDdXJyWm9uZSk7XG4gICAgICAgICAgICB0aGlzLl9pbnZva2VaUyA9IHpvbmVTcGVjICYmICh6b25lU3BlYy5vbkludm9rZSA/IHpvbmVTcGVjIDogcGFyZW50RGVsZWdhdGUuX2ludm9rZVpTKTtcbiAgICAgICAgICAgIHRoaXMuX2ludm9rZURsZ3QgPVxuICAgICAgICAgICAgICAgIHpvbmVTcGVjICYmICh6b25lU3BlYy5vbkludm9rZSA/IHBhcmVudERlbGVnYXRlIDogcGFyZW50RGVsZWdhdGUuX2ludm9rZURsZ3QpO1xuICAgICAgICAgICAgdGhpcy5faW52b2tlQ3VyclpvbmUgPVxuICAgICAgICAgICAgICAgIHpvbmVTcGVjICYmICh6b25lU3BlYy5vbkludm9rZSA/IHRoaXMuX3pvbmUgOiBwYXJlbnREZWxlZ2F0ZS5faW52b2tlQ3VyclpvbmUpO1xuICAgICAgICAgICAgdGhpcy5faGFuZGxlRXJyb3JaUyA9XG4gICAgICAgICAgICAgICAgem9uZVNwZWMgJiYgKHpvbmVTcGVjLm9uSGFuZGxlRXJyb3IgPyB6b25lU3BlYyA6IHBhcmVudERlbGVnYXRlLl9oYW5kbGVFcnJvclpTKTtcbiAgICAgICAgICAgIHRoaXMuX2hhbmRsZUVycm9yRGxndCA9XG4gICAgICAgICAgICAgICAgem9uZVNwZWMgJiYgKHpvbmVTcGVjLm9uSGFuZGxlRXJyb3IgPyBwYXJlbnREZWxlZ2F0ZSA6IHBhcmVudERlbGVnYXRlLl9oYW5kbGVFcnJvckRsZ3QpO1xuICAgICAgICAgICAgdGhpcy5faGFuZGxlRXJyb3JDdXJyWm9uZSA9XG4gICAgICAgICAgICAgICAgem9uZVNwZWMgJiYgKHpvbmVTcGVjLm9uSGFuZGxlRXJyb3IgPyB0aGlzLl96b25lIDogcGFyZW50RGVsZWdhdGUuX2hhbmRsZUVycm9yQ3VyclpvbmUpO1xuICAgICAgICAgICAgdGhpcy5fc2NoZWR1bGVUYXNrWlMgPVxuICAgICAgICAgICAgICAgIHpvbmVTcGVjICYmICh6b25lU3BlYy5vblNjaGVkdWxlVGFzayA/IHpvbmVTcGVjIDogcGFyZW50RGVsZWdhdGUuX3NjaGVkdWxlVGFza1pTKTtcbiAgICAgICAgICAgIHRoaXMuX3NjaGVkdWxlVGFza0RsZ3QgPVxuICAgICAgICAgICAgICAgIHpvbmVTcGVjICYmICh6b25lU3BlYy5vblNjaGVkdWxlVGFzayA/IHBhcmVudERlbGVnYXRlIDogcGFyZW50RGVsZWdhdGUuX3NjaGVkdWxlVGFza0RsZ3QpO1xuICAgICAgICAgICAgdGhpcy5fc2NoZWR1bGVUYXNrQ3VyclpvbmUgPVxuICAgICAgICAgICAgICAgIHpvbmVTcGVjICYmICh6b25lU3BlYy5vblNjaGVkdWxlVGFzayA/IHRoaXMuX3pvbmUgOiBwYXJlbnREZWxlZ2F0ZS5fc2NoZWR1bGVUYXNrQ3VyclpvbmUpO1xuICAgICAgICAgICAgdGhpcy5faW52b2tlVGFza1pTID1cbiAgICAgICAgICAgICAgICB6b25lU3BlYyAmJiAoem9uZVNwZWMub25JbnZva2VUYXNrID8gem9uZVNwZWMgOiBwYXJlbnREZWxlZ2F0ZS5faW52b2tlVGFza1pTKTtcbiAgICAgICAgICAgIHRoaXMuX2ludm9rZVRhc2tEbGd0ID1cbiAgICAgICAgICAgICAgICB6b25lU3BlYyAmJiAoem9uZVNwZWMub25JbnZva2VUYXNrID8gcGFyZW50RGVsZWdhdGUgOiBwYXJlbnREZWxlZ2F0ZS5faW52b2tlVGFza0RsZ3QpO1xuICAgICAgICAgICAgdGhpcy5faW52b2tlVGFza0N1cnJab25lID1cbiAgICAgICAgICAgICAgICB6b25lU3BlYyAmJiAoem9uZVNwZWMub25JbnZva2VUYXNrID8gdGhpcy5fem9uZSA6IHBhcmVudERlbGVnYXRlLl9pbnZva2VUYXNrQ3VyclpvbmUpO1xuICAgICAgICAgICAgdGhpcy5fY2FuY2VsVGFza1pTID1cbiAgICAgICAgICAgICAgICB6b25lU3BlYyAmJiAoem9uZVNwZWMub25DYW5jZWxUYXNrID8gem9uZVNwZWMgOiBwYXJlbnREZWxlZ2F0ZS5fY2FuY2VsVGFza1pTKTtcbiAgICAgICAgICAgIHRoaXMuX2NhbmNlbFRhc2tEbGd0ID1cbiAgICAgICAgICAgICAgICB6b25lU3BlYyAmJiAoem9uZVNwZWMub25DYW5jZWxUYXNrID8gcGFyZW50RGVsZWdhdGUgOiBwYXJlbnREZWxlZ2F0ZS5fY2FuY2VsVGFza0RsZ3QpO1xuICAgICAgICAgICAgdGhpcy5fY2FuY2VsVGFza0N1cnJab25lID1cbiAgICAgICAgICAgICAgICB6b25lU3BlYyAmJiAoem9uZVNwZWMub25DYW5jZWxUYXNrID8gdGhpcy5fem9uZSA6IHBhcmVudERlbGVnYXRlLl9jYW5jZWxUYXNrQ3VyclpvbmUpO1xuICAgICAgICAgICAgdGhpcy5faGFzVGFza1pTID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX2hhc1Rhc2tEbGd0ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuX2hhc1Rhc2tEbGd0T3duZXIgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5faGFzVGFza0N1cnJab25lID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IHpvbmVTcGVjSGFzVGFzayA9IHpvbmVTcGVjICYmIHpvbmVTcGVjLm9uSGFzVGFzaztcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudEhhc1Rhc2sgPSBwYXJlbnREZWxlZ2F0ZSAmJiBwYXJlbnREZWxlZ2F0ZS5faGFzVGFza1pTO1xuICAgICAgICAgICAgaWYgKHpvbmVTcGVjSGFzVGFzayB8fCBwYXJlbnRIYXNUYXNrKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgbmVlZCB0byByZXBvcnQgaGFzVGFzaywgdGhhbiB0aGlzIFpTIG5lZWRzIHRvIGRvIHJlZiBjb3VudGluZyBvbiB0YXNrcy4gSW4gc3VjaFxuICAgICAgICAgICAgICAgIC8vIGEgY2FzZSBhbGwgdGFzayByZWxhdGVkIGludGVyY2VwdG9ycyBtdXN0IGdvIHRocm91Z2ggdGhpcyBaRC4gV2UgY2FuJ3Qgc2hvcnQgY2lyY3VpdCBpdC5cbiAgICAgICAgICAgICAgICB0aGlzLl9oYXNUYXNrWlMgPSB6b25lU3BlY0hhc1Rhc2sgPyB6b25lU3BlYyA6IERFTEVHQVRFX1pTO1xuICAgICAgICAgICAgICAgIHRoaXMuX2hhc1Rhc2tEbGd0ID0gcGFyZW50RGVsZWdhdGU7XG4gICAgICAgICAgICAgICAgdGhpcy5faGFzVGFza0RsZ3RPd25lciA9IHRoaXM7XG4gICAgICAgICAgICAgICAgdGhpcy5faGFzVGFza0N1cnJab25lID0gdGhpcy5fem9uZTtcbiAgICAgICAgICAgICAgICBpZiAoIXpvbmVTcGVjLm9uU2NoZWR1bGVUYXNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NjaGVkdWxlVGFza1pTID0gREVMRUdBVEVfWlM7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NjaGVkdWxlVGFza0RsZ3QgPSBwYXJlbnREZWxlZ2F0ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2NoZWR1bGVUYXNrQ3VyclpvbmUgPSB0aGlzLl96b25lO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXpvbmVTcGVjLm9uSW52b2tlVGFzaykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbnZva2VUYXNrWlMgPSBERUxFR0FURV9aUztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faW52b2tlVGFza0RsZ3QgPSBwYXJlbnREZWxlZ2F0ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faW52b2tlVGFza0N1cnJab25lID0gdGhpcy5fem9uZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCF6b25lU3BlYy5vbkNhbmNlbFRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2FuY2VsVGFza1pTID0gREVMRUdBVEVfWlM7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NhbmNlbFRhc2tEbGd0ID0gcGFyZW50RGVsZWdhdGU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2NhbmNlbFRhc2tDdXJyWm9uZSA9IHRoaXMuX3pvbmU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvcmsodGFyZ2V0Wm9uZSwgem9uZVNwZWMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9mb3JrWlNcbiAgICAgICAgICAgICAgICA/IHRoaXMuX2ZvcmtaUy5vbkZvcmsodGhpcy5fZm9ya0RsZ3QsIHRoaXMuem9uZSwgdGFyZ2V0Wm9uZSwgem9uZVNwZWMpXG4gICAgICAgICAgICAgICAgOiBuZXcgWm9uZUltcGwodGFyZ2V0Wm9uZSwgem9uZVNwZWMpO1xuICAgICAgICB9XG4gICAgICAgIGludGVyY2VwdCh0YXJnZXRab25lLCBjYWxsYmFjaywgc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW50ZXJjZXB0WlNcbiAgICAgICAgICAgICAgICA/IHRoaXMuX2ludGVyY2VwdFpTLm9uSW50ZXJjZXB0KHRoaXMuX2ludGVyY2VwdERsZ3QsIHRoaXMuX2ludGVyY2VwdEN1cnJab25lLCB0YXJnZXRab25lLCBjYWxsYmFjaywgc291cmNlKVxuICAgICAgICAgICAgICAgIDogY2FsbGJhY2s7XG4gICAgICAgIH1cbiAgICAgICAgaW52b2tlKHRhcmdldFpvbmUsIGNhbGxiYWNrLCBhcHBseVRoaXMsIGFwcGx5QXJncywgc291cmNlKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW52b2tlWlNcbiAgICAgICAgICAgICAgICA/IHRoaXMuX2ludm9rZVpTLm9uSW52b2tlKHRoaXMuX2ludm9rZURsZ3QsIHRoaXMuX2ludm9rZUN1cnJab25lLCB0YXJnZXRab25lLCBjYWxsYmFjaywgYXBwbHlUaGlzLCBhcHBseUFyZ3MsIHNvdXJjZSlcbiAgICAgICAgICAgICAgICA6IGNhbGxiYWNrLmFwcGx5KGFwcGx5VGhpcywgYXBwbHlBcmdzKTtcbiAgICAgICAgfVxuICAgICAgICBoYW5kbGVFcnJvcih0YXJnZXRab25lLCBlcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2hhbmRsZUVycm9yWlNcbiAgICAgICAgICAgICAgICA/IHRoaXMuX2hhbmRsZUVycm9yWlMub25IYW5kbGVFcnJvcih0aGlzLl9oYW5kbGVFcnJvckRsZ3QsIHRoaXMuX2hhbmRsZUVycm9yQ3VyclpvbmUsIHRhcmdldFpvbmUsIGVycm9yKVxuICAgICAgICAgICAgICAgIDogdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBzY2hlZHVsZVRhc2sodGFyZ2V0Wm9uZSwgdGFzaykge1xuICAgICAgICAgICAgbGV0IHJldHVyblRhc2sgPSB0YXNrO1xuICAgICAgICAgICAgaWYgKHRoaXMuX3NjaGVkdWxlVGFza1pTKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2hhc1Rhc2taUykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm5UYXNrLl96b25lRGVsZWdhdGVzLnB1c2godGhpcy5faGFzVGFza0RsZ3RPd25lcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVyblRhc2sgPSB0aGlzLl9zY2hlZHVsZVRhc2taUy5vblNjaGVkdWxlVGFzayh0aGlzLl9zY2hlZHVsZVRhc2tEbGd0LCB0aGlzLl9zY2hlZHVsZVRhc2tDdXJyWm9uZSwgdGFyZ2V0Wm9uZSwgdGFzayk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXR1cm5UYXNrKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm5UYXNrID0gdGFzaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICh0YXNrLnNjaGVkdWxlRm4pIHtcbiAgICAgICAgICAgICAgICAgICAgdGFzay5zY2hlZHVsZUZuKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0YXNrLnR5cGUgPT0gbWljcm9UYXNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjaGVkdWxlTWljcm9UYXNrKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUYXNrIGlzIG1pc3Npbmcgc2NoZWR1bGVGbi4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmV0dXJuVGFzaztcbiAgICAgICAgfVxuICAgICAgICBpbnZva2VUYXNrKHRhcmdldFpvbmUsIHRhc2ssIGFwcGx5VGhpcywgYXBwbHlBcmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5faW52b2tlVGFza1pTXG4gICAgICAgICAgICAgICAgPyB0aGlzLl9pbnZva2VUYXNrWlMub25JbnZva2VUYXNrKHRoaXMuX2ludm9rZVRhc2tEbGd0LCB0aGlzLl9pbnZva2VUYXNrQ3VyclpvbmUsIHRhcmdldFpvbmUsIHRhc2ssIGFwcGx5VGhpcywgYXBwbHlBcmdzKVxuICAgICAgICAgICAgICAgIDogdGFzay5jYWxsYmFjay5hcHBseShhcHBseVRoaXMsIGFwcGx5QXJncyk7XG4gICAgICAgIH1cbiAgICAgICAgY2FuY2VsVGFzayh0YXJnZXRab25lLCB0YXNrKSB7XG4gICAgICAgICAgICBsZXQgdmFsdWU7XG4gICAgICAgICAgICBpZiAodGhpcy5fY2FuY2VsVGFza1pTKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLl9jYW5jZWxUYXNrWlMub25DYW5jZWxUYXNrKHRoaXMuX2NhbmNlbFRhc2tEbGd0LCB0aGlzLl9jYW5jZWxUYXNrQ3VyclpvbmUsIHRhcmdldFpvbmUsIHRhc2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0YXNrLmNhbmNlbEZuKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IEVycm9yKCdUYXNrIGlzIG5vdCBjYW5jZWxhYmxlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlID0gdGFzay5jYW5jZWxGbih0YXNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBoYXNUYXNrKHRhcmdldFpvbmUsIGlzRW1wdHkpIHtcbiAgICAgICAgICAgIC8vIGhhc1Rhc2sgc2hvdWxkIG5vdCB0aHJvdyBlcnJvciBzbyBvdGhlciBab25lRGVsZWdhdGVcbiAgICAgICAgICAgIC8vIGNhbiBzdGlsbCB0cmlnZ2VyIGhhc1Rhc2sgY2FsbGJhY2tcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhpcy5faGFzVGFza1pTICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2hhc1Rhc2taUy5vbkhhc1Rhc2sodGhpcy5faGFzVGFza0RsZ3QsIHRoaXMuX2hhc1Rhc2tDdXJyWm9uZSwgdGFyZ2V0Wm9uZSwgaXNFbXB0eSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVFcnJvcih0YXJnZXRab25lLCBlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIF91cGRhdGVUYXNrQ291bnQodHlwZSwgY291bnQpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvdW50cyA9IHRoaXMuX3Rhc2tDb3VudHM7XG4gICAgICAgICAgICBjb25zdCBwcmV2ID0gY291bnRzW3R5cGVdO1xuICAgICAgICAgICAgY29uc3QgbmV4dCA9IChjb3VudHNbdHlwZV0gPSBwcmV2ICsgY291bnQpO1xuICAgICAgICAgICAgaWYgKG5leHQgPCAwKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNb3JlIHRhc2tzIGV4ZWN1dGVkIHRoZW4gd2VyZSBzY2hlZHVsZWQuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJldiA9PSAwIHx8IG5leHQgPT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlzRW1wdHkgPSB7XG4gICAgICAgICAgICAgICAgICAgIG1pY3JvVGFzazogY291bnRzWydtaWNyb1Rhc2snXSA+IDAsXG4gICAgICAgICAgICAgICAgICAgIG1hY3JvVGFzazogY291bnRzWydtYWNyb1Rhc2snXSA+IDAsXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50VGFzazogY291bnRzWydldmVudFRhc2snXSA+IDAsXG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZTogdHlwZSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHRoaXMuaGFzVGFzayh0aGlzLl96b25lLCBpc0VtcHR5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBjbGFzcyBab25lVGFzayB7XG4gICAgICAgIHR5cGU7XG4gICAgICAgIHNvdXJjZTtcbiAgICAgICAgaW52b2tlO1xuICAgICAgICBjYWxsYmFjaztcbiAgICAgICAgZGF0YTtcbiAgICAgICAgc2NoZWR1bGVGbjtcbiAgICAgICAgY2FuY2VsRm47XG4gICAgICAgIF96b25lID0gbnVsbDtcbiAgICAgICAgcnVuQ291bnQgPSAwO1xuICAgICAgICBfem9uZURlbGVnYXRlcyA9IG51bGw7XG4gICAgICAgIF9zdGF0ZSA9ICdub3RTY2hlZHVsZWQnO1xuICAgICAgICBjb25zdHJ1Y3Rvcih0eXBlLCBzb3VyY2UsIGNhbGxiYWNrLCBvcHRpb25zLCBzY2hlZHVsZUZuLCBjYW5jZWxGbikge1xuICAgICAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICAgICAgICAgIHRoaXMuc291cmNlID0gc291cmNlO1xuICAgICAgICAgICAgdGhpcy5kYXRhID0gb3B0aW9ucztcbiAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVGbiA9IHNjaGVkdWxlRm47XG4gICAgICAgICAgICB0aGlzLmNhbmNlbEZuID0gY2FuY2VsRm47XG4gICAgICAgICAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyBub3QgZGVmaW5lZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgICAgICAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICAvLyBUT0RPOiBASmlhTGlQYXNzaW9uIG9wdGlvbnMgc2hvdWxkIGhhdmUgaW50ZXJmYWNlXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gZXZlbnRUYXNrICYmIG9wdGlvbnMgJiYgb3B0aW9ucy51c2VHKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbnZva2UgPSBab25lVGFzay5pbnZva2VUYXNrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbnZva2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBab25lVGFzay5pbnZva2VUYXNrLmNhbGwoZ2xvYmFsLCBzZWxmLCB0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGljIGludm9rZVRhc2sodGFzaywgdGFyZ2V0LCBhcmdzKSB7XG4gICAgICAgICAgICBpZiAoIXRhc2spIHtcbiAgICAgICAgICAgICAgICB0YXNrID0gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF9udW1iZXJPZk5lc3RlZFRhc2tGcmFtZXMrKztcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGFzay5ydW5Db3VudCsrO1xuICAgICAgICAgICAgICAgIHJldHVybiB0YXNrLnpvbmUucnVuVGFzayh0YXNrLCB0YXJnZXQsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmluYWxseSB7XG4gICAgICAgICAgICAgICAgaWYgKF9udW1iZXJPZk5lc3RlZFRhc2tGcmFtZXMgPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBkcmFpbk1pY3JvVGFza1F1ZXVlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF9udW1iZXJPZk5lc3RlZFRhc2tGcmFtZXMtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBnZXQgem9uZSgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl96b25lO1xuICAgICAgICB9XG4gICAgICAgIGdldCBzdGF0ZSgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zdGF0ZTtcbiAgICAgICAgfVxuICAgICAgICBjYW5jZWxTY2hlZHVsZVJlcXVlc3QoKSB7XG4gICAgICAgICAgICB0aGlzLl90cmFuc2l0aW9uVG8obm90U2NoZWR1bGVkLCBzY2hlZHVsaW5nKTtcbiAgICAgICAgfVxuICAgICAgICBfdHJhbnNpdGlvblRvKHRvU3RhdGUsIGZyb21TdGF0ZTEsIGZyb21TdGF0ZTIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9zdGF0ZSA9PT0gZnJvbVN0YXRlMSB8fCB0aGlzLl9zdGF0ZSA9PT0gZnJvbVN0YXRlMikge1xuICAgICAgICAgICAgICAgIHRoaXMuX3N0YXRlID0gdG9TdGF0ZTtcbiAgICAgICAgICAgICAgICBpZiAodG9TdGF0ZSA9PSBub3RTY2hlZHVsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fem9uZURlbGVnYXRlcyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3RoaXMudHlwZX0gJyR7dGhpcy5zb3VyY2V9JzogY2FuIG5vdCB0cmFuc2l0aW9uIHRvICcke3RvU3RhdGV9JywgZXhwZWN0aW5nIHN0YXRlICcke2Zyb21TdGF0ZTF9JyR7ZnJvbVN0YXRlMiA/IFwiIG9yICdcIiArIGZyb21TdGF0ZTIgKyBcIidcIiA6ICcnfSwgd2FzICcke3RoaXMuX3N0YXRlfScuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhICYmIHR5cGVvZiB0aGlzLmRhdGEuaGFuZGxlSWQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGF0YS5oYW5kbGVJZC50b1N0cmluZygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBhZGQgdG9KU09OIG1ldGhvZCB0byBwcmV2ZW50IGN5Y2xpYyBlcnJvciB3aGVuXG4gICAgICAgIC8vIGNhbGwgSlNPTi5zdHJpbmdpZnkoem9uZVRhc2spXG4gICAgICAgIHRvSlNPTigpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogdGhpcy50eXBlLFxuICAgICAgICAgICAgICAgIHN0YXRlOiB0aGlzLnN0YXRlLFxuICAgICAgICAgICAgICAgIHNvdXJjZTogdGhpcy5zb3VyY2UsXG4gICAgICAgICAgICAgICAgem9uZTogdGhpcy56b25lLm5hbWUsXG4gICAgICAgICAgICAgICAgcnVuQ291bnQ6IHRoaXMucnVuQ291bnQsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIC8vLyAgTUlDUk9UQVNLIFFVRVVFXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgY29uc3Qgc3ltYm9sU2V0VGltZW91dCA9IF9fc3ltYm9sX18oJ3NldFRpbWVvdXQnKTtcbiAgICBjb25zdCBzeW1ib2xQcm9taXNlID0gX19zeW1ib2xfXygnUHJvbWlzZScpO1xuICAgIGNvbnN0IHN5bWJvbFRoZW4gPSBfX3N5bWJvbF9fKCd0aGVuJyk7XG4gICAgbGV0IF9taWNyb1Rhc2tRdWV1ZSA9IFtdO1xuICAgIGxldCBfaXNEcmFpbmluZ01pY3JvdGFza1F1ZXVlID0gZmFsc2U7XG4gICAgbGV0IG5hdGl2ZU1pY3JvVGFza1F1ZXVlUHJvbWlzZTtcbiAgICBmdW5jdGlvbiBuYXRpdmVTY2hlZHVsZU1pY3JvVGFzayhmdW5jKSB7XG4gICAgICAgIGlmICghbmF0aXZlTWljcm9UYXNrUXVldWVQcm9taXNlKSB7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsW3N5bWJvbFByb21pc2VdKSB7XG4gICAgICAgICAgICAgICAgbmF0aXZlTWljcm9UYXNrUXVldWVQcm9taXNlID0gZ2xvYmFsW3N5bWJvbFByb21pc2VdLnJlc29sdmUoMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5hdGl2ZU1pY3JvVGFza1F1ZXVlUHJvbWlzZSkge1xuICAgICAgICAgICAgbGV0IG5hdGl2ZVRoZW4gPSBuYXRpdmVNaWNyb1Rhc2tRdWV1ZVByb21pc2Vbc3ltYm9sVGhlbl07XG4gICAgICAgICAgICBpZiAoIW5hdGl2ZVRoZW4pIHtcbiAgICAgICAgICAgICAgICAvLyBuYXRpdmUgUHJvbWlzZSBpcyBub3QgcGF0Y2hhYmxlLCB3ZSBuZWVkIHRvIHVzZSBgdGhlbmAgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICAvLyBpc3N1ZSAxMDc4XG4gICAgICAgICAgICAgICAgbmF0aXZlVGhlbiA9IG5hdGl2ZU1pY3JvVGFza1F1ZXVlUHJvbWlzZVsndGhlbiddO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbmF0aXZlVGhlbi5jYWxsKG5hdGl2ZU1pY3JvVGFza1F1ZXVlUHJvbWlzZSwgZnVuYyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBnbG9iYWxbc3ltYm9sU2V0VGltZW91dF0oZnVuYywgMCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gc2NoZWR1bGVNaWNyb1Rhc2sodGFzaykge1xuICAgICAgICAvLyBpZiB3ZSBhcmUgbm90IHJ1bm5pbmcgaW4gYW55IHRhc2ssIGFuZCB0aGVyZSBoYXMgbm90IGJlZW4gYW55dGhpbmcgc2NoZWR1bGVkXG4gICAgICAgIC8vIHdlIG11c3QgYm9vdHN0cmFwIHRoZSBpbml0aWFsIHRhc2sgY3JlYXRpb24gYnkgbWFudWFsbHkgc2NoZWR1bGluZyB0aGUgZHJhaW5cbiAgICAgICAgaWYgKF9udW1iZXJPZk5lc3RlZFRhc2tGcmFtZXMgPT09IDAgJiYgX21pY3JvVGFza1F1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgLy8gV2UgYXJlIG5vdCBydW5uaW5nIGluIFRhc2ssIHNvIHdlIG5lZWQgdG8ga2lja3N0YXJ0IHRoZSBtaWNyb3Rhc2sgcXVldWUuXG4gICAgICAgICAgICBuYXRpdmVTY2hlZHVsZU1pY3JvVGFzayhkcmFpbk1pY3JvVGFza1F1ZXVlKTtcbiAgICAgICAgfVxuICAgICAgICB0YXNrICYmIF9taWNyb1Rhc2tRdWV1ZS5wdXNoKHRhc2spO1xuICAgIH1cbiAgICBmdW5jdGlvbiBkcmFpbk1pY3JvVGFza1F1ZXVlKCkge1xuICAgICAgICBpZiAoIV9pc0RyYWluaW5nTWljcm90YXNrUXVldWUpIHtcbiAgICAgICAgICAgIF9pc0RyYWluaW5nTWljcm90YXNrUXVldWUgPSB0cnVlO1xuICAgICAgICAgICAgd2hpbGUgKF9taWNyb1Rhc2tRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBxdWV1ZSA9IF9taWNyb1Rhc2tRdWV1ZTtcbiAgICAgICAgICAgICAgICBfbWljcm9UYXNrUXVldWUgPSBbXTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhc2sgPSBxdWV1ZVtpXTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2suem9uZS5ydW5UYXNrKHRhc2ssIG51bGwsIG51bGwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2FwaS5vblVuaGFuZGxlZEVycm9yKGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF9hcGkubWljcm90YXNrRHJhaW5Eb25lKCk7XG4gICAgICAgICAgICBfaXNEcmFpbmluZ01pY3JvdGFza1F1ZXVlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgLy8vICBCT09UU1RSQVBcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCBOT19aT05FID0geyBuYW1lOiAnTk8gWk9ORScgfTtcbiAgICBjb25zdCBub3RTY2hlZHVsZWQgPSAnbm90U2NoZWR1bGVkJywgc2NoZWR1bGluZyA9ICdzY2hlZHVsaW5nJywgc2NoZWR1bGVkID0gJ3NjaGVkdWxlZCcsIHJ1bm5pbmcgPSAncnVubmluZycsIGNhbmNlbGluZyA9ICdjYW5jZWxpbmcnLCB1bmtub3duID0gJ3Vua25vd24nO1xuICAgIGNvbnN0IG1pY3JvVGFzayA9ICdtaWNyb1Rhc2snLCBtYWNyb1Rhc2sgPSAnbWFjcm9UYXNrJywgZXZlbnRUYXNrID0gJ2V2ZW50VGFzayc7XG4gICAgY29uc3QgcGF0Y2hlcyA9IHt9O1xuICAgIGNvbnN0IF9hcGkgPSB7XG4gICAgICAgIHN5bWJvbDogX19zeW1ib2xfXyxcbiAgICAgICAgY3VycmVudFpvbmVGcmFtZTogKCkgPT4gX2N1cnJlbnRab25lRnJhbWUsXG4gICAgICAgIG9uVW5oYW5kbGVkRXJyb3I6IG5vb3AsXG4gICAgICAgIG1pY3JvdGFza0RyYWluRG9uZTogbm9vcCxcbiAgICAgICAgc2NoZWR1bGVNaWNyb1Rhc2s6IHNjaGVkdWxlTWljcm9UYXNrLFxuICAgICAgICBzaG93VW5jYXVnaHRFcnJvcjogKCkgPT4gIVpvbmVJbXBsW19fc3ltYm9sX18oJ2lnbm9yZUNvbnNvbGVFcnJvclVuY2F1Z2h0RXJyb3InKV0sXG4gICAgICAgIHBhdGNoRXZlbnRUYXJnZXQ6ICgpID0+IFtdLFxuICAgICAgICBwYXRjaE9uUHJvcGVydGllczogbm9vcCxcbiAgICAgICAgcGF0Y2hNZXRob2Q6ICgpID0+IG5vb3AsXG4gICAgICAgIGJpbmRBcmd1bWVudHM6ICgpID0+IFtdLFxuICAgICAgICBwYXRjaFRoZW46ICgpID0+IG5vb3AsXG4gICAgICAgIHBhdGNoTWFjcm9UYXNrOiAoKSA9PiBub29wLFxuICAgICAgICBwYXRjaEV2ZW50UHJvdG90eXBlOiAoKSA9PiBub29wLFxuICAgICAgICBpc0lFT3JFZGdlOiAoKSA9PiBmYWxzZSxcbiAgICAgICAgZ2V0R2xvYmFsT2JqZWN0czogKCkgPT4gdW5kZWZpbmVkLFxuICAgICAgICBPYmplY3REZWZpbmVQcm9wZXJ0eTogKCkgPT4gbm9vcCxcbiAgICAgICAgT2JqZWN0R2V0T3duUHJvcGVydHlEZXNjcmlwdG9yOiAoKSA9PiB1bmRlZmluZWQsXG4gICAgICAgIE9iamVjdENyZWF0ZTogKCkgPT4gdW5kZWZpbmVkLFxuICAgICAgICBBcnJheVNsaWNlOiAoKSA9PiBbXSxcbiAgICAgICAgcGF0Y2hDbGFzczogKCkgPT4gbm9vcCxcbiAgICAgICAgd3JhcFdpdGhDdXJyZW50Wm9uZTogKCkgPT4gbm9vcCxcbiAgICAgICAgZmlsdGVyUHJvcGVydGllczogKCkgPT4gW10sXG4gICAgICAgIGF0dGFjaE9yaWdpblRvUGF0Y2hlZDogKCkgPT4gbm9vcCxcbiAgICAgICAgX3JlZGVmaW5lUHJvcGVydHk6ICgpID0+IG5vb3AsXG4gICAgICAgIHBhdGNoQ2FsbGJhY2tzOiAoKSA9PiBub29wLFxuICAgICAgICBuYXRpdmVTY2hlZHVsZU1pY3JvVGFzazogbmF0aXZlU2NoZWR1bGVNaWNyb1Rhc2ssXG4gICAgfTtcbiAgICBsZXQgX2N1cnJlbnRab25lRnJhbWUgPSB7IHBhcmVudDogbnVsbCwgem9uZTogbmV3IFpvbmVJbXBsKG51bGwsIG51bGwpIH07XG4gICAgbGV0IF9jdXJyZW50VGFzayA9IG51bGw7XG4gICAgbGV0IF9udW1iZXJPZk5lc3RlZFRhc2tGcmFtZXMgPSAwO1xuICAgIGZ1bmN0aW9uIG5vb3AoKSB7IH1cbiAgICBwZXJmb3JtYW5jZU1lYXN1cmUoJ1pvbmUnLCAnWm9uZScpO1xuICAgIHJldHVybiBab25lSW1wbDtcbn1cblxuZnVuY3Rpb24gbG9hZFpvbmUoKSB7XG4gICAgLy8gaWYgZ2xvYmFsWydab25lJ10gYWxyZWFkeSBleGlzdHMgKG1heWJlIHpvbmUuanMgd2FzIGFscmVhZHkgbG9hZGVkIG9yXG4gICAgLy8gc29tZSBvdGhlciBsaWIgYWxzbyByZWdpc3RlcmVkIGEgZ2xvYmFsIG9iamVjdCBuYW1lZCBab25lKSwgd2UgbWF5IG5lZWRcbiAgICAvLyB0byB0aHJvdyBhbiBlcnJvciwgYnV0IHNvbWV0aW1lcyB1c2VyIG1heSBub3Qgd2FudCB0aGlzIGVycm9yLlxuICAgIC8vIEZvciBleGFtcGxlLFxuICAgIC8vIHdlIGhhdmUgdHdvIHdlYiBwYWdlcywgcGFnZTEgaW5jbHVkZXMgem9uZS5qcywgcGFnZTIgZG9lc24ndC5cbiAgICAvLyBhbmQgdGhlIDFzdCB0aW1lIHVzZXIgbG9hZCBwYWdlMSBhbmQgcGFnZTIsIGV2ZXJ5dGhpbmcgd29yayBmaW5lLFxuICAgIC8vIGJ1dCB3aGVuIHVzZXIgbG9hZCBwYWdlMiBhZ2FpbiwgZXJyb3Igb2NjdXJzIGJlY2F1c2UgZ2xvYmFsWydab25lJ10gYWxyZWFkeSBleGlzdHMuXG4gICAgLy8gc28gd2UgYWRkIGEgZmxhZyB0byBsZXQgdXNlciBjaG9vc2Ugd2hldGhlciB0byB0aHJvdyB0aGlzIGVycm9yIG9yIG5vdC5cbiAgICAvLyBCeSBkZWZhdWx0LCBpZiBleGlzdGluZyBab25lIGlzIGZyb20gem9uZS5qcywgd2Ugd2lsbCBub3QgdGhyb3cgdGhlIGVycm9yLlxuICAgIGNvbnN0IGdsb2JhbCA9IGdsb2JhbFRoaXM7XG4gICAgY29uc3QgY2hlY2tEdXBsaWNhdGUgPSBnbG9iYWxbX19zeW1ib2xfXygnZm9yY2VEdXBsaWNhdGVab25lQ2hlY2snKV0gPT09IHRydWU7XG4gICAgaWYgKGdsb2JhbFsnWm9uZSddICYmIChjaGVja0R1cGxpY2F0ZSB8fCB0eXBlb2YgZ2xvYmFsWydab25lJ10uX19zeW1ib2xfXyAhPT0gJ2Z1bmN0aW9uJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdab25lIGFscmVhZHkgbG9hZGVkLicpO1xuICAgIH1cbiAgICAvLyBJbml0aWFsaXplIGdsb2JhbCBgWm9uZWAgY29uc3RhbnQuXG4gICAgZ2xvYmFsWydab25lJ10gPz89IGluaXRab25lKCk7XG4gICAgcmV0dXJuIGdsb2JhbFsnWm9uZSddO1xufVxuXG4vKipcbiAqIFN1cHByZXNzIGNsb3N1cmUgY29tcGlsZXIgZXJyb3JzIGFib3V0IHVua25vd24gJ1pvbmUnIHZhcmlhYmxlXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKiBAc3VwcHJlc3Mge3VuZGVmaW5lZFZhcnMsZ2xvYmFsVGhpcyxtaXNzaW5nUmVxdWlyZX1cbiAqL1xuLy8vIDxyZWZlcmVuY2UgdHlwZXM9XCJub2RlXCIvPlxuLy8gaXNzdWUgIzk4OSwgdG8gcmVkdWNlIGJ1bmRsZSBzaXplLCB1c2Ugc2hvcnQgbmFtZVxuLyoqIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IgKi9cbmNvbnN0IE9iamVjdEdldE93blByb3BlcnR5RGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3I7XG4vKiogT2JqZWN0LmRlZmluZVByb3BlcnR5ICovXG5jb25zdCBPYmplY3REZWZpbmVQcm9wZXJ0eSA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbi8qKiBPYmplY3QuZ2V0UHJvdG90eXBlT2YgKi9cbmNvbnN0IE9iamVjdEdldFByb3RvdHlwZU9mID0gT2JqZWN0LmdldFByb3RvdHlwZU9mO1xuLyoqIE9iamVjdC5jcmVhdGUgKi9cbmNvbnN0IE9iamVjdENyZWF0ZSA9IE9iamVjdC5jcmVhdGU7XG4vKiogQXJyYXkucHJvdG90eXBlLnNsaWNlICovXG5jb25zdCBBcnJheVNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xuLyoqIGFkZEV2ZW50TGlzdGVuZXIgc3RyaW5nIGNvbnN0ICovXG5jb25zdCBBRERfRVZFTlRfTElTVEVORVJfU1RSID0gJ2FkZEV2ZW50TGlzdGVuZXInO1xuLyoqIHJlbW92ZUV2ZW50TGlzdGVuZXIgc3RyaW5nIGNvbnN0ICovXG5jb25zdCBSRU1PVkVfRVZFTlRfTElTVEVORVJfU1RSID0gJ3JlbW92ZUV2ZW50TGlzdGVuZXInO1xuLyoqIHpvbmVTeW1ib2wgYWRkRXZlbnRMaXN0ZW5lciAqL1xuY29uc3QgWk9ORV9TWU1CT0xfQUREX0VWRU5UX0xJU1RFTkVSID0gX19zeW1ib2xfXyhBRERfRVZFTlRfTElTVEVORVJfU1RSKTtcbi8qKiB6b25lU3ltYm9sIHJlbW92ZUV2ZW50TGlzdGVuZXIgKi9cbmNvbnN0IFpPTkVfU1lNQk9MX1JFTU9WRV9FVkVOVF9MSVNURU5FUiA9IF9fc3ltYm9sX18oUkVNT1ZFX0VWRU5UX0xJU1RFTkVSX1NUUik7XG4vKiogdHJ1ZSBzdHJpbmcgY29uc3QgKi9cbmNvbnN0IFRSVUVfU1RSID0gJ3RydWUnO1xuLyoqIGZhbHNlIHN0cmluZyBjb25zdCAqL1xuY29uc3QgRkFMU0VfU1RSID0gJ2ZhbHNlJztcbi8qKiBab25lIHN5bWJvbCBwcmVmaXggc3RyaW5nIGNvbnN0LiAqL1xuY29uc3QgWk9ORV9TWU1CT0xfUFJFRklYID0gX19zeW1ib2xfXygnJyk7XG5mdW5jdGlvbiB3cmFwV2l0aEN1cnJlbnRab25lKGNhbGxiYWNrLCBzb3VyY2UpIHtcbiAgICByZXR1cm4gWm9uZS5jdXJyZW50LndyYXAoY2FsbGJhY2ssIHNvdXJjZSk7XG59XG5mdW5jdGlvbiBzY2hlZHVsZU1hY3JvVGFza1dpdGhDdXJyZW50Wm9uZShzb3VyY2UsIGNhbGxiYWNrLCBkYXRhLCBjdXN0b21TY2hlZHVsZSwgY3VzdG9tQ2FuY2VsKSB7XG4gICAgcmV0dXJuIFpvbmUuY3VycmVudC5zY2hlZHVsZU1hY3JvVGFzayhzb3VyY2UsIGNhbGxiYWNrLCBkYXRhLCBjdXN0b21TY2hlZHVsZSwgY3VzdG9tQ2FuY2VsKTtcbn1cbmNvbnN0IHpvbmVTeW1ib2wgPSBfX3N5bWJvbF9fO1xuY29uc3QgaXNXaW5kb3dFeGlzdHMgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJztcbmNvbnN0IGludGVybmFsV2luZG93ID0gaXNXaW5kb3dFeGlzdHMgPyB3aW5kb3cgOiB1bmRlZmluZWQ7XG5jb25zdCBfZ2xvYmFsID0gKGlzV2luZG93RXhpc3RzICYmIGludGVybmFsV2luZG93KSB8fCBnbG9iYWxUaGlzO1xuY29uc3QgUkVNT1ZFX0FUVFJJQlVURSA9ICdyZW1vdmVBdHRyaWJ1dGUnO1xuZnVuY3Rpb24gYmluZEFyZ3VtZW50cyhhcmdzLCBzb3VyY2UpIHtcbiAgICBmb3IgKGxldCBpID0gYXJncy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZ3NbaV0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGFyZ3NbaV0gPSB3cmFwV2l0aEN1cnJlbnRab25lKGFyZ3NbaV0sIHNvdXJjZSArICdfJyArIGkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcmdzO1xufVxuZnVuY3Rpb24gcGF0Y2hQcm90b3R5cGUocHJvdG90eXBlLCBmbk5hbWVzKSB7XG4gICAgY29uc3Qgc291cmNlID0gcHJvdG90eXBlLmNvbnN0cnVjdG9yWyduYW1lJ107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmbk5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSBmbk5hbWVzW2ldO1xuICAgICAgICBjb25zdCBkZWxlZ2F0ZSA9IHByb3RvdHlwZVtuYW1lXTtcbiAgICAgICAgaWYgKGRlbGVnYXRlKSB7XG4gICAgICAgICAgICBjb25zdCBwcm90b3R5cGVEZXNjID0gT2JqZWN0R2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHByb3RvdHlwZSwgbmFtZSk7XG4gICAgICAgICAgICBpZiAoIWlzUHJvcGVydHlXcml0YWJsZShwcm90b3R5cGVEZXNjKSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJvdG90eXBlW25hbWVdID0gKChkZWxlZ2F0ZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGNoZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBkZWxlZ2F0ZS5hcHBseSh0aGlzLCBiaW5kQXJndW1lbnRzKGFyZ3VtZW50cywgc291cmNlICsgJy4nICsgbmFtZSkpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgYXR0YWNoT3JpZ2luVG9QYXRjaGVkKHBhdGNoZWQsIGRlbGVnYXRlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGF0Y2hlZDtcbiAgICAgICAgICAgIH0pKGRlbGVnYXRlKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIGlzUHJvcGVydHlXcml0YWJsZShwcm9wZXJ0eURlc2MpIHtcbiAgICBpZiAoIXByb3BlcnR5RGVzYykge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHByb3BlcnR5RGVzYy53cml0YWJsZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gISh0eXBlb2YgcHJvcGVydHlEZXNjLmdldCA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgcHJvcGVydHlEZXNjLnNldCA9PT0gJ3VuZGVmaW5lZCcpO1xufVxuY29uc3QgaXNXZWJXb3JrZXIgPSB0eXBlb2YgV29ya2VyR2xvYmFsU2NvcGUgIT09ICd1bmRlZmluZWQnICYmIHNlbGYgaW5zdGFuY2VvZiBXb3JrZXJHbG9iYWxTY29wZTtcbi8vIE1ha2Ugc3VyZSB0byBhY2Nlc3MgYHByb2Nlc3NgIHRocm91Z2ggYF9nbG9iYWxgIHNvIHRoYXQgV2ViUGFjayBkb2VzIG5vdCBhY2NpZGVudGFsbHkgYnJvd3NlcmlmeVxuLy8gdGhpcyBjb2RlLlxuY29uc3QgaXNOb2RlID0gISgnbncnIGluIF9nbG9iYWwpICYmXG4gICAgdHlwZW9mIF9nbG9iYWwucHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICBfZ2xvYmFsLnByb2Nlc3MudG9TdHJpbmcoKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuY29uc3QgaXNCcm93c2VyID0gIWlzTm9kZSAmJiAhaXNXZWJXb3JrZXIgJiYgISEoaXNXaW5kb3dFeGlzdHMgJiYgaW50ZXJuYWxXaW5kb3dbJ0hUTUxFbGVtZW50J10pO1xuLy8gd2UgYXJlIGluIGVsZWN0cm9uIG9mIG53LCBzbyB3ZSBhcmUgYm90aCBicm93c2VyIGFuZCBub2RlanNcbi8vIE1ha2Ugc3VyZSB0byBhY2Nlc3MgYHByb2Nlc3NgIHRocm91Z2ggYF9nbG9iYWxgIHNvIHRoYXQgV2ViUGFjayBkb2VzIG5vdCBhY2NpZGVudGFsbHkgYnJvd3NlcmlmeVxuLy8gdGhpcyBjb2RlLlxuY29uc3QgaXNNaXggPSB0eXBlb2YgX2dsb2JhbC5wcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJlxuICAgIF9nbG9iYWwucHJvY2Vzcy50b1N0cmluZygpID09PSAnW29iamVjdCBwcm9jZXNzXScgJiZcbiAgICAhaXNXZWJXb3JrZXIgJiZcbiAgICAhIShpc1dpbmRvd0V4aXN0cyAmJiBpbnRlcm5hbFdpbmRvd1snSFRNTEVsZW1lbnQnXSk7XG5jb25zdCB6b25lU3ltYm9sRXZlbnROYW1lcyQxID0ge307XG5jb25zdCBlbmFibGVCZWZvcmV1bmxvYWRTeW1ib2wgPSB6b25lU3ltYm9sKCdlbmFibGVfYmVmb3JldW5sb2FkJyk7XG5jb25zdCB3cmFwRm4gPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci96b25lLmpzL2lzc3Vlcy85MTEsIGluIElFLCBzb21ldGltZXNcbiAgICAvLyBldmVudCB3aWxsIGJlIHVuZGVmaW5lZCwgc28gd2UgbmVlZCB0byB1c2Ugd2luZG93LmV2ZW50XG4gICAgZXZlbnQgPSBldmVudCB8fCBfZ2xvYmFsLmV2ZW50O1xuICAgIGlmICghZXZlbnQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsZXQgZXZlbnROYW1lU3ltYm9sID0gem9uZVN5bWJvbEV2ZW50TmFtZXMkMVtldmVudC50eXBlXTtcbiAgICBpZiAoIWV2ZW50TmFtZVN5bWJvbCkge1xuICAgICAgICBldmVudE5hbWVTeW1ib2wgPSB6b25lU3ltYm9sRXZlbnROYW1lcyQxW2V2ZW50LnR5cGVdID0gem9uZVN5bWJvbCgnT05fUFJPUEVSVFknICsgZXZlbnQudHlwZSk7XG4gICAgfVxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMgfHwgZXZlbnQudGFyZ2V0IHx8IF9nbG9iYWw7XG4gICAgY29uc3QgbGlzdGVuZXIgPSB0YXJnZXRbZXZlbnROYW1lU3ltYm9sXTtcbiAgICBsZXQgcmVzdWx0O1xuICAgIGlmIChpc0Jyb3dzZXIgJiYgdGFyZ2V0ID09PSBpbnRlcm5hbFdpbmRvdyAmJiBldmVudC50eXBlID09PSAnZXJyb3InKSB7XG4gICAgICAgIC8vIHdpbmRvdy5vbmVycm9yIGhhdmUgZGlmZmVyZW50IHNpZ25hdHVyZVxuICAgICAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvR2xvYmFsRXZlbnRIYW5kbGVycy9vbmVycm9yI3dpbmRvdy5vbmVycm9yXG4gICAgICAgIC8vIGFuZCBvbmVycm9yIGNhbGxiYWNrIHdpbGwgcHJldmVudCBkZWZhdWx0IHdoZW4gY2FsbGJhY2sgcmV0dXJuIHRydWVcbiAgICAgICAgY29uc3QgZXJyb3JFdmVudCA9IGV2ZW50O1xuICAgICAgICByZXN1bHQgPVxuICAgICAgICAgICAgbGlzdGVuZXIgJiZcbiAgICAgICAgICAgICAgICBsaXN0ZW5lci5jYWxsKHRoaXMsIGVycm9yRXZlbnQubWVzc2FnZSwgZXJyb3JFdmVudC5maWxlbmFtZSwgZXJyb3JFdmVudC5saW5lbm8sIGVycm9yRXZlbnQuY29sbm8sIGVycm9yRXZlbnQuZXJyb3IpO1xuICAgICAgICBpZiAocmVzdWx0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXN1bHQgPSBsaXN0ZW5lciAmJiBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICBpZiAoXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2FuZ3VsYXIvaXNzdWVzLzQ3NTc5XG4gICAgICAgIC8vIGh0dHBzOi8vd3d3LnczLm9yZy9UUi8yMDExL1dELWh0bWw1LTIwMTEwNTI1L2hpc3RvcnkuaHRtbCNiZWZvcmV1bmxvYWRldmVudFxuICAgICAgICAvLyBUaGlzIGlzIHRoZSBvbmx5IHNwZWNpZmljIGNhc2Ugd2Ugc2hvdWxkIGNoZWNrIGZvci4gVGhlIHNwZWMgZGVmaW5lcyB0aGF0IHRoZVxuICAgICAgICAvLyBgcmV0dXJuVmFsdWVgIGF0dHJpYnV0ZSByZXByZXNlbnRzIHRoZSBtZXNzYWdlIHRvIHNob3cgdGhlIHVzZXIuIFdoZW4gdGhlIGV2ZW50XG4gICAgICAgIC8vIGlzIGNyZWF0ZWQsIHRoaXMgYXR0cmlidXRlIG11c3QgYmUgc2V0IHRvIHRoZSBlbXB0eSBzdHJpbmcuXG4gICAgICAgIGV2ZW50LnR5cGUgPT09ICdiZWZvcmV1bmxvYWQnICYmXG4gICAgICAgICAgICAvLyBUbyBwcmV2ZW50IGFueSBicmVha2luZyBjaGFuZ2VzIHJlc3VsdGluZyBmcm9tIHRoaXMgY2hhbmdlLCBnaXZlbiB0aGF0XG4gICAgICAgICAgICAvLyBpdCB3YXMgYWxyZWFkeSBjYXVzaW5nIGEgc2lnbmlmaWNhbnQgbnVtYmVyIG9mIGZhaWx1cmVzIGluIEczLCB3ZSBoYXZlIGhpZGRlblxuICAgICAgICAgICAgLy8gdGhhdCBiZWhhdmlvciBiZWhpbmQgYSBnbG9iYWwgY29uZmlndXJhdGlvbiBmbGFnLiBDb25zdW1lcnMgY2FuIGVuYWJsZSB0aGlzXG4gICAgICAgICAgICAvLyBmbGFnIGV4cGxpY2l0bHkgaWYgdGhleSB3YW50IHRoZSBgYmVmb3JldW5sb2FkYCBldmVudCB0byBiZSBoYW5kbGVkIGFzIGRlZmluZWRcbiAgICAgICAgICAgIC8vIGluIHRoZSBzcGVjaWZpY2F0aW9uLlxuICAgICAgICAgICAgX2dsb2JhbFtlbmFibGVCZWZvcmV1bmxvYWRTeW1ib2xdICYmXG4gICAgICAgICAgICAvLyBUaGUgSURMIGV2ZW50IGRlZmluaXRpb24gaXMgYGF0dHJpYnV0ZSBET01TdHJpbmcgcmV0dXJuVmFsdWVgLCBzbyB3ZSBjaGVjayB3aGV0aGVyXG4gICAgICAgICAgICAvLyBgdHlwZW9mIHJlc3VsdGAgaXMgYSBzdHJpbmcuXG4gICAgICAgICAgICB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZXZlbnQucmV0dXJuVmFsdWUgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocmVzdWx0ICE9IHVuZGVmaW5lZCAmJiAhcmVzdWx0KSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuZnVuY3Rpb24gcGF0Y2hQcm9wZXJ0eShvYmosIHByb3AsIHByb3RvdHlwZSkge1xuICAgIGxldCBkZXNjID0gT2JqZWN0R2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKG9iaiwgcHJvcCk7XG4gICAgaWYgKCFkZXNjICYmIHByb3RvdHlwZSkge1xuICAgICAgICAvLyB3aGVuIHBhdGNoIHdpbmRvdyBvYmplY3QsIHVzZSBwcm90b3R5cGUgdG8gY2hlY2sgcHJvcCBleGlzdCBvciBub3RcbiAgICAgICAgY29uc3QgcHJvdG90eXBlRGVzYyA9IE9iamVjdEdldE93blByb3BlcnR5RGVzY3JpcHRvcihwcm90b3R5cGUsIHByb3ApO1xuICAgICAgICBpZiAocHJvdG90eXBlRGVzYykge1xuICAgICAgICAgICAgZGVzYyA9IHsgZW51bWVyYWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gaWYgdGhlIGRlc2NyaXB0b3Igbm90IGV4aXN0cyBvciBpcyBub3QgY29uZmlndXJhYmxlXG4gICAgLy8ganVzdCByZXR1cm5cbiAgICBpZiAoIWRlc2MgfHwgIWRlc2MuY29uZmlndXJhYmxlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgb25Qcm9wUGF0Y2hlZFN5bWJvbCA9IHpvbmVTeW1ib2woJ29uJyArIHByb3AgKyAncGF0Y2hlZCcpO1xuICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkob25Qcm9wUGF0Y2hlZFN5bWJvbCkgJiYgb2JqW29uUHJvcFBhdGNoZWRTeW1ib2xdKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gQSBwcm9wZXJ0eSBkZXNjcmlwdG9yIGNhbm5vdCBoYXZlIGdldHRlci9zZXR0ZXIgYW5kIGJlIHdyaXRhYmxlXG4gICAgLy8gZGVsZXRpbmcgdGhlIHdyaXRhYmxlIGFuZCB2YWx1ZSBwcm9wZXJ0aWVzIGF2b2lkcyB0aGlzIGVycm9yOlxuICAgIC8vXG4gICAgLy8gVHlwZUVycm9yOiBwcm9wZXJ0eSBkZXNjcmlwdG9ycyBtdXN0IG5vdCBzcGVjaWZ5IGEgdmFsdWUgb3IgYmUgd3JpdGFibGUgd2hlbiBhXG4gICAgLy8gZ2V0dGVyIG9yIHNldHRlciBoYXMgYmVlbiBzcGVjaWZpZWRcbiAgICBkZWxldGUgZGVzYy53cml0YWJsZTtcbiAgICBkZWxldGUgZGVzYy52YWx1ZTtcbiAgICBjb25zdCBvcmlnaW5hbERlc2NHZXQgPSBkZXNjLmdldDtcbiAgICBjb25zdCBvcmlnaW5hbERlc2NTZXQgPSBkZXNjLnNldDtcbiAgICAvLyBzbGljZSgyKSBjdXogJ29uY2xpY2snIC0+ICdjbGljaycsIGV0Y1xuICAgIGNvbnN0IGV2ZW50TmFtZSA9IHByb3Auc2xpY2UoMik7XG4gICAgbGV0IGV2ZW50TmFtZVN5bWJvbCA9IHpvbmVTeW1ib2xFdmVudE5hbWVzJDFbZXZlbnROYW1lXTtcbiAgICBpZiAoIWV2ZW50TmFtZVN5bWJvbCkge1xuICAgICAgICBldmVudE5hbWVTeW1ib2wgPSB6b25lU3ltYm9sRXZlbnROYW1lcyQxW2V2ZW50TmFtZV0gPSB6b25lU3ltYm9sKCdPTl9QUk9QRVJUWScgKyBldmVudE5hbWUpO1xuICAgIH1cbiAgICBkZXNjLnNldCA9IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAvLyBJbiBzb21lIHZlcnNpb25zIG9mIFdpbmRvd3MsIHRoZSBgdGhpc2AgY29udGV4dCBtYXkgYmUgdW5kZWZpbmVkXG4gICAgICAgIC8vIGluIG9uLXByb3BlcnR5IGNhbGxiYWNrcy5cbiAgICAgICAgLy8gVG8gaGFuZGxlIHRoaXMgZWRnZSBjYXNlLCB3ZSBjaGVjayBpZiBgdGhpc2AgaXMgZmFsc3kgYW5kXG4gICAgICAgIC8vIGZhbGxiYWNrIHRvIGBfZ2xvYmFsYCBpZiBuZWVkZWQuXG4gICAgICAgIGxldCB0YXJnZXQgPSB0aGlzO1xuICAgICAgICBpZiAoIXRhcmdldCAmJiBvYmogPT09IF9nbG9iYWwpIHtcbiAgICAgICAgICAgIHRhcmdldCA9IF9nbG9iYWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcmV2aW91c1ZhbHVlID0gdGFyZ2V0W2V2ZW50TmFtZVN5bWJvbF07XG4gICAgICAgIGlmICh0eXBlb2YgcHJldmlvdXNWYWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnROYW1lLCB3cmFwRm4pO1xuICAgICAgICB9XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL3pvbmUuanMvaXNzdWVzLzk3OFxuICAgICAgICAvLyBJZiBhbiBpbmxpbmUgaGFuZGxlciAobGlrZSBgb25sb2FkYCkgd2FzIGRlZmluZWQgYmVmb3JlIHpvbmUuanMgd2FzIGxvYWRlZCxcbiAgICAgICAgLy8gY2FsbCB0aGUgb3JpZ2luYWwgZGVzY3JpcHRvcidzIHNldHRlciB0byBjbGVhbiBpdCB1cC5cbiAgICAgICAgb3JpZ2luYWxEZXNjU2V0Py5jYWxsKHRhcmdldCwgbnVsbCk7XG4gICAgICAgIHRhcmdldFtldmVudE5hbWVTeW1ib2xdID0gbmV3VmFsdWU7XG4gICAgICAgIGlmICh0eXBlb2YgbmV3VmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgd3JhcEZuLCBmYWxzZSk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIC8vIFRoZSBnZXR0ZXIgd291bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgdW5hc3NpZ25lZCBwcm9wZXJ0aWVzIGJ1dCB0aGUgZGVmYXVsdCB2YWx1ZSBvZiBhblxuICAgIC8vIHVuYXNzaWduZWQgcHJvcGVydHkgaXMgbnVsbFxuICAgIGRlc2MuZ2V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBpbiBzb21lIG9mIHdpbmRvd3MncyBvbnByb3BlcnR5IGNhbGxiYWNrLCB0aGlzIGlzIHVuZGVmaW5lZFxuICAgICAgICAvLyBzbyB3ZSBuZWVkIHRvIGNoZWNrIGl0XG4gICAgICAgIGxldCB0YXJnZXQgPSB0aGlzO1xuICAgICAgICBpZiAoIXRhcmdldCAmJiBvYmogPT09IF9nbG9iYWwpIHtcbiAgICAgICAgICAgIHRhcmdldCA9IF9nbG9iYWw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxpc3RlbmVyID0gdGFyZ2V0W2V2ZW50TmFtZVN5bWJvbF07XG4gICAgICAgIGlmIChsaXN0ZW5lcikge1xuICAgICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9yaWdpbmFsRGVzY0dldCkge1xuICAgICAgICAgICAgLy8gcmVzdWx0IHdpbGwgYmUgbnVsbCB3aGVuIHVzZSBpbmxpbmUgZXZlbnQgYXR0cmlidXRlLFxuICAgICAgICAgICAgLy8gc3VjaCBhcyA8YnV0dG9uIG9uY2xpY2s9XCJmdW5jKCk7XCI+T0s8L2J1dHRvbj5cbiAgICAgICAgICAgIC8vIGJlY2F1c2UgdGhlIG9uY2xpY2sgZnVuY3Rpb24gaXMgaW50ZXJuYWwgcmF3IHVuY29tcGlsZWQgaGFuZGxlclxuICAgICAgICAgICAgLy8gdGhlIG9uY2xpY2sgd2lsbCBiZSBldmFsdWF0ZWQgd2hlbiBmaXJzdCB0aW1lIGV2ZW50IHdhcyB0cmlnZ2VyZWQgb3JcbiAgICAgICAgICAgIC8vIHRoZSBwcm9wZXJ0eSBpcyBhY2Nlc3NlZCwgaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvem9uZS5qcy9pc3N1ZXMvNTI1XG4gICAgICAgICAgICAvLyBzbyB3ZSBzaG91bGQgdXNlIG9yaWdpbmFsIG5hdGl2ZSBnZXQgdG8gcmV0cmlldmUgdGhlIGhhbmRsZXJcbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IG9yaWdpbmFsRGVzY0dldC5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgZGVzYy5zZXQuY2FsbCh0aGlzLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0YXJnZXRbUkVNT1ZFX0FUVFJJQlVURV0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUF0dHJpYnV0ZShwcm9wKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH07XG4gICAgT2JqZWN0RGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCBkZXNjKTtcbiAgICBvYmpbb25Qcm9wUGF0Y2hlZFN5bWJvbF0gPSB0cnVlO1xufVxuZnVuY3Rpb24gcGF0Y2hPblByb3BlcnRpZXMob2JqLCBwcm9wZXJ0aWVzLCBwcm90b3R5cGUpIHtcbiAgICBpZiAocHJvcGVydGllcykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByb3BlcnRpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHBhdGNoUHJvcGVydHkob2JqLCAnb24nICsgcHJvcGVydGllc1tpXSwgcHJvdG90eXBlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgY29uc3Qgb25Qcm9wZXJ0aWVzID0gW107XG4gICAgICAgIGZvciAoY29uc3QgcHJvcCBpbiBvYmopIHtcbiAgICAgICAgICAgIGlmIChwcm9wLnNsaWNlKDAsIDIpID09ICdvbicpIHtcbiAgICAgICAgICAgICAgICBvblByb3BlcnRpZXMucHVzaChwcm9wKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG9uUHJvcGVydGllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgcGF0Y2hQcm9wZXJ0eShvYmosIG9uUHJvcGVydGllc1tqXSwgcHJvdG90eXBlKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmNvbnN0IG9yaWdpbmFsSW5zdGFuY2VLZXkgPSB6b25lU3ltYm9sKCdvcmlnaW5hbEluc3RhbmNlJyk7XG4vLyB3cmFwIHNvbWUgbmF0aXZlIEFQSSBvbiBgd2luZG93YFxuZnVuY3Rpb24gcGF0Y2hDbGFzcyhjbGFzc05hbWUpIHtcbiAgICBjb25zdCBPcmlnaW5hbENsYXNzID0gX2dsb2JhbFtjbGFzc05hbWVdO1xuICAgIGlmICghT3JpZ2luYWxDbGFzcylcbiAgICAgICAgcmV0dXJuO1xuICAgIC8vIGtlZXAgb3JpZ2luYWwgY2xhc3MgaW4gZ2xvYmFsXG4gICAgX2dsb2JhbFt6b25lU3ltYm9sKGNsYXNzTmFtZSldID0gT3JpZ2luYWxDbGFzcztcbiAgICBfZ2xvYmFsW2NsYXNzTmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IGEgPSBiaW5kQXJndW1lbnRzKGFyZ3VtZW50cywgY2xhc3NOYW1lKTtcbiAgICAgICAgc3dpdGNoIChhLmxlbmd0aCkge1xuICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICAgIHRoaXNbb3JpZ2luYWxJbnN0YW5jZUtleV0gPSBuZXcgT3JpZ2luYWxDbGFzcygpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgIHRoaXNbb3JpZ2luYWxJbnN0YW5jZUtleV0gPSBuZXcgT3JpZ2luYWxDbGFzcyhhWzBdKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICB0aGlzW29yaWdpbmFsSW5zdGFuY2VLZXldID0gbmV3IE9yaWdpbmFsQ2xhc3MoYVswXSwgYVsxXSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgICAgdGhpc1tvcmlnaW5hbEluc3RhbmNlS2V5XSA9IG5ldyBPcmlnaW5hbENsYXNzKGFbMF0sIGFbMV0sIGFbMl0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgICAgIHRoaXNbb3JpZ2luYWxJbnN0YW5jZUtleV0gPSBuZXcgT3JpZ2luYWxDbGFzcyhhWzBdLCBhWzFdLCBhWzJdLCBhWzNdKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBcmcgbGlzdCB0b28gbG9uZy4nKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gYXR0YWNoIG9yaWdpbmFsIGRlbGVnYXRlIHRvIHBhdGNoZWQgZnVuY3Rpb25cbiAgICBhdHRhY2hPcmlnaW5Ub1BhdGNoZWQoX2dsb2JhbFtjbGFzc05hbWVdLCBPcmlnaW5hbENsYXNzKTtcbiAgICBjb25zdCBpbnN0YW5jZSA9IG5ldyBPcmlnaW5hbENsYXNzKGZ1bmN0aW9uICgpIHsgfSk7XG4gICAgbGV0IHByb3A7XG4gICAgZm9yIChwcm9wIGluIGluc3RhbmNlKSB7XG4gICAgICAgIC8vIGh0dHBzOi8vYnVncy53ZWJraXQub3JnL3Nob3dfYnVnLmNnaT9pZD00NDcyMVxuICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnWE1MSHR0cFJlcXVlc3QnICYmIHByb3AgPT09ICdyZXNwb25zZUJsb2InKVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIChmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnN0YW5jZVtwcm9wXSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIF9nbG9iYWxbY2xhc3NOYW1lXS5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzW29yaWdpbmFsSW5zdGFuY2VLZXldW3Byb3BdLmFwcGx5KHRoaXNbb3JpZ2luYWxJbnN0YW5jZUtleV0sIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIE9iamVjdERlZmluZVByb3BlcnR5KF9nbG9iYWxbY2xhc3NOYW1lXS5wcm90b3R5cGUsIHByb3AsIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0OiBmdW5jdGlvbiAoZm4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzW29yaWdpbmFsSW5zdGFuY2VLZXldW3Byb3BdID0gd3JhcFdpdGhDdXJyZW50Wm9uZShmbiwgY2xhc3NOYW1lICsgJy4nICsgcHJvcCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8ga2VlcCBjYWxsYmFjayBpbiB3cmFwcGVkIGZ1bmN0aW9uIHNvIHdlIGNhblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVzZSBpdCBpbiBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmcgdG8gcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIG5hdGl2ZSBvbmUuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXR0YWNoT3JpZ2luVG9QYXRjaGVkKHRoaXNbb3JpZ2luYWxJbnN0YW5jZUtleV1bcHJvcF0sIGZuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNbb3JpZ2luYWxJbnN0YW5jZUtleV1bcHJvcF0gPSBmbjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpc1tvcmlnaW5hbEluc3RhbmNlS2V5XVtwcm9wXTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkocHJvcCk7XG4gICAgfVxuICAgIGZvciAocHJvcCBpbiBPcmlnaW5hbENsYXNzKSB7XG4gICAgICAgIGlmIChwcm9wICE9PSAncHJvdG90eXBlJyAmJiBPcmlnaW5hbENsYXNzLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgICAgICBfZ2xvYmFsW2NsYXNzTmFtZV1bcHJvcF0gPSBPcmlnaW5hbENsYXNzW3Byb3BdO1xuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gcGF0Y2hNZXRob2QodGFyZ2V0LCBuYW1lLCBwYXRjaEZuKSB7XG4gICAgbGV0IHByb3RvID0gdGFyZ2V0O1xuICAgIHdoaWxlIChwcm90byAmJiAhcHJvdG8uaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgcHJvdG8gPSBPYmplY3RHZXRQcm90b3R5cGVPZihwcm90byk7XG4gICAgfVxuICAgIGlmICghcHJvdG8gJiYgdGFyZ2V0W25hbWVdKSB7XG4gICAgICAgIC8vIHNvbWVob3cgd2UgZGlkIG5vdCBmaW5kIGl0LCBidXQgd2UgY2FuIHNlZSBpdC4gVGhpcyBoYXBwZW5zIG9uIElFIGZvciBXaW5kb3cgcHJvcGVydGllcy5cbiAgICAgICAgcHJvdG8gPSB0YXJnZXQ7XG4gICAgfVxuICAgIGNvbnN0IGRlbGVnYXRlTmFtZSA9IHpvbmVTeW1ib2wobmFtZSk7XG4gICAgbGV0IGRlbGVnYXRlID0gbnVsbDtcbiAgICBpZiAocHJvdG8gJiYgKCEoZGVsZWdhdGUgPSBwcm90b1tkZWxlZ2F0ZU5hbWVdKSB8fCAhcHJvdG8uaGFzT3duUHJvcGVydHkoZGVsZWdhdGVOYW1lKSkpIHtcbiAgICAgICAgZGVsZWdhdGUgPSBwcm90b1tkZWxlZ2F0ZU5hbWVdID0gcHJvdG9bbmFtZV07XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgcHJvdG9bbmFtZV0gaXMgd3JpdGFibGVcbiAgICAgICAgLy8gc29tZSBwcm9wZXJ0eSBpcyByZWFkb25seSBpbiBzYWZhcmksIHN1Y2ggYXMgSHRtbENhbnZhc0VsZW1lbnQucHJvdG90eXBlLnRvQmxvYlxuICAgICAgICBjb25zdCBkZXNjID0gcHJvdG8gJiYgT2JqZWN0R2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHByb3RvLCBuYW1lKTtcbiAgICAgICAgaWYgKGlzUHJvcGVydHlXcml0YWJsZShkZXNjKSkge1xuICAgICAgICAgICAgY29uc3QgcGF0Y2hEZWxlZ2F0ZSA9IHBhdGNoRm4oZGVsZWdhdGUsIGRlbGVnYXRlTmFtZSwgbmFtZSk7XG4gICAgICAgICAgICBwcm90b1tuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGF0Y2hEZWxlZ2F0ZSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGF0dGFjaE9yaWdpblRvUGF0Y2hlZChwcm90b1tuYW1lXSwgZGVsZWdhdGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkZWxlZ2F0ZTtcbn1cbi8vIFRPRE86IEBKaWFMaVBhc3Npb24sIHN1cHBvcnQgY2FuY2VsIHRhc2sgbGF0ZXIgaWYgbmVjZXNzYXJ5XG5mdW5jdGlvbiBwYXRjaE1hY3JvVGFzayhvYmosIGZ1bmNOYW1lLCBtZXRhQ3JlYXRvcikge1xuICAgIGxldCBzZXROYXRpdmUgPSBudWxsO1xuICAgIGZ1bmN0aW9uIHNjaGVkdWxlVGFzayh0YXNrKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB0YXNrLmRhdGE7XG4gICAgICAgIGRhdGEuYXJnc1tkYXRhLmNiSWR4XSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRhc2suaW52b2tlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgICAgIHNldE5hdGl2ZS5hcHBseShkYXRhLnRhcmdldCwgZGF0YS5hcmdzKTtcbiAgICAgICAgcmV0dXJuIHRhc2s7XG4gICAgfVxuICAgIHNldE5hdGl2ZSA9IHBhdGNoTWV0aG9kKG9iaiwgZnVuY05hbWUsIChkZWxlZ2F0ZSkgPT4gZnVuY3Rpb24gKHNlbGYsIGFyZ3MpIHtcbiAgICAgICAgY29uc3QgbWV0YSA9IG1ldGFDcmVhdG9yKHNlbGYsIGFyZ3MpO1xuICAgICAgICBpZiAobWV0YS5jYklkeCA+PSAwICYmIHR5cGVvZiBhcmdzW21ldGEuY2JJZHhdID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gc2NoZWR1bGVNYWNyb1Rhc2tXaXRoQ3VycmVudFpvbmUobWV0YS5uYW1lLCBhcmdzW21ldGEuY2JJZHhdLCBtZXRhLCBzY2hlZHVsZVRhc2spO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gY2F1c2UgYW4gZXJyb3IgYnkgY2FsbGluZyBpdCBkaXJlY3RseS5cbiAgICAgICAgICAgIHJldHVybiBkZWxlZ2F0ZS5hcHBseShzZWxmLCBhcmdzKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuZnVuY3Rpb24gYXR0YWNoT3JpZ2luVG9QYXRjaGVkKHBhdGNoZWQsIG9yaWdpbmFsKSB7XG4gICAgcGF0Y2hlZFt6b25lU3ltYm9sKCdPcmlnaW5hbERlbGVnYXRlJyldID0gb3JpZ2luYWw7XG59XG5sZXQgaXNEZXRlY3RlZElFT3JFZGdlID0gZmFsc2U7XG5sZXQgaWVPckVkZ2UgPSBmYWxzZTtcbmZ1bmN0aW9uIGlzSUVPckVkZ2UoKSB7XG4gICAgaWYgKGlzRGV0ZWN0ZWRJRU9yRWRnZSkge1xuICAgICAgICByZXR1cm4gaWVPckVkZ2U7XG4gICAgfVxuICAgIGlzRGV0ZWN0ZWRJRU9yRWRnZSA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdWEgPSBpbnRlcm5hbFdpbmRvdy5uYXZpZ2F0b3IudXNlckFnZW50O1xuICAgICAgICBpZiAodWEuaW5kZXhPZignTVNJRSAnKSAhPT0gLTEgfHwgdWEuaW5kZXhPZignVHJpZGVudC8nKSAhPT0gLTEgfHwgdWEuaW5kZXhPZignRWRnZS8nKSAhPT0gLTEpIHtcbiAgICAgICAgICAgIGllT3JFZGdlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHsgfVxuICAgIHJldHVybiBpZU9yRWRnZTtcbn1cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nO1xufVxuZnVuY3Rpb24gaXNOdW1iZXIodmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJztcbn1cblxuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKiBAc3VwcHJlc3Mge21pc3NpbmdSZXF1aXJlfVxuICovXG4vLyBhbiBpZGVudGlmaWVyIHRvIHRlbGwgWm9uZVRhc2sgZG8gbm90IGNyZWF0ZSBhIG5ldyBpbnZva2UgY2xvc3VyZVxuY29uc3QgT1BUSU1JWkVEX1pPTkVfRVZFTlRfVEFTS19EQVRBID0ge1xuICAgIHVzZUc6IHRydWUsXG59O1xuY29uc3Qgem9uZVN5bWJvbEV2ZW50TmFtZXMgPSB7fTtcbmNvbnN0IGdsb2JhbFNvdXJjZXMgPSB7fTtcbmNvbnN0IEVWRU5UX05BTUVfU1lNQk9MX1JFR1ggPSBuZXcgUmVnRXhwKCdeJyArIFpPTkVfU1lNQk9MX1BSRUZJWCArICcoXFxcXHcrKSh0cnVlfGZhbHNlKSQnKTtcbmNvbnN0IElNTUVESUFURV9QUk9QQUdBVElPTl9TWU1CT0wgPSB6b25lU3ltYm9sKCdwcm9wYWdhdGlvblN0b3BwZWQnKTtcbmZ1bmN0aW9uIHByZXBhcmVFdmVudE5hbWVzKGV2ZW50TmFtZSwgZXZlbnROYW1lVG9TdHJpbmcpIHtcbiAgICBjb25zdCBmYWxzZUV2ZW50TmFtZSA9IChldmVudE5hbWVUb1N0cmluZyA/IGV2ZW50TmFtZVRvU3RyaW5nKGV2ZW50TmFtZSkgOiBldmVudE5hbWUpICsgRkFMU0VfU1RSO1xuICAgIGNvbnN0IHRydWVFdmVudE5hbWUgPSAoZXZlbnROYW1lVG9TdHJpbmcgPyBldmVudE5hbWVUb1N0cmluZyhldmVudE5hbWUpIDogZXZlbnROYW1lKSArIFRSVUVfU1RSO1xuICAgIGNvbnN0IHN5bWJvbCA9IFpPTkVfU1lNQk9MX1BSRUZJWCArIGZhbHNlRXZlbnROYW1lO1xuICAgIGNvbnN0IHN5bWJvbENhcHR1cmUgPSBaT05FX1NZTUJPTF9QUkVGSVggKyB0cnVlRXZlbnROYW1lO1xuICAgIHpvbmVTeW1ib2xFdmVudE5hbWVzW2V2ZW50TmFtZV0gPSB7fTtcbiAgICB6b25lU3ltYm9sRXZlbnROYW1lc1tldmVudE5hbWVdW0ZBTFNFX1NUUl0gPSBzeW1ib2w7XG4gICAgem9uZVN5bWJvbEV2ZW50TmFtZXNbZXZlbnROYW1lXVtUUlVFX1NUUl0gPSBzeW1ib2xDYXB0dXJlO1xufVxuZnVuY3Rpb24gcGF0Y2hFdmVudFRhcmdldChfZ2xvYmFsLCBhcGksIGFwaXMsIHBhdGNoT3B0aW9ucykge1xuICAgIGNvbnN0IEFERF9FVkVOVF9MSVNURU5FUiA9IChwYXRjaE9wdGlvbnMgJiYgcGF0Y2hPcHRpb25zLmFkZCkgfHwgQUREX0VWRU5UX0xJU1RFTkVSX1NUUjtcbiAgICBjb25zdCBSRU1PVkVfRVZFTlRfTElTVEVORVIgPSAocGF0Y2hPcHRpb25zICYmIHBhdGNoT3B0aW9ucy5ybSkgfHwgUkVNT1ZFX0VWRU5UX0xJU1RFTkVSX1NUUjtcbiAgICBjb25zdCBMSVNURU5FUlNfRVZFTlRfTElTVEVORVIgPSAocGF0Y2hPcHRpb25zICYmIHBhdGNoT3B0aW9ucy5saXN0ZW5lcnMpIHx8ICdldmVudExpc3RlbmVycyc7XG4gICAgY29uc3QgUkVNT1ZFX0FMTF9MSVNURU5FUlNfRVZFTlRfTElTVEVORVIgPSAocGF0Y2hPcHRpb25zICYmIHBhdGNoT3B0aW9ucy5ybUFsbCkgfHwgJ3JlbW92ZUFsbExpc3RlbmVycyc7XG4gICAgY29uc3Qgem9uZVN5bWJvbEFkZEV2ZW50TGlzdGVuZXIgPSB6b25lU3ltYm9sKEFERF9FVkVOVF9MSVNURU5FUik7XG4gICAgY29uc3QgQUREX0VWRU5UX0xJU1RFTkVSX1NPVVJDRSA9ICcuJyArIEFERF9FVkVOVF9MSVNURU5FUiArICc6JztcbiAgICBjb25zdCBQUkVQRU5EX0VWRU5UX0xJU1RFTkVSID0gJ3ByZXBlbmRMaXN0ZW5lcic7XG4gICAgY29uc3QgUFJFUEVORF9FVkVOVF9MSVNURU5FUl9TT1VSQ0UgPSAnLicgKyBQUkVQRU5EX0VWRU5UX0xJU1RFTkVSICsgJzonO1xuICAgIGNvbnN0IGludm9rZVRhc2sgPSBmdW5jdGlvbiAodGFzaywgdGFyZ2V0LCBldmVudCkge1xuICAgICAgICAvLyBmb3IgYmV0dGVyIHBlcmZvcm1hbmNlLCBjaGVjayBpc1JlbW92ZWQgd2hpY2ggaXMgc2V0XG4gICAgICAgIC8vIGJ5IHJlbW92ZUV2ZW50TGlzdGVuZXJcbiAgICAgICAgaWYgKHRhc2suaXNSZW1vdmVkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVsZWdhdGUgPSB0YXNrLmNhbGxiYWNrO1xuICAgICAgICBpZiAodHlwZW9mIGRlbGVnYXRlID09PSAnb2JqZWN0JyAmJiBkZWxlZ2F0ZS5oYW5kbGVFdmVudCkge1xuICAgICAgICAgICAgLy8gY3JlYXRlIHRoZSBiaW5kIHZlcnNpb24gb2YgaGFuZGxlRXZlbnQgd2hlbiBpbnZva2VcbiAgICAgICAgICAgIHRhc2suY2FsbGJhY2sgPSAoZXZlbnQpID0+IGRlbGVnYXRlLmhhbmRsZUV2ZW50KGV2ZW50KTtcbiAgICAgICAgICAgIHRhc2sub3JpZ2luYWxEZWxlZ2F0ZSA9IGRlbGVnYXRlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGludm9rZSBzdGF0aWMgdGFzay5pbnZva2VcbiAgICAgICAgLy8gbmVlZCB0byB0cnkvY2F0Y2ggZXJyb3IgaGVyZSwgb3RoZXJ3aXNlLCB0aGUgZXJyb3IgaW4gb25lIGV2ZW50IGxpc3RlbmVyXG4gICAgICAgIC8vIHdpbGwgYnJlYWsgdGhlIGV4ZWN1dGlvbnMgb2YgdGhlIG90aGVyIGV2ZW50IGxpc3RlbmVycy4gQWxzbyBlcnJvciB3aWxsXG4gICAgICAgIC8vIG5vdCByZW1vdmUgdGhlIGV2ZW50IGxpc3RlbmVyIHdoZW4gYG9uY2VgIG9wdGlvbnMgaXMgdHJ1ZS5cbiAgICAgICAgbGV0IGVycm9yO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGFzay5pbnZva2UodGFzaywgdGFyZ2V0LCBbZXZlbnRdKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvcHRpb25zID0gdGFzay5vcHRpb25zO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucy5vbmNlKSB7XG4gICAgICAgICAgICAvLyBpZiBvcHRpb25zLm9uY2UgaXMgdHJ1ZSwgYWZ0ZXIgaW52b2tlIG9uY2UgcmVtb3ZlIGxpc3RlbmVyIGhlcmVcbiAgICAgICAgICAgIC8vIG9ubHkgYnJvd3NlciBuZWVkIHRvIGRvIHRoaXMsIG5vZGVqcyBldmVudEVtaXR0ZXIgd2lsbCBjYWwgcmVtb3ZlTGlzdGVuZXJcbiAgICAgICAgICAgIC8vIGluc2lkZSBFdmVudEVtaXR0ZXIub25jZVxuICAgICAgICAgICAgY29uc3QgZGVsZWdhdGUgPSB0YXNrLm9yaWdpbmFsRGVsZWdhdGUgPyB0YXNrLm9yaWdpbmFsRGVsZWdhdGUgOiB0YXNrLmNhbGxiYWNrO1xuICAgICAgICAgICAgdGFyZ2V0W1JFTU9WRV9FVkVOVF9MSVNURU5FUl0uY2FsbCh0YXJnZXQsIGV2ZW50LnR5cGUsIGRlbGVnYXRlLCBvcHRpb25zKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZXJyb3I7XG4gICAgfTtcbiAgICBmdW5jdGlvbiBnbG9iYWxDYWxsYmFjayhjb250ZXh0LCBldmVudCwgaXNDYXB0dXJlKSB7XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL3pvbmUuanMvaXNzdWVzLzkxMSwgaW4gSUUsIHNvbWV0aW1lc1xuICAgICAgICAvLyBldmVudCB3aWxsIGJlIHVuZGVmaW5lZCwgc28gd2UgbmVlZCB0byB1c2Ugd2luZG93LmV2ZW50XG4gICAgICAgIGV2ZW50ID0gZXZlbnQgfHwgX2dsb2JhbC5ldmVudDtcbiAgICAgICAgaWYgKCFldmVudCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIGV2ZW50LnRhcmdldCBpcyBuZWVkZWQgZm9yIFNhbXN1bmcgVFYgYW5kIFNvdXJjZUJ1ZmZlclxuICAgICAgICAvLyB8fCBnbG9iYWwgaXMgbmVlZGVkIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL3pvbmUuanMvaXNzdWVzLzE5MFxuICAgICAgICBjb25zdCB0YXJnZXQgPSBjb250ZXh0IHx8IGV2ZW50LnRhcmdldCB8fCBfZ2xvYmFsO1xuICAgICAgICBjb25zdCB0YXNrcyA9IHRhcmdldFt6b25lU3ltYm9sRXZlbnROYW1lc1tldmVudC50eXBlXVtpc0NhcHR1cmUgPyBUUlVFX1NUUiA6IEZBTFNFX1NUUl1dO1xuICAgICAgICBpZiAodGFza3MpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9ycyA9IFtdO1xuICAgICAgICAgICAgLy8gaW52b2tlIGFsbCB0YXNrcyB3aGljaCBhdHRhY2hlZCB0byBjdXJyZW50IHRhcmdldCB3aXRoIGdpdmVuIGV2ZW50LnR5cGUgYW5kIGNhcHR1cmUgPSBmYWxzZVxuICAgICAgICAgICAgLy8gZm9yIHBlcmZvcm1hbmNlIGNvbmNlcm4sIGlmIHRhc2subGVuZ3RoID09PSAxLCBqdXN0IGludm9rZVxuICAgICAgICAgICAgaWYgKHRhc2tzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IGludm9rZVRhc2sodGFza3NbMF0sIHRhcmdldCwgZXZlbnQpO1xuICAgICAgICAgICAgICAgIGVyciAmJiBlcnJvcnMucHVzaChlcnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvem9uZS5qcy9pc3N1ZXMvODM2XG4gICAgICAgICAgICAgICAgLy8gY29weSB0aGUgdGFza3MgYXJyYXkgYmVmb3JlIGludm9rZSwgdG8gYXZvaWRcbiAgICAgICAgICAgICAgICAvLyB0aGUgY2FsbGJhY2sgd2lsbCByZW1vdmUgaXRzZWxmIG9yIG90aGVyIGxpc3RlbmVyXG4gICAgICAgICAgICAgICAgY29uc3QgY29weVRhc2tzID0gdGFza3Muc2xpY2UoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvcHlUYXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQgJiYgZXZlbnRbSU1NRURJQVRFX1BST1BBR0FUSU9OX1NZTUJPTF0gPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IGludm9rZVRhc2soY29weVRhc2tzW2ldLCB0YXJnZXQsIGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgZXJyICYmIGVycm9ycy5wdXNoKGVycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU2luY2UgdGhlcmUgaXMgb25seSBvbmUgZXJyb3IsIHdlIGRvbid0IG5lZWQgdG8gc2NoZWR1bGUgbWljcm9UYXNrXG4gICAgICAgICAgICAvLyB0byB0aHJvdyB0aGUgZXJyb3IuXG4gICAgICAgICAgICBpZiAoZXJyb3JzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycm9yc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZXJyb3JzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVyciA9IGVycm9yc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgYXBpLm5hdGl2ZVNjaGVkdWxlTWljcm9UYXNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8vIGdsb2JhbCBzaGFyZWQgem9uZUF3YXJlQ2FsbGJhY2sgdG8gaGFuZGxlIGFsbCBldmVudCBjYWxsYmFjayB3aXRoIGNhcHR1cmUgPSBmYWxzZVxuICAgIGNvbnN0IGdsb2JhbFpvbmVBd2FyZUNhbGxiYWNrID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIHJldHVybiBnbG9iYWxDYWxsYmFjayh0aGlzLCBldmVudCwgZmFsc2UpO1xuICAgIH07XG4gICAgLy8gZ2xvYmFsIHNoYXJlZCB6b25lQXdhcmVDYWxsYmFjayB0byBoYW5kbGUgYWxsIGV2ZW50IGNhbGxiYWNrIHdpdGggY2FwdHVyZSA9IHRydWVcbiAgICBjb25zdCBnbG9iYWxab25lQXdhcmVDYXB0dXJlQ2FsbGJhY2sgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgcmV0dXJuIGdsb2JhbENhbGxiYWNrKHRoaXMsIGV2ZW50LCB0cnVlKTtcbiAgICB9O1xuICAgIGZ1bmN0aW9uIHBhdGNoRXZlbnRUYXJnZXRNZXRob2RzKG9iaiwgcGF0Y2hPcHRpb25zKSB7XG4gICAgICAgIGlmICghb2JqKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IHVzZUdsb2JhbENhbGxiYWNrID0gdHJ1ZTtcbiAgICAgICAgaWYgKHBhdGNoT3B0aW9ucyAmJiBwYXRjaE9wdGlvbnMudXNlRyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB1c2VHbG9iYWxDYWxsYmFjayA9IHBhdGNoT3B0aW9ucy51c2VHO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZhbGlkYXRlSGFuZGxlciA9IHBhdGNoT3B0aW9ucyAmJiBwYXRjaE9wdGlvbnMudmg7XG4gICAgICAgIGxldCBjaGVja0R1cGxpY2F0ZSA9IHRydWU7XG4gICAgICAgIGlmIChwYXRjaE9wdGlvbnMgJiYgcGF0Y2hPcHRpb25zLmNoa0R1cCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjaGVja0R1cGxpY2F0ZSA9IHBhdGNoT3B0aW9ucy5jaGtEdXA7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IHJldHVyblRhcmdldCA9IGZhbHNlO1xuICAgICAgICBpZiAocGF0Y2hPcHRpb25zICYmIHBhdGNoT3B0aW9ucy5ydCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm5UYXJnZXQgPSBwYXRjaE9wdGlvbnMucnQ7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IHByb3RvID0gb2JqO1xuICAgICAgICB3aGlsZSAocHJvdG8gJiYgIXByb3RvLmhhc093blByb3BlcnR5KEFERF9FVkVOVF9MSVNURU5FUikpIHtcbiAgICAgICAgICAgIHByb3RvID0gT2JqZWN0R2V0UHJvdG90eXBlT2YocHJvdG8pO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcHJvdG8gJiYgb2JqW0FERF9FVkVOVF9MSVNURU5FUl0pIHtcbiAgICAgICAgICAgIC8vIHNvbWVob3cgd2UgZGlkIG5vdCBmaW5kIGl0LCBidXQgd2UgY2FuIHNlZSBpdC4gVGhpcyBoYXBwZW5zIG9uIElFIGZvciBXaW5kb3cgcHJvcGVydGllcy5cbiAgICAgICAgICAgIHByb3RvID0gb2JqO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcHJvdG8pIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocHJvdG9bem9uZVN5bWJvbEFkZEV2ZW50TGlzdGVuZXJdKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZXZlbnROYW1lVG9TdHJpbmcgPSBwYXRjaE9wdGlvbnMgJiYgcGF0Y2hPcHRpb25zLmV2ZW50TmFtZVRvU3RyaW5nO1xuICAgICAgICAvLyBXZSB1c2UgYSBzaGFyZWQgZ2xvYmFsIGB0YXNrRGF0YWAgdG8gcGFzcyBkYXRhIGZvciBgc2NoZWR1bGVFdmVudFRhc2tgLFxuICAgICAgICAvLyBlbGltaW5hdGluZyB0aGUgbmVlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IHNvbGVseSBmb3IgcGFzc2luZyBkYXRhLlxuICAgICAgICAvLyBXQVJOSU5HOiBUaGlzIG9iamVjdCBoYXMgYSBzdGF0aWMgbGlmZXRpbWUsIG1lYW5pbmcgaXQgaXMgbm90IGNyZWF0ZWRcbiAgICAgICAgLy8gZWFjaCB0aW1lIGBhZGRFdmVudExpc3RlbmVyYCBpcyBjYWxsZWQuIEl0IGlzIGluc3RhbnRpYXRlZCBvbmx5IG9uY2VcbiAgICAgICAgLy8gYW5kIGNhcHR1cmVkIGJ5IHJlZmVyZW5jZSBpbnNpZGUgdGhlIGBhZGRFdmVudExpc3RlbmVyYCBhbmRcbiAgICAgICAgLy8gYHJlbW92ZUV2ZW50TGlzdGVuZXJgIGZ1bmN0aW9ucy4gRG8gbm90IGFkZCBhbnkgbmV3IHByb3BlcnRpZXMgdG8gdGhpc1xuICAgICAgICAvLyBvYmplY3QsIGFzIGRvaW5nIHNvIHdvdWxkIG5lY2Vzc2l0YXRlIG1haW50YWluaW5nIHRoZSBpbmZvcm1hdGlvblxuICAgICAgICAvLyBiZXR3ZWVuIGBhZGRFdmVudExpc3RlbmVyYCBjYWxscy5cbiAgICAgICAgY29uc3QgdGFza0RhdGEgPSB7fTtcbiAgICAgICAgY29uc3QgbmF0aXZlQWRkRXZlbnRMaXN0ZW5lciA9IChwcm90b1t6b25lU3ltYm9sQWRkRXZlbnRMaXN0ZW5lcl0gPSBwcm90b1tBRERfRVZFTlRfTElTVEVORVJdKTtcbiAgICAgICAgY29uc3QgbmF0aXZlUmVtb3ZlRXZlbnRMaXN0ZW5lciA9IChwcm90b1t6b25lU3ltYm9sKFJFTU9WRV9FVkVOVF9MSVNURU5FUildID1cbiAgICAgICAgICAgIHByb3RvW1JFTU9WRV9FVkVOVF9MSVNURU5FUl0pO1xuICAgICAgICBjb25zdCBuYXRpdmVMaXN0ZW5lcnMgPSAocHJvdG9bem9uZVN5bWJvbChMSVNURU5FUlNfRVZFTlRfTElTVEVORVIpXSA9XG4gICAgICAgICAgICBwcm90b1tMSVNURU5FUlNfRVZFTlRfTElTVEVORVJdKTtcbiAgICAgICAgY29uc3QgbmF0aXZlUmVtb3ZlQWxsTGlzdGVuZXJzID0gKHByb3RvW3pvbmVTeW1ib2woUkVNT1ZFX0FMTF9MSVNURU5FUlNfRVZFTlRfTElTVEVORVIpXSA9XG4gICAgICAgICAgICBwcm90b1tSRU1PVkVfQUxMX0xJU1RFTkVSU19FVkVOVF9MSVNURU5FUl0pO1xuICAgICAgICBsZXQgbmF0aXZlUHJlcGVuZEV2ZW50TGlzdGVuZXI7XG4gICAgICAgIGlmIChwYXRjaE9wdGlvbnMgJiYgcGF0Y2hPcHRpb25zLnByZXBlbmQpIHtcbiAgICAgICAgICAgIG5hdGl2ZVByZXBlbmRFdmVudExpc3RlbmVyID0gcHJvdG9bem9uZVN5bWJvbChwYXRjaE9wdGlvbnMucHJlcGVuZCldID1cbiAgICAgICAgICAgICAgICBwcm90b1twYXRjaE9wdGlvbnMucHJlcGVuZF07XG4gICAgICAgIH1cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoaXMgdXRpbCBmdW5jdGlvbiB3aWxsIGJ1aWxkIGFuIG9wdGlvbiBvYmplY3Qgd2l0aCBwYXNzaXZlIG9wdGlvblxuICAgICAgICAgKiB0byBoYW5kbGUgYWxsIHBvc3NpYmxlIGlucHV0IGZyb20gdGhlIHVzZXIuXG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiBidWlsZEV2ZW50TGlzdGVuZXJPcHRpb25zKG9wdGlvbnMsIHBhc3NpdmUpIHtcbiAgICAgICAgICAgIGlmICghcGFzc2l2ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvcHRpb25zO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjYXB0dXJlOiBvcHRpb25zLCBwYXNzaXZlOiB0cnVlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBwYXNzaXZlOiB0cnVlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnICYmIG9wdGlvbnMucGFzc2l2ZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyAuLi5vcHRpb25zLCBwYXNzaXZlOiB0cnVlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb3B0aW9ucztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjdXN0b21TY2hlZHVsZUdsb2JhbCA9IGZ1bmN0aW9uICh0YXNrKSB7XG4gICAgICAgICAgICAvLyBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgdGFzayBmb3IgdGhlIGV2ZW50TmFtZSArIGNhcHR1cmUsXG4gICAgICAgICAgICAvLyBqdXN0IHJldHVybiwgYmVjYXVzZSB3ZSB1c2UgdGhlIHNoYXJlZCBnbG9iYWxab25lQXdhcmVDYWxsYmFjayBoZXJlLlxuICAgICAgICAgICAgaWYgKHRhc2tEYXRhLmlzRXhpc3RpbmcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmF0aXZlQWRkRXZlbnRMaXN0ZW5lci5jYWxsKHRhc2tEYXRhLnRhcmdldCwgdGFza0RhdGEuZXZlbnROYW1lLCB0YXNrRGF0YS5jYXB0dXJlID8gZ2xvYmFsWm9uZUF3YXJlQ2FwdHVyZUNhbGxiYWNrIDogZ2xvYmFsWm9uZUF3YXJlQ2FsbGJhY2ssIHRhc2tEYXRhLm9wdGlvbnMpO1xuICAgICAgICB9O1xuICAgICAgICAvKipcbiAgICAgICAgICogSW4gdGhlIGNvbnRleHQgb2YgZXZlbnRzIGFuZCBsaXN0ZW5lcnMsIHRoaXMgZnVuY3Rpb24gd2lsbCBiZVxuICAgICAgICAgKiBjYWxsZWQgYXQgdGhlIGVuZCBieSBgY2FuY2VsVGFza2AsIHdoaWNoLCBpbiB0dXJuLCBjYWxscyBgdGFzay5jYW5jZWxGbmAuXG4gICAgICAgICAqIENhbmNlbGxpbmcgYSB0YXNrIGlzIHByaW1hcmlseSB1c2VkIHRvIHJlbW92ZSBldmVudCBsaXN0ZW5lcnMgZnJvbVxuICAgICAgICAgKiB0aGUgdGFzayB0YXJnZXQuXG4gICAgICAgICAqL1xuICAgICAgICBjb25zdCBjdXN0b21DYW5jZWxHbG9iYWwgPSBmdW5jdGlvbiAodGFzaykge1xuICAgICAgICAgICAgLy8gaWYgdGFzayBpcyBub3QgbWFya2VkIGFzIGlzUmVtb3ZlZCwgdGhpcyBjYWxsIGlzIGRpcmVjdGx5XG4gICAgICAgICAgICAvLyBmcm9tIFpvbmUucHJvdG90eXBlLmNhbmNlbFRhc2ssIHdlIHNob3VsZCByZW1vdmUgdGhlIHRhc2tcbiAgICAgICAgICAgIC8vIGZyb20gdGFza3NMaXN0IG9mIHRhcmdldCBmaXJzdFxuICAgICAgICAgICAgaWYgKCF0YXNrLmlzUmVtb3ZlZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN5bWJvbEV2ZW50TmFtZXMgPSB6b25lU3ltYm9sRXZlbnROYW1lc1t0YXNrLmV2ZW50TmFtZV07XG4gICAgICAgICAgICAgICAgbGV0IHN5bWJvbEV2ZW50TmFtZTtcbiAgICAgICAgICAgICAgICBpZiAoc3ltYm9sRXZlbnROYW1lcykge1xuICAgICAgICAgICAgICAgICAgICBzeW1ib2xFdmVudE5hbWUgPSBzeW1ib2xFdmVudE5hbWVzW3Rhc2suY2FwdHVyZSA/IFRSVUVfU1RSIDogRkFMU0VfU1RSXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdUYXNrcyA9IHN5bWJvbEV2ZW50TmFtZSAmJiB0YXNrLnRhcmdldFtzeW1ib2xFdmVudE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Rhc2tzKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZXhpc3RpbmdUYXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdUYXNrID0gZXhpc3RpbmdUYXNrc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Rhc2sgPT09IHRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Rhc2tzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBzZXQgaXNSZW1vdmVkIHRvIGRhdGEgZm9yIGZhc3RlciBpbnZva2VUYXNrIGNoZWNrXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFzay5pc1JlbW92ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXNrLnJlbW92ZUFib3J0TGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFzay5yZW1vdmVBYm9ydExpc3RlbmVyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhc2sucmVtb3ZlQWJvcnRMaXN0ZW5lciA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Rhc2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhbGwgdGFza3MgZm9yIHRoZSBldmVudE5hbWUgKyBjYXB0dXJlIGhhdmUgZ29uZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGdsb2JhbFpvbmVBd2FyZUNhbGxiYWNrIGFuZCByZW1vdmUgdGhlIHRhc2sgY2FjaGUgZnJvbSB0YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFzay5hbGxSZW1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFzay50YXJnZXRbc3ltYm9sRXZlbnROYW1lXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gaWYgYWxsIHRhc2tzIGZvciB0aGUgZXZlbnROYW1lICsgY2FwdHVyZSBoYXZlIGdvbmUsXG4gICAgICAgICAgICAvLyB3ZSB3aWxsIHJlYWxseSByZW1vdmUgdGhlIGdsb2JhbCBldmVudCBjYWxsYmFjayxcbiAgICAgICAgICAgIC8vIGlmIG5vdCwgcmV0dXJuXG4gICAgICAgICAgICBpZiAoIXRhc2suYWxsUmVtb3ZlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBuYXRpdmVSZW1vdmVFdmVudExpc3RlbmVyLmNhbGwodGFzay50YXJnZXQsIHRhc2suZXZlbnROYW1lLCB0YXNrLmNhcHR1cmUgPyBnbG9iYWxab25lQXdhcmVDYXB0dXJlQ2FsbGJhY2sgOiBnbG9iYWxab25lQXdhcmVDYWxsYmFjaywgdGFzay5vcHRpb25zKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY3VzdG9tU2NoZWR1bGVOb25HbG9iYWwgPSBmdW5jdGlvbiAodGFzaykge1xuICAgICAgICAgICAgcmV0dXJuIG5hdGl2ZUFkZEV2ZW50TGlzdGVuZXIuY2FsbCh0YXNrRGF0YS50YXJnZXQsIHRhc2tEYXRhLmV2ZW50TmFtZSwgdGFzay5pbnZva2UsIHRhc2tEYXRhLm9wdGlvbnMpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBjdXN0b21TY2hlZHVsZVByZXBlbmQgPSBmdW5jdGlvbiAodGFzaykge1xuICAgICAgICAgICAgcmV0dXJuIG5hdGl2ZVByZXBlbmRFdmVudExpc3RlbmVyLmNhbGwodGFza0RhdGEudGFyZ2V0LCB0YXNrRGF0YS5ldmVudE5hbWUsIHRhc2suaW52b2tlLCB0YXNrRGF0YS5vcHRpb25zKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY3VzdG9tQ2FuY2VsTm9uR2xvYmFsID0gZnVuY3Rpb24gKHRhc2spIHtcbiAgICAgICAgICAgIHJldHVybiBuYXRpdmVSZW1vdmVFdmVudExpc3RlbmVyLmNhbGwodGFzay50YXJnZXQsIHRhc2suZXZlbnROYW1lLCB0YXNrLmludm9rZSwgdGFzay5vcHRpb25zKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY3VzdG9tU2NoZWR1bGUgPSB1c2VHbG9iYWxDYWxsYmFjayA/IGN1c3RvbVNjaGVkdWxlR2xvYmFsIDogY3VzdG9tU2NoZWR1bGVOb25HbG9iYWw7XG4gICAgICAgIGNvbnN0IGN1c3RvbUNhbmNlbCA9IHVzZUdsb2JhbENhbGxiYWNrID8gY3VzdG9tQ2FuY2VsR2xvYmFsIDogY3VzdG9tQ2FuY2VsTm9uR2xvYmFsO1xuICAgICAgICBjb25zdCBjb21wYXJlVGFza0NhbGxiYWNrVnNEZWxlZ2F0ZSA9IGZ1bmN0aW9uICh0YXNrLCBkZWxlZ2F0ZSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZU9mRGVsZWdhdGUgPSB0eXBlb2YgZGVsZWdhdGU7XG4gICAgICAgICAgICByZXR1cm4gKCh0eXBlT2ZEZWxlZ2F0ZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0YXNrLmNhbGxiYWNrID09PSBkZWxlZ2F0ZSkgfHxcbiAgICAgICAgICAgICAgICAodHlwZU9mRGVsZWdhdGUgPT09ICdvYmplY3QnICYmIHRhc2sub3JpZ2luYWxEZWxlZ2F0ZSA9PT0gZGVsZWdhdGUpKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY29tcGFyZSA9IHBhdGNoT3B0aW9ucz8uZGlmZiB8fCBjb21wYXJlVGFza0NhbGxiYWNrVnNEZWxlZ2F0ZTtcbiAgICAgICAgY29uc3QgdW5wYXRjaGVkRXZlbnRzID0gWm9uZVt6b25lU3ltYm9sKCdVTlBBVENIRURfRVZFTlRTJyldO1xuICAgICAgICBjb25zdCBwYXNzaXZlRXZlbnRzID0gX2dsb2JhbFt6b25lU3ltYm9sKCdQQVNTSVZFX0VWRU5UUycpXTtcbiAgICAgICAgZnVuY3Rpb24gY29weUV2ZW50TGlzdGVuZXJPcHRpb25zKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgJiYgb3B0aW9ucyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gZGVzdHJ1Y3R1cmUgdGhlIHRhcmdldCBgb3B0aW9uc2Agb2JqZWN0IHNpbmNlIGl0IG1heVxuICAgICAgICAgICAgICAgIC8vIGJlIGZyb3plbiBvciBzZWFsZWQgKHBvc3NpYmx5IHByb3ZpZGVkIGltcGxpY2l0bHkgYnkgYSB0aGlyZC1wYXJ0eVxuICAgICAgICAgICAgICAgIC8vIGxpYnJhcnkpLCBvciBpdHMgcHJvcGVydGllcyBtYXkgYmUgcmVhZG9ubHkuXG4gICAgICAgICAgICAgICAgY29uc3QgbmV3T3B0aW9ucyA9IHsgLi4ub3B0aW9ucyB9O1xuICAgICAgICAgICAgICAgIC8vIFRoZSBgc2lnbmFsYCBvcHRpb24gd2FzIHJlY2VudGx5IGludHJvZHVjZWQsIHdoaWNoIGNhdXNlZCByZWdyZXNzaW9ucyBpblxuICAgICAgICAgICAgICAgIC8vIHRoaXJkLXBhcnR5IHNjZW5hcmlvcyB3aGVyZSBgQWJvcnRDb250cm9sbGVyYCB3YXMgZGlyZWN0bHkgcHJvdmlkZWQgdG9cbiAgICAgICAgICAgICAgICAvLyBgYWRkRXZlbnRMaXN0ZW5lcmAgYXMgb3B0aW9ucy4gRm9yIGluc3RhbmNlLCBpbiBjYXNlcyBsaWtlXG4gICAgICAgICAgICAgICAgLy8gYGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBjYWxsYmFjaywgYWJvcnRDb250cm9sbGVySW5zdGFuY2UpYCxcbiAgICAgICAgICAgICAgICAvLyB3aGljaCBpcyB2YWxpZCBiZWNhdXNlIGBBYm9ydENvbnRyb2xsZXJgIGluY2x1ZGVzIGEgYHNpZ25hbGAgZ2V0dGVyLCBzcHJlYWRpbmdcbiAgICAgICAgICAgICAgICAvLyBgey4uLm9wdGlvbnN9YCB3b3VsZG4ndCBjb3B5IHRoZSBgc2lnbmFsYC4gQWRkaXRpb25hbGx5LCB1c2luZyBgT2JqZWN0LmNyZWF0ZWBcbiAgICAgICAgICAgICAgICAvLyBpc24ndCBmZWFzaWJsZSBzaW5jZSBgQWJvcnRDb250cm9sbGVyYCBpcyBhIGJ1aWx0LWluIG9iamVjdCB0eXBlLCBhbmQgYXR0ZW1wdGluZ1xuICAgICAgICAgICAgICAgIC8vIHRvIGNyZWF0ZSBhIG5ldyBvYmplY3QgZGlyZWN0bHkgd2l0aCBpdCBhcyB0aGUgcHJvdG90eXBlIG1pZ2h0IHJlc3VsdCBpblxuICAgICAgICAgICAgICAgIC8vIHVuZXhwZWN0ZWQgYmVoYXZpb3IuXG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuc2lnbmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ld09wdGlvbnMuc2lnbmFsID0gb3B0aW9ucy5zaWduYWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXdPcHRpb25zO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbWFrZUFkZExpc3RlbmVyID0gZnVuY3Rpb24gKG5hdGl2ZUxpc3RlbmVyLCBhZGRTb3VyY2UsIGN1c3RvbVNjaGVkdWxlRm4sIGN1c3RvbUNhbmNlbEZuLCByZXR1cm5UYXJnZXQgPSBmYWxzZSwgcHJlcGVuZCA9IGZhbHNlKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMgfHwgX2dsb2JhbDtcbiAgICAgICAgICAgICAgICBsZXQgZXZlbnROYW1lID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgICAgIGlmIChwYXRjaE9wdGlvbnMgJiYgcGF0Y2hPcHRpb25zLnRyYW5zZmVyRXZlbnROYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50TmFtZSA9IHBhdGNoT3B0aW9ucy50cmFuc2ZlckV2ZW50TmFtZShldmVudE5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgZGVsZWdhdGUgPSBhcmd1bWVudHNbMV07XG4gICAgICAgICAgICAgICAgaWYgKCFkZWxlZ2F0ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmF0aXZlTGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGlzTm9kZSAmJiBldmVudE5hbWUgPT09ICd1bmNhdWdodEV4Y2VwdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZG9uJ3QgcGF0Y2ggdW5jYXVnaHRFeGNlcHRpb24gb2Ygbm9kZWpzIHRvIHByZXZlbnQgZW5kbGVzcyBsb29wXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuYXRpdmVMaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBUbyBpbXByb3ZlIGBhZGRFdmVudExpc3RlbmVyYCBwZXJmb3JtYW5jZSwgd2Ugd2lsbCBjcmVhdGUgdGhlIGNhbGxiYWNrXG4gICAgICAgICAgICAgICAgLy8gZm9yIHRoZSB0YXNrIGxhdGVyIHdoZW4gdGhlIHRhc2sgaXMgaW52b2tlZC5cbiAgICAgICAgICAgICAgICBsZXQgaXNFdmVudExpc3RlbmVyT2JqZWN0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkZWxlZ2F0ZSAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGNoZWNrcyB3aGV0aGVyIHRoZSBwcm92aWRlZCBsaXN0ZW5lciBhcmd1bWVudCBpcyBhbiBvYmplY3Qgd2l0aFxuICAgICAgICAgICAgICAgICAgICAvLyBhIGBoYW5kbGVFdmVudGAgbWV0aG9kIChzaW5jZSB3ZSBjYW4gY2FsbCBgYWRkRXZlbnRMaXN0ZW5lcmAgd2l0aCBhXG4gICAgICAgICAgICAgICAgICAgIC8vIGZ1bmN0aW9uIGBldmVudCA9PiAuLi5gIG9yIHdpdGggYW4gb2JqZWN0IGB7IGhhbmRsZUV2ZW50OiBldmVudCA9PiAuLi4gfWApLlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRlbGVnYXRlLmhhbmRsZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmF0aXZlTGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpc0V2ZW50TGlzdGVuZXJPYmplY3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsaWRhdGVIYW5kbGVyICYmICF2YWxpZGF0ZUhhbmRsZXIobmF0aXZlTGlzdGVuZXIsIGRlbGVnYXRlLCB0YXJnZXQsIGFyZ3VtZW50cykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXNzaXZlID0gISFwYXNzaXZlRXZlbnRzICYmIHBhc3NpdmVFdmVudHMuaW5kZXhPZihldmVudE5hbWUpICE9PSAtMTtcbiAgICAgICAgICAgICAgICBjb25zdCBvcHRpb25zID0gY29weUV2ZW50TGlzdGVuZXJPcHRpb25zKGJ1aWxkRXZlbnRMaXN0ZW5lck9wdGlvbnMoYXJndW1lbnRzWzJdLCBwYXNzaXZlKSk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2lnbmFsID0gb3B0aW9ucz8uc2lnbmFsO1xuICAgICAgICAgICAgICAgIGlmIChzaWduYWw/LmFib3J0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHNpZ25hbCBpcyBhbiBhYm9ydGVkIG9uZSwganVzdCByZXR1cm4gd2l0aG91dCBhdHRhY2hpbmcgdGhlIGV2ZW50IGxpc3RlbmVyLlxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh1bnBhdGNoZWRFdmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgdW5wYXRjaGVkIGxpc3RcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1bnBhdGNoZWRFdmVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChldmVudE5hbWUgPT09IHVucGF0Y2hlZEV2ZW50c1tpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwYXNzaXZlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuYXRpdmVMaXN0ZW5lci5jYWxsKHRhcmdldCwgZXZlbnROYW1lLCBkZWxlZ2F0ZSwgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmF0aXZlTGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgY2FwdHVyZSA9ICFvcHRpb25zID8gZmFsc2UgOiB0eXBlb2Ygb3B0aW9ucyA9PT0gJ2Jvb2xlYW4nID8gdHJ1ZSA6IG9wdGlvbnMuY2FwdHVyZTtcbiAgICAgICAgICAgICAgICBjb25zdCBvbmNlID0gb3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcgPyBvcHRpb25zLm9uY2UgOiBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb25zdCB6b25lID0gWm9uZS5jdXJyZW50O1xuICAgICAgICAgICAgICAgIGxldCBzeW1ib2xFdmVudE5hbWVzID0gem9uZVN5bWJvbEV2ZW50TmFtZXNbZXZlbnROYW1lXTtcbiAgICAgICAgICAgICAgICBpZiAoIXN5bWJvbEV2ZW50TmFtZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJlcGFyZUV2ZW50TmFtZXMoZXZlbnROYW1lLCBldmVudE5hbWVUb1N0cmluZyk7XG4gICAgICAgICAgICAgICAgICAgIHN5bWJvbEV2ZW50TmFtZXMgPSB6b25lU3ltYm9sRXZlbnROYW1lc1tldmVudE5hbWVdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBzeW1ib2xFdmVudE5hbWUgPSBzeW1ib2xFdmVudE5hbWVzW2NhcHR1cmUgPyBUUlVFX1NUUiA6IEZBTFNFX1NUUl07XG4gICAgICAgICAgICAgICAgbGV0IGV4aXN0aW5nVGFza3MgPSB0YXJnZXRbc3ltYm9sRXZlbnROYW1lXTtcbiAgICAgICAgICAgICAgICBsZXQgaXNFeGlzdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Rhc2tzKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFscmVhZHkgaGF2ZSB0YXNrIHJlZ2lzdGVyZWRcbiAgICAgICAgICAgICAgICAgICAgaXNFeGlzdGluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaGVja0R1cGxpY2F0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBleGlzdGluZ1Rhc2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBhcmUoZXhpc3RpbmdUYXNrc1tpXSwgZGVsZWdhdGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNhbWUgY2FsbGJhY2ssIHNhbWUgY2FwdHVyZSwgc2FtZSBldmVudCBuYW1lLCBqdXN0IHJldHVyblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Rhc2tzID0gdGFyZ2V0W3N5bWJvbEV2ZW50TmFtZV0gPSBbXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IHNvdXJjZTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25zdHJ1Y3Rvck5hbWUgPSB0YXJnZXQuY29uc3RydWN0b3JbJ25hbWUnXTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRTb3VyY2UgPSBnbG9iYWxTb3VyY2VzW2NvbnN0cnVjdG9yTmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFNvdXJjZSkge1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2UgPSB0YXJnZXRTb3VyY2VbZXZlbnROYW1lXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlID1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0cnVjdG9yTmFtZSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWRkU291cmNlICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoZXZlbnROYW1lVG9TdHJpbmcgPyBldmVudE5hbWVUb1N0cmluZyhldmVudE5hbWUpIDogZXZlbnROYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gSW4gdGhlIGNvZGUgYmVsb3csIGBvcHRpb25zYCBzaG91bGQgbm8gbG9uZ2VyIGJlIHJlYXNzaWduZWQ7IGluc3RlYWQsIGl0XG4gICAgICAgICAgICAgICAgLy8gc2hvdWxkIG9ubHkgYmUgbXV0YXRlZC4gVGhpcyBpcyBiZWNhdXNlIHdlIHBhc3MgdGhhdCBvYmplY3QgdG8gdGhlIG5hdGl2ZVxuICAgICAgICAgICAgICAgIC8vIGBhZGRFdmVudExpc3RlbmVyYC5cbiAgICAgICAgICAgICAgICAvLyBJdCdzIGdlbmVyYWxseSByZWNvbW1lbmRlZCB0byB1c2UgdGhlIHNhbWUgb2JqZWN0IHJlZmVyZW5jZSBmb3Igb3B0aW9ucy5cbiAgICAgICAgICAgICAgICAvLyBUaGlzIGVuc3VyZXMgY29uc2lzdGVuY3kgYW5kIGF2b2lkcyBwb3RlbnRpYWwgaXNzdWVzLlxuICAgICAgICAgICAgICAgIHRhc2tEYXRhLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgICAgICAgICAgICAgIGlmIChvbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gdXNpbmcgYGFkZEV2ZW50TGlzdGVuZXJgIHdpdGggdGhlIGBvbmNlYCBvcHRpb24sIHdlIGRvbid0IHBhc3NcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGBvbmNlYCBvcHRpb24gZGlyZWN0bHkgdG8gdGhlIG5hdGl2ZSBgYWRkRXZlbnRMaXN0ZW5lcmAgbWV0aG9kLlxuICAgICAgICAgICAgICAgICAgICAvLyBJbnN0ZWFkLCB3ZSBrZWVwIHRoZSBgb25jZWAgc2V0dGluZyBhbmQgaGFuZGxlIGl0IG91cnNlbHZlcy5cbiAgICAgICAgICAgICAgICAgICAgdGFza0RhdGEub3B0aW9ucy5vbmNlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRhc2tEYXRhLnRhcmdldCA9IHRhcmdldDtcbiAgICAgICAgICAgICAgICB0YXNrRGF0YS5jYXB0dXJlID0gY2FwdHVyZTtcbiAgICAgICAgICAgICAgICB0YXNrRGF0YS5ldmVudE5hbWUgPSBldmVudE5hbWU7XG4gICAgICAgICAgICAgICAgdGFza0RhdGEuaXNFeGlzdGluZyA9IGlzRXhpc3Rpbmc7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IHVzZUdsb2JhbENhbGxiYWNrID8gT1BUSU1JWkVEX1pPTkVfRVZFTlRfVEFTS19EQVRBIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIC8vIGtlZXAgdGFza0RhdGEgaW50byBkYXRhIHRvIGFsbG93IG9uU2NoZWR1bGVFdmVudFRhc2sgdG8gYWNjZXNzIHRoZSB0YXNrIGluZm9ybWF0aW9uXG4gICAgICAgICAgICAgICAgaWYgKGRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YS50YXNrRGF0YSA9IHRhc2tEYXRhO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2lnbmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gdXNpbmcgYGFkZEV2ZW50TGlzdGVuZXJgIHdpdGggdGhlIGBzaWduYWxgIG9wdGlvbiwgd2UgZG9uJ3QgcGFzc1xuICAgICAgICAgICAgICAgICAgICAvLyB0aGUgYHNpZ25hbGAgb3B0aW9uIGRpcmVjdGx5IHRvIHRoZSBuYXRpdmUgYGFkZEV2ZW50TGlzdGVuZXJgIG1ldGhvZC5cbiAgICAgICAgICAgICAgICAgICAgLy8gSW5zdGVhZCwgd2Uga2VlcCB0aGUgYHNpZ25hbGAgc2V0dGluZyBhbmQgaGFuZGxlIGl0IG91cnNlbHZlcy5cbiAgICAgICAgICAgICAgICAgICAgdGFza0RhdGEub3B0aW9ucy5zaWduYWwgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIFRoZSBgc2NoZWR1bGVFdmVudFRhc2tgIGZ1bmN0aW9uIHdpbGwgdWx0aW1hdGVseSBjYWxsIGBjdXN0b21TY2hlZHVsZUdsb2JhbGAsXG4gICAgICAgICAgICAgICAgLy8gd2hpY2ggaW4gdHVybiBjYWxscyB0aGUgbmF0aXZlIGBhZGRFdmVudExpc3RlbmVyYC4gVGhpcyBpcyB3aHkgYHRhc2tEYXRhLm9wdGlvbnNgXG4gICAgICAgICAgICAgICAgLy8gaXMgdXBkYXRlZCBiZWZvcmUgc2NoZWR1bGluZyB0aGUgdGFzaywgYXMgYGN1c3RvbVNjaGVkdWxlR2xvYmFsYCB1c2VzXG4gICAgICAgICAgICAgICAgLy8gYHRhc2tEYXRhLm9wdGlvbnNgIHRvIHBhc3MgaXQgdG8gdGhlIG5hdGl2ZSBgYWRkRXZlbnRMaXN0ZW5lcmAuXG4gICAgICAgICAgICAgICAgY29uc3QgdGFzayA9IHpvbmUuc2NoZWR1bGVFdmVudFRhc2soc291cmNlLCBkZWxlZ2F0ZSwgZGF0YSwgY3VzdG9tU2NoZWR1bGVGbiwgY3VzdG9tQ2FuY2VsRm4pO1xuICAgICAgICAgICAgICAgIGlmIChzaWduYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYWZ0ZXIgdGFzayBpcyBzY2hlZHVsZWQsIHdlIG5lZWQgdG8gc3RvcmUgdGhlIHNpZ25hbCBiYWNrIHRvIHRhc2sub3B0aW9uc1xuICAgICAgICAgICAgICAgICAgICB0YXNrRGF0YS5vcHRpb25zLnNpZ25hbCA9IHNpZ25hbDtcbiAgICAgICAgICAgICAgICAgICAgLy8gV3JhcHBpbmcgYHRhc2tgIGluIGEgd2VhayByZWZlcmVuY2Ugd291bGQgbm90IHByZXZlbnQgbWVtb3J5IGxlYWtzLiBXZWFrIHJlZmVyZW5jZXMgYXJlXG4gICAgICAgICAgICAgICAgICAgIC8vIHByaW1hcmlseSB1c2VkIGZvciBwcmV2ZW50aW5nIHN0cm9uZyByZWZlcmVuY2VzIGN5Y2xlcy4gYG9uQWJvcnRgIGlzIGFsd2F5cyByZWFjaGFibGVcbiAgICAgICAgICAgICAgICAgICAgLy8gYXMgaXQncyBhbiBldmVudCBsaXN0ZW5lciwgc28gaXRzIGNsb3N1cmUgcmV0YWlucyBhIHN0cm9uZyByZWZlcmVuY2UgdG8gdGhlIGB0YXNrYC5cbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb25BYm9ydCA9ICgpID0+IHRhc2suem9uZS5jYW5jZWxUYXNrKHRhc2spO1xuICAgICAgICAgICAgICAgICAgICBuYXRpdmVMaXN0ZW5lci5jYWxsKHNpZ25hbCwgJ2Fib3J0Jywgb25BYm9ydCwgeyBvbmNlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIHJlbW92ZSB0aGUgYGFib3J0YCBsaXN0ZW5lciB3aGVuIHRoZSBldmVudCBsaXN0ZW5lciBpcyBnb2luZyB0byBiZSByZW1vdmVkLFxuICAgICAgICAgICAgICAgICAgICAvLyBhcyBpdCBjcmVhdGVzIGEgY2xvc3VyZSB0aGF0IGNhcHR1cmVzIGB0YXNrYC4gVGhpcyBjbG9zdXJlIHJldGFpbnMgYSByZWZlcmVuY2UgdG8gdGhlXG4gICAgICAgICAgICAgICAgICAgIC8vIGB0YXNrYCBvYmplY3QgZXZlbiBhZnRlciBpdCBnb2VzIG91dCBvZiBzY29wZSwgcHJldmVudGluZyBgdGFza2AgZnJvbSBiZWluZyBnYXJiYWdlXG4gICAgICAgICAgICAgICAgICAgIC8vIGNvbGxlY3RlZC5cbiAgICAgICAgICAgICAgICAgICAgdGFzay5yZW1vdmVBYm9ydExpc3RlbmVyID0gKCkgPT4gc2lnbmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Fib3J0Jywgb25BYm9ydCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHNob3VsZCBjbGVhciB0YXNrRGF0YS50YXJnZXQgdG8gYXZvaWQgbWVtb3J5IGxlYWtcbiAgICAgICAgICAgICAgICAvLyBpc3N1ZSwgaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci9pc3N1ZXMvMjA0NDJcbiAgICAgICAgICAgICAgICB0YXNrRGF0YS50YXJnZXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIC8vIG5lZWQgdG8gY2xlYXIgdXAgdGFza0RhdGEgYmVjYXVzZSBpdCBpcyBhIGdsb2JhbCBvYmplY3RcbiAgICAgICAgICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBkYXRhLnRhc2tEYXRhID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gaGF2ZSB0byBzYXZlIHRob3NlIGluZm9ybWF0aW9uIHRvIHRhc2sgaW4gY2FzZVxuICAgICAgICAgICAgICAgIC8vIGFwcGxpY2F0aW9uIG1heSBjYWxsIHRhc2suem9uZS5jYW5jZWxUYXNrKCkgZGlyZWN0bHlcbiAgICAgICAgICAgICAgICBpZiAob25jZSkge1xuICAgICAgICAgICAgICAgICAgICB0YXNrRGF0YS5vcHRpb25zLm9uY2UgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHRhc2sub3B0aW9ucyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIHNob3VsZCBzYXZlIHRoZSBvcHRpb25zIG9uIHRoZSB0YXNrIChpZiBpdCdzIGFuIG9iamVjdCkgYmVjYXVzZVxuICAgICAgICAgICAgICAgICAgICAvLyB3ZSdsbCBiZSB1c2luZyBgdGFzay5vcHRpb25zYCBsYXRlciB3aGVuIHJlbW92aW5nIHRoZSBldmVudCBsaXN0ZW5lclxuICAgICAgICAgICAgICAgICAgICAvLyBhbmQgcGFzc2luZyBpdCBiYWNrIHRvIGByZW1vdmVFdmVudExpc3RlbmVyYC5cbiAgICAgICAgICAgICAgICAgICAgdGFzay5vcHRpb25zID0gb3B0aW9ucztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGFzay50YXJnZXQgPSB0YXJnZXQ7XG4gICAgICAgICAgICAgICAgdGFzay5jYXB0dXJlID0gY2FwdHVyZTtcbiAgICAgICAgICAgICAgICB0YXNrLmV2ZW50TmFtZSA9IGV2ZW50TmFtZTtcbiAgICAgICAgICAgICAgICBpZiAoaXNFdmVudExpc3RlbmVyT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHNhdmUgb3JpZ2luYWwgZGVsZWdhdGUgZm9yIGNvbXBhcmUgdG8gY2hlY2sgZHVwbGljYXRlXG4gICAgICAgICAgICAgICAgICAgIHRhc2sub3JpZ2luYWxEZWxlZ2F0ZSA9IGRlbGVnYXRlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIXByZXBlbmQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdUYXNrcy5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdUYXNrcy51bnNoaWZ0KHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmV0dXJuVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgcHJvdG9bQUREX0VWRU5UX0xJU1RFTkVSXSA9IG1ha2VBZGRMaXN0ZW5lcihuYXRpdmVBZGRFdmVudExpc3RlbmVyLCBBRERfRVZFTlRfTElTVEVORVJfU09VUkNFLCBjdXN0b21TY2hlZHVsZSwgY3VzdG9tQ2FuY2VsLCByZXR1cm5UYXJnZXQpO1xuICAgICAgICBpZiAobmF0aXZlUHJlcGVuZEV2ZW50TGlzdGVuZXIpIHtcbiAgICAgICAgICAgIHByb3RvW1BSRVBFTkRfRVZFTlRfTElTVEVORVJdID0gbWFrZUFkZExpc3RlbmVyKG5hdGl2ZVByZXBlbmRFdmVudExpc3RlbmVyLCBQUkVQRU5EX0VWRU5UX0xJU1RFTkVSX1NPVVJDRSwgY3VzdG9tU2NoZWR1bGVQcmVwZW5kLCBjdXN0b21DYW5jZWwsIHJldHVyblRhcmdldCwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcHJvdG9bUkVNT1ZFX0VWRU5UX0xJU1RFTkVSXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRoaXMgfHwgX2dsb2JhbDtcbiAgICAgICAgICAgIGxldCBldmVudE5hbWUgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBpZiAocGF0Y2hPcHRpb25zICYmIHBhdGNoT3B0aW9ucy50cmFuc2ZlckV2ZW50TmFtZSkge1xuICAgICAgICAgICAgICAgIGV2ZW50TmFtZSA9IHBhdGNoT3B0aW9ucy50cmFuc2ZlckV2ZW50TmFtZShldmVudE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgb3B0aW9ucyA9IGFyZ3VtZW50c1syXTtcbiAgICAgICAgICAgIGNvbnN0IGNhcHR1cmUgPSAhb3B0aW9ucyA/IGZhbHNlIDogdHlwZW9mIG9wdGlvbnMgPT09ICdib29sZWFuJyA/IHRydWUgOiBvcHRpb25zLmNhcHR1cmU7XG4gICAgICAgICAgICBjb25zdCBkZWxlZ2F0ZSA9IGFyZ3VtZW50c1sxXTtcbiAgICAgICAgICAgIGlmICghZGVsZWdhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmF0aXZlUmVtb3ZlRXZlbnRMaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHZhbGlkYXRlSGFuZGxlciAmJlxuICAgICAgICAgICAgICAgICF2YWxpZGF0ZUhhbmRsZXIobmF0aXZlUmVtb3ZlRXZlbnRMaXN0ZW5lciwgZGVsZWdhdGUsIHRhcmdldCwgYXJndW1lbnRzKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHN5bWJvbEV2ZW50TmFtZXMgPSB6b25lU3ltYm9sRXZlbnROYW1lc1tldmVudE5hbWVdO1xuICAgICAgICAgICAgbGV0IHN5bWJvbEV2ZW50TmFtZTtcbiAgICAgICAgICAgIGlmIChzeW1ib2xFdmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgc3ltYm9sRXZlbnROYW1lID0gc3ltYm9sRXZlbnROYW1lc1tjYXB0dXJlID8gVFJVRV9TVFIgOiBGQUxTRV9TVFJdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdUYXNrcyA9IHN5bWJvbEV2ZW50TmFtZSAmJiB0YXJnZXRbc3ltYm9sRXZlbnROYW1lXTtcbiAgICAgICAgICAgIC8vIGBleGlzdGluZ1Rhc2tzYCBtYXkgbm90IGV4aXN0IGlmIHRoZSBgYWRkRXZlbnRMaXN0ZW5lcmAgd2FzIGNhbGxlZCBiZWZvcmVcbiAgICAgICAgICAgIC8vIGl0IHdhcyBwYXRjaGVkIGJ5IHpvbmUuanMuIFBsZWFzZSByZWZlciB0byB0aGUgYXR0YWNoZWQgaXNzdWUgZm9yXG4gICAgICAgICAgICAvLyBjbGFyaWZpY2F0aW9uLCBwYXJ0aWN1bGFybHkgYWZ0ZXIgdGhlIGBpZmAgY29uZGl0aW9uLCBiZWZvcmUgY2FsbGluZ1xuICAgICAgICAgICAgLy8gdGhlIG5hdGl2ZSBgcmVtb3ZlRXZlbnRMaXN0ZW5lcmAuXG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdUYXNrcykge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZXhpc3RpbmdUYXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ1Rhc2sgPSBleGlzdGluZ1Rhc2tzW2ldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGFyZShleGlzdGluZ1Rhc2ssIGRlbGVnYXRlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdUYXNrcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzZXQgaXNSZW1vdmVkIHRvIGRhdGEgZm9yIGZhc3RlciBpbnZva2VUYXNrIGNoZWNrXG4gICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ1Rhc2suaXNSZW1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1Rhc2tzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFsbCB0YXNrcyBmb3IgdGhlIGV2ZW50TmFtZSArIGNhcHR1cmUgaGF2ZSBnb25lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBnbG9iYWxab25lQXdhcmVDYWxsYmFjayBhbmQgcmVtb3ZlIHRoZSB0YXNrIGNhY2hlIGZyb20gdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdUYXNrLmFsbFJlbW92ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldFtzeW1ib2xFdmVudE5hbWVdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgdGFyZ2V0LCB3ZSBoYXZlIGFuIGV2ZW50IGxpc3RlbmVyIHdoaWNoIGlzIGFkZGVkIGJ5IG9uX3Byb3BlcnR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3VjaCBhcyB0YXJnZXQub25jbGljayA9IGZ1bmN0aW9uKCkge30sIHNvIHdlIG5lZWQgdG8gY2xlYXIgdGhpcyBpbnRlcm5hbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHByb3BlcnR5IHRvbyBpZiBhbGwgZGVsZWdhdGVzIHdpdGggY2FwdHVyZT1mYWxzZSB3ZXJlIHJlbW92ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBodHRwczovLyBnaXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci9pc3N1ZXMvMzE2NDNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyL2lzc3Vlcy81NDU4MVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY2FwdHVyZSAmJiB0eXBlb2YgZXZlbnROYW1lID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvblByb3BlcnR5U3ltYm9sID0gWk9ORV9TWU1CT0xfUFJFRklYICsgJ09OX1BST1BFUlRZJyArIGV2ZW50TmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0W29uUHJvcGVydHlTeW1ib2xdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJbiBhbGwgb3RoZXIgY29uZGl0aW9ucywgd2hlbiBgYWRkRXZlbnRMaXN0ZW5lcmAgaXMgY2FsbGVkIGFmdGVyIGJlaW5nXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBwYXRjaGVkIGJ5IHpvbmUuanMsIHdlIHdvdWxkIGFsd2F5cyBmaW5kIGFuIGV2ZW50IHRhc2sgb24gdGhlIGBFdmVudFRhcmdldGAuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIHdpbGwgdHJpZ2dlciBgY2FuY2VsRm5gIG9uIHRoZSBgZXhpc3RpbmdUYXNrYCwgbGVhZGluZyB0byBgY3VzdG9tQ2FuY2VsR2xvYmFsYCxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdoaWNoIHVsdGltYXRlbHkgcmVtb3ZlcyBhbiBldmVudCBsaXN0ZW5lciBhbmQgY2xlYW5zIHVwIHRoZSBhYm9ydCBsaXN0ZW5lclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gKGlmIGFuIGBBYm9ydFNpZ25hbGAgd2FzIHByb3ZpZGVkIHdoZW4gc2NoZWR1bGluZyBhIHRhc2spLlxuICAgICAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdUYXNrLnpvbmUuY2FuY2VsVGFzayhleGlzdGluZ1Rhc2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJldHVyblRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci96b25lLmpzL2lzc3Vlcy85MzBcbiAgICAgICAgICAgIC8vIFdlIG1heSBlbmNvdW50ZXIgYSBzaXR1YXRpb24gd2hlcmUgdGhlIGBhZGRFdmVudExpc3RlbmVyYCB3YXNcbiAgICAgICAgICAgIC8vIGNhbGxlZCBvbiB0aGUgZXZlbnQgdGFyZ2V0IGJlZm9yZSB6b25lLmpzIGlzIGxvYWRlZCwgcmVzdWx0aW5nXG4gICAgICAgICAgICAvLyBpbiBubyB0YXNrIGJlaW5nIHN0b3JlZCBvbiB0aGUgZXZlbnQgdGFyZ2V0IGR1ZSB0byBpdHMgaW52b2NhdGlvblxuICAgICAgICAgICAgLy8gb2YgdGhlIG5hdGl2ZSBpbXBsZW1lbnRhdGlvbi4gSW4gdGhpcyBzY2VuYXJpbywgd2Ugc2ltcGx5IG5lZWQgdG9cbiAgICAgICAgICAgIC8vIGludm9rZSB0aGUgbmF0aXZlIGByZW1vdmVFdmVudExpc3RlbmVyYC5cbiAgICAgICAgICAgIHJldHVybiBuYXRpdmVSZW1vdmVFdmVudExpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgICAgIHByb3RvW0xJU1RFTkVSU19FVkVOVF9MSVNURU5FUl0gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0aGlzIHx8IF9nbG9iYWw7XG4gICAgICAgICAgICBsZXQgZXZlbnROYW1lID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgaWYgKHBhdGNoT3B0aW9ucyAmJiBwYXRjaE9wdGlvbnMudHJhbnNmZXJFdmVudE5hbWUpIHtcbiAgICAgICAgICAgICAgICBldmVudE5hbWUgPSBwYXRjaE9wdGlvbnMudHJhbnNmZXJFdmVudE5hbWUoZXZlbnROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxpc3RlbmVycyA9IFtdO1xuICAgICAgICAgICAgY29uc3QgdGFza3MgPSBmaW5kRXZlbnRUYXNrcyh0YXJnZXQsIGV2ZW50TmFtZVRvU3RyaW5nID8gZXZlbnROYW1lVG9TdHJpbmcoZXZlbnROYW1lKSA6IGV2ZW50TmFtZSk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhc2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFzayA9IHRhc2tzW2ldO1xuICAgICAgICAgICAgICAgIGxldCBkZWxlZ2F0ZSA9IHRhc2sub3JpZ2luYWxEZWxlZ2F0ZSA/IHRhc2sub3JpZ2luYWxEZWxlZ2F0ZSA6IHRhc2suY2FsbGJhY2s7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzLnB1c2goZGVsZWdhdGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGxpc3RlbmVycztcbiAgICAgICAgfTtcbiAgICAgICAgcHJvdG9bUkVNT1ZFX0FMTF9MSVNURU5FUlNfRVZFTlRfTElTVEVORVJdID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gdGhpcyB8fCBfZ2xvYmFsO1xuICAgICAgICAgICAgbGV0IGV2ZW50TmFtZSA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgICAgIGlmICghZXZlbnROYW1lKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHRhcmdldCk7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb3AgPSBrZXlzW2ldO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IEVWRU5UX05BTUVfU1lNQk9MX1JFR1guZXhlYyhwcm9wKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGV2dE5hbWUgPSBtYXRjaCAmJiBtYXRjaFsxXTtcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gbm9kZWpzIEV2ZW50RW1pdHRlciwgcmVtb3ZlTGlzdGVuZXIgZXZlbnQgaXNcbiAgICAgICAgICAgICAgICAgICAgLy8gdXNlZCBmb3IgbW9uaXRvcmluZyB0aGUgcmVtb3ZlTGlzdGVuZXIgY2FsbCxcbiAgICAgICAgICAgICAgICAgICAgLy8gc28ganVzdCBrZWVwIHJlbW92ZUxpc3RlbmVyIGV2ZW50TGlzdGVuZXIgdW50aWxcbiAgICAgICAgICAgICAgICAgICAgLy8gYWxsIG90aGVyIGV2ZW50TGlzdGVuZXJzIGFyZSByZW1vdmVkXG4gICAgICAgICAgICAgICAgICAgIGlmIChldnROYW1lICYmIGV2dE5hbWUgIT09ICdyZW1vdmVMaXN0ZW5lcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNbUkVNT1ZFX0FMTF9MSVNURU5FUlNfRVZFTlRfTElTVEVORVJdLmNhbGwodGhpcywgZXZ0TmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHJlbW92ZUxpc3RlbmVyIGxpc3RlbmVyIGZpbmFsbHlcbiAgICAgICAgICAgICAgICB0aGlzW1JFTU9WRV9BTExfTElTVEVORVJTX0VWRU5UX0xJU1RFTkVSXS5jYWxsKHRoaXMsICdyZW1vdmVMaXN0ZW5lcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHBhdGNoT3B0aW9ucyAmJiBwYXRjaE9wdGlvbnMudHJhbnNmZXJFdmVudE5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnROYW1lID0gcGF0Y2hPcHRpb25zLnRyYW5zZmVyRXZlbnROYW1lKGV2ZW50TmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHN5bWJvbEV2ZW50TmFtZXMgPSB6b25lU3ltYm9sRXZlbnROYW1lc1tldmVudE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChzeW1ib2xFdmVudE5hbWVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN5bWJvbEV2ZW50TmFtZSA9IHN5bWJvbEV2ZW50TmFtZXNbRkFMU0VfU1RSXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ltYm9sQ2FwdHVyZUV2ZW50TmFtZSA9IHN5bWJvbEV2ZW50TmFtZXNbVFJVRV9TVFJdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXNrcyA9IHRhcmdldFtzeW1ib2xFdmVudE5hbWVdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjYXB0dXJlVGFza3MgPSB0YXJnZXRbc3ltYm9sQ2FwdHVyZUV2ZW50TmFtZV07XG4gICAgICAgICAgICAgICAgICAgIGlmICh0YXNrcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVtb3ZlVGFza3MgPSB0YXNrcy5zbGljZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCByZW1vdmVUYXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhc2sgPSByZW1vdmVUYXNrc1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgZGVsZWdhdGUgPSB0YXNrLm9yaWdpbmFsRGVsZWdhdGUgPyB0YXNrLm9yaWdpbmFsRGVsZWdhdGUgOiB0YXNrLmNhbGxiYWNrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNbUkVNT1ZFX0VWRU5UX0xJU1RFTkVSXS5jYWxsKHRoaXMsIGV2ZW50TmFtZSwgZGVsZWdhdGUsIHRhc2sub3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhcHR1cmVUYXNrcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVtb3ZlVGFza3MgPSBjYXB0dXJlVGFza3Muc2xpY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcmVtb3ZlVGFza3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXNrID0gcmVtb3ZlVGFza3NbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGRlbGVnYXRlID0gdGFzay5vcmlnaW5hbERlbGVnYXRlID8gdGFzay5vcmlnaW5hbERlbGVnYXRlIDogdGFzay5jYWxsYmFjaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzW1JFTU9WRV9FVkVOVF9MSVNURU5FUl0uY2FsbCh0aGlzLCBldmVudE5hbWUsIGRlbGVnYXRlLCB0YXNrLm9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJldHVyblRhcmdldCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBmb3IgbmF0aXZlIHRvU3RyaW5nIHBhdGNoXG4gICAgICAgIGF0dGFjaE9yaWdpblRvUGF0Y2hlZChwcm90b1tBRERfRVZFTlRfTElTVEVORVJdLCBuYXRpdmVBZGRFdmVudExpc3RlbmVyKTtcbiAgICAgICAgYXR0YWNoT3JpZ2luVG9QYXRjaGVkKHByb3RvW1JFTU9WRV9FVkVOVF9MSVNURU5FUl0sIG5hdGl2ZVJlbW92ZUV2ZW50TGlzdGVuZXIpO1xuICAgICAgICBpZiAobmF0aXZlUmVtb3ZlQWxsTGlzdGVuZXJzKSB7XG4gICAgICAgICAgICBhdHRhY2hPcmlnaW5Ub1BhdGNoZWQocHJvdG9bUkVNT1ZFX0FMTF9MSVNURU5FUlNfRVZFTlRfTElTVEVORVJdLCBuYXRpdmVSZW1vdmVBbGxMaXN0ZW5lcnMpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuYXRpdmVMaXN0ZW5lcnMpIHtcbiAgICAgICAgICAgIGF0dGFjaE9yaWdpblRvUGF0Y2hlZChwcm90b1tMSVNURU5FUlNfRVZFTlRfTElTVEVORVJdLCBuYXRpdmVMaXN0ZW5lcnMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBsZXQgcmVzdWx0cyA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXBpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICByZXN1bHRzW2ldID0gcGF0Y2hFdmVudFRhcmdldE1ldGhvZHMoYXBpc1tpXSwgcGF0Y2hPcHRpb25zKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5mdW5jdGlvbiBmaW5kRXZlbnRUYXNrcyh0YXJnZXQsIGV2ZW50TmFtZSkge1xuICAgIGlmICghZXZlbnROYW1lKSB7XG4gICAgICAgIGNvbnN0IGZvdW5kVGFza3MgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgcHJvcCBpbiB0YXJnZXQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gRVZFTlRfTkFNRV9TWU1CT0xfUkVHWC5leGVjKHByb3ApO1xuICAgICAgICAgICAgbGV0IGV2dE5hbWUgPSBtYXRjaCAmJiBtYXRjaFsxXTtcbiAgICAgICAgICAgIGlmIChldnROYW1lICYmICghZXZlbnROYW1lIHx8IGV2dE5hbWUgPT09IGV2ZW50TmFtZSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXNrcyA9IHRhcmdldFtwcm9wXTtcbiAgICAgICAgICAgICAgICBpZiAodGFza3MpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmRUYXNrcy5wdXNoKHRhc2tzW2ldKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZm91bmRUYXNrcztcbiAgICB9XG4gICAgbGV0IHN5bWJvbEV2ZW50TmFtZSA9IHpvbmVTeW1ib2xFdmVudE5hbWVzW2V2ZW50TmFtZV07XG4gICAgaWYgKCFzeW1ib2xFdmVudE5hbWUpIHtcbiAgICAgICAgcHJlcGFyZUV2ZW50TmFtZXMoZXZlbnROYW1lKTtcbiAgICAgICAgc3ltYm9sRXZlbnROYW1lID0gem9uZVN5bWJvbEV2ZW50TmFtZXNbZXZlbnROYW1lXTtcbiAgICB9XG4gICAgY29uc3QgY2FwdHVyZUZhbHNlVGFza3MgPSB0YXJnZXRbc3ltYm9sRXZlbnROYW1lW0ZBTFNFX1NUUl1dO1xuICAgIGNvbnN0IGNhcHR1cmVUcnVlVGFza3MgPSB0YXJnZXRbc3ltYm9sRXZlbnROYW1lW1RSVUVfU1RSXV07XG4gICAgaWYgKCFjYXB0dXJlRmFsc2VUYXNrcykge1xuICAgICAgICByZXR1cm4gY2FwdHVyZVRydWVUYXNrcyA/IGNhcHR1cmVUcnVlVGFza3Muc2xpY2UoKSA6IFtdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGNhcHR1cmVUcnVlVGFza3NcbiAgICAgICAgICAgID8gY2FwdHVyZUZhbHNlVGFza3MuY29uY2F0KGNhcHR1cmVUcnVlVGFza3MpXG4gICAgICAgICAgICA6IGNhcHR1cmVGYWxzZVRhc2tzLnNsaWNlKCk7XG4gICAgfVxufVxuZnVuY3Rpb24gcGF0Y2hFdmVudFByb3RvdHlwZShnbG9iYWwsIGFwaSkge1xuICAgIGNvbnN0IEV2ZW50ID0gZ2xvYmFsWydFdmVudCddO1xuICAgIGlmIChFdmVudCAmJiBFdmVudC5wcm90b3R5cGUpIHtcbiAgICAgICAgYXBpLnBhdGNoTWV0aG9kKEV2ZW50LnByb3RvdHlwZSwgJ3N0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbicsIChkZWxlZ2F0ZSkgPT4gZnVuY3Rpb24gKHNlbGYsIGFyZ3MpIHtcbiAgICAgICAgICAgIHNlbGZbSU1NRURJQVRFX1BST1BBR0FUSU9OX1NZTUJPTF0gPSB0cnVlO1xuICAgICAgICAgICAgLy8gd2UgbmVlZCB0byBjYWxsIHRoZSBuYXRpdmUgc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uXG4gICAgICAgICAgICAvLyBpbiBjYXNlIGluIHNvbWUgaHlicmlkIGFwcGxpY2F0aW9uLCBzb21lIHBhcnQgb2ZcbiAgICAgICAgICAgIC8vIGFwcGxpY2F0aW9uIHdpbGwgYmUgY29udHJvbGxlZCBieSB6b25lLCBzb21lIGFyZSBub3RcbiAgICAgICAgICAgIGRlbGVnYXRlICYmIGRlbGVnYXRlLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8qKlxuICogQGZpbGVvdmVydmlld1xuICogQHN1cHByZXNzIHttaXNzaW5nUmVxdWlyZX1cbiAqL1xuZnVuY3Rpb24gcGF0Y2hRdWV1ZU1pY3JvdGFzayhnbG9iYWwsIGFwaSkge1xuICAgIGFwaS5wYXRjaE1ldGhvZChnbG9iYWwsICdxdWV1ZU1pY3JvdGFzaycsIChkZWxlZ2F0ZSkgPT4ge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHNlbGYsIGFyZ3MpIHtcbiAgICAgICAgICAgIFpvbmUuY3VycmVudC5zY2hlZHVsZU1pY3JvVGFzaygncXVldWVNaWNyb3Rhc2snLCBhcmdzWzBdKTtcbiAgICAgICAgfTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBAZmlsZW92ZXJ2aWV3XG4gKiBAc3VwcHJlc3Mge21pc3NpbmdSZXF1aXJlfVxuICovXG5jb25zdCB0YXNrU3ltYm9sID0gem9uZVN5bWJvbCgnem9uZVRhc2snKTtcbmZ1bmN0aW9uIHBhdGNoVGltZXIod2luZG93LCBzZXROYW1lLCBjYW5jZWxOYW1lLCBuYW1lU3VmZml4KSB7XG4gICAgbGV0IHNldE5hdGl2ZSA9IG51bGw7XG4gICAgbGV0IGNsZWFyTmF0aXZlID0gbnVsbDtcbiAgICBzZXROYW1lICs9IG5hbWVTdWZmaXg7XG4gICAgY2FuY2VsTmFtZSArPSBuYW1lU3VmZml4O1xuICAgIGNvbnN0IHRhc2tzQnlIYW5kbGVJZCA9IHt9O1xuICAgIGZ1bmN0aW9uIHNjaGVkdWxlVGFzayh0YXNrKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSB0YXNrLmRhdGE7XG4gICAgICAgIGRhdGEuYXJnc1swXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0YXNrLmludm9rZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBoYW5kbGVPcklkID0gc2V0TmF0aXZlLmFwcGx5KHdpbmRvdywgZGF0YS5hcmdzKTtcbiAgICAgICAgLy8gV2hsaXN0IG9uIE5vZGUuanMgd2hlbiBnZXQgY2FuIHRoZSBJRCBieSB1c2luZyBgW1N5bWJvbC50b1ByaW1pdGl2ZV0oKWAgd2UgZG9cbiAgICAgICAgLy8gdG8gdGhpcyBzbyB0aGF0IHdlIGRvIG5vdCBjYXVzZSBwb3RlbnRhbGx5IGxlYWtzIHdoZW4gdXNpbmcgYHNldFRpbWVvdXRgXG4gICAgICAgIC8vIHNpbmNlIHRoaXMgY2FuIGJlIHBlcmlvZGljIHdoZW4gdXNpbmcgYC5yZWZyZXNoYC5cbiAgICAgICAgaWYgKGlzTnVtYmVyKGhhbmRsZU9ySWQpKSB7XG4gICAgICAgICAgICBkYXRhLmhhbmRsZUlkID0gaGFuZGxlT3JJZDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGRhdGEuaGFuZGxlID0gaGFuZGxlT3JJZDtcbiAgICAgICAgICAgIC8vIE9uIE5vZGUuanMgYSB0aW1lb3V0IGFuZCBpbnRlcnZhbCBjYW4gYmUgcmVzdGFydGVkIG92ZXIgYW5kIG92ZXIgYWdhaW4gYnkgdXNpbmcgdGhlIGAucmVmcmVzaGAgbWV0aG9kLlxuICAgICAgICAgICAgZGF0YS5pc1JlZnJlc2hhYmxlID0gaXNGdW5jdGlvbihoYW5kbGVPcklkLnJlZnJlc2gpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0YXNrO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjbGVhclRhc2sodGFzaykge1xuICAgICAgICBjb25zdCB7IGhhbmRsZSwgaGFuZGxlSWQgfSA9IHRhc2suZGF0YTtcbiAgICAgICAgcmV0dXJuIGNsZWFyTmF0aXZlLmNhbGwod2luZG93LCBoYW5kbGUgPz8gaGFuZGxlSWQpO1xuICAgIH1cbiAgICBzZXROYXRpdmUgPSBwYXRjaE1ldGhvZCh3aW5kb3csIHNldE5hbWUsIChkZWxlZ2F0ZSkgPT4gZnVuY3Rpb24gKHNlbGYsIGFyZ3MpIHtcbiAgICAgICAgaWYgKGlzRnVuY3Rpb24oYXJnc1swXSkpIHtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgaXNSZWZyZXNoYWJsZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgaXNQZXJpb2RpYzogbmFtZVN1ZmZpeCA9PT0gJ0ludGVydmFsJyxcbiAgICAgICAgICAgICAgICBkZWxheTogbmFtZVN1ZmZpeCA9PT0gJ1RpbWVvdXQnIHx8IG5hbWVTdWZmaXggPT09ICdJbnRlcnZhbCcgPyBhcmdzWzFdIHx8IDAgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgYXJnczogYXJncyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBjYWxsYmFjayA9IGFyZ3NbMF07XG4gICAgICAgICAgICBhcmdzWzBdID0gZnVuY3Rpb24gdGltZXIoKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpc3N1ZS05MzQsIHRhc2sgd2lsbCBiZSBjYW5jZWxsZWRcbiAgICAgICAgICAgICAgICAgICAgLy8gZXZlbiBpdCBpcyBhIHBlcmlvZGljIHRhc2sgc3VjaCBhc1xuICAgICAgICAgICAgICAgICAgICAvLyBzZXRJbnRlcnZhbFxuICAgICAgICAgICAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyL2lzc3Vlcy80MDM4N1xuICAgICAgICAgICAgICAgICAgICAvLyBDbGVhbnVwIHRhc2tzQnlIYW5kbGVJZCBzaG91bGQgYmUgaGFuZGxlZCBiZWZvcmUgc2NoZWR1bGVUYXNrXG4gICAgICAgICAgICAgICAgICAgIC8vIFNpbmNlIHNvbWUgem9uZVNwZWMgbWF5IGludGVyY2VwdCBhbmQgZG9lc24ndCB0cmlnZ2VyXG4gICAgICAgICAgICAgICAgICAgIC8vIHNjaGVkdWxlRm4oc2NoZWR1bGVUYXNrKSBwcm92aWRlZCBoZXJlLlxuICAgICAgICAgICAgICAgICAgICBjb25zdCB7IGhhbmRsZSwgaGFuZGxlSWQsIGlzUGVyaW9kaWMsIGlzUmVmcmVzaGFibGUgfSA9IG9wdGlvbnM7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNQZXJpb2RpYyAmJiAhaXNSZWZyZXNoYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZUlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaW4gbm9uLW5vZGVqcyBlbnYsIHdlIHJlbW92ZSB0aW1lcklkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZnJvbSBsb2NhbCBjYWNoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSB0YXNrc0J5SGFuZGxlSWRbaGFuZGxlSWRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaGFuZGxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm9kZSByZXR1cm5zIGNvbXBsZXggb2JqZWN0cyBhcyBoYW5kbGVJZHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3ZSByZW1vdmUgdGFzayByZWZlcmVuY2UgZnJvbSB0aW1lciBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVbdGFza1N5bWJvbF0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRhc2sgPSBzY2hlZHVsZU1hY3JvVGFza1dpdGhDdXJyZW50Wm9uZShzZXROYW1lLCBhcmdzWzBdLCBvcHRpb25zLCBzY2hlZHVsZVRhc2ssIGNsZWFyVGFzayk7XG4gICAgICAgICAgICBpZiAoIXRhc2spIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGFzaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIE5vZGUuanMgbXVzdCBhZGRpdGlvbmFsbHkgc3VwcG9ydCB0aGUgcmVmIGFuZCB1bnJlZiBmdW5jdGlvbnMuXG4gICAgICAgICAgICBjb25zdCB7IGhhbmRsZUlkLCBoYW5kbGUsIGlzUmVmcmVzaGFibGUsIGlzUGVyaW9kaWMgfSA9IHRhc2suZGF0YTtcbiAgICAgICAgICAgIGlmIChoYW5kbGVJZCkge1xuICAgICAgICAgICAgICAgIC8vIGZvciBub24gbm9kZWpzIGVudiwgd2Ugc2F2ZSBoYW5kbGVJZDogdGFza1xuICAgICAgICAgICAgICAgIC8vIG1hcHBpbmcgaW4gbG9jYWwgY2FjaGUgZm9yIGNsZWFyVGltZW91dFxuICAgICAgICAgICAgICAgIHRhc2tzQnlIYW5kbGVJZFtoYW5kbGVJZF0gPSB0YXNrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaGFuZGxlKSB7XG4gICAgICAgICAgICAgICAgLy8gZm9yIG5vZGVqcyBlbnYsIHdlIHNhdmUgdGFza1xuICAgICAgICAgICAgICAgIC8vIHJlZmVyZW5jZSBpbiB0aW1lcklkIE9iamVjdCBmb3IgY2xlYXJUaW1lb3V0XG4gICAgICAgICAgICAgICAgaGFuZGxlW3Rhc2tTeW1ib2xdID0gdGFzaztcbiAgICAgICAgICAgICAgICBpZiAoaXNSZWZyZXNoYWJsZSAmJiAhaXNQZXJpb2RpYykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbFJlZnJlc2ggPSBoYW5kbGUucmVmcmVzaDtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlLnJlZnJlc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IHpvbmUsIHN0YXRlIH0gPSB0YXNrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlID09PSAnbm90U2NoZWR1bGVkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhc2suX3N0YXRlID0gJ3NjaGVkdWxlZCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgem9uZS5fdXBkYXRlVGFza0NvdW50KHRhc2ssIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUgPT09ICdydW5uaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhc2suX3N0YXRlID0gJ3NjaGVkdWxpbmcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsUmVmcmVzaC5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBoYW5kbGUgPz8gaGFuZGxlSWQgPz8gdGFzaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIGNhdXNlIGFuIGVycm9yIGJ5IGNhbGxpbmcgaXQgZGlyZWN0bHkuXG4gICAgICAgICAgICByZXR1cm4gZGVsZWdhdGUuYXBwbHkod2luZG93LCBhcmdzKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGNsZWFyTmF0aXZlID0gcGF0Y2hNZXRob2Qod2luZG93LCBjYW5jZWxOYW1lLCAoZGVsZWdhdGUpID0+IGZ1bmN0aW9uIChzZWxmLCBhcmdzKSB7XG4gICAgICAgIGNvbnN0IGlkID0gYXJnc1swXTtcbiAgICAgICAgbGV0IHRhc2s7XG4gICAgICAgIGlmIChpc051bWJlcihpZCkpIHtcbiAgICAgICAgICAgIC8vIG5vbiBub2RlanMgZW52LlxuICAgICAgICAgICAgdGFzayA9IHRhc2tzQnlIYW5kbGVJZFtpZF07XG4gICAgICAgICAgICBkZWxldGUgdGFza3NCeUhhbmRsZUlkW2lkXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIG5vZGVqcyBlbnYgPz8gb3RoZXIgZW52aXJvbm1lbnRzLlxuICAgICAgICAgICAgdGFzayA9IGlkPy5bdGFza1N5bWJvbF07XG4gICAgICAgICAgICBpZiAodGFzaykge1xuICAgICAgICAgICAgICAgIGlkW3Rhc2tTeW1ib2xdID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRhc2sgPSBpZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAodGFzaz8udHlwZSkge1xuICAgICAgICAgICAgaWYgKHRhc2suY2FuY2VsRm4pIHtcbiAgICAgICAgICAgICAgICAvLyBEbyBub3QgY2FuY2VsIGFscmVhZHkgY2FuY2VsZWQgZnVuY3Rpb25zXG4gICAgICAgICAgICAgICAgdGFzay56b25lLmNhbmNlbFRhc2sodGFzayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBjYXVzZSBhbiBlcnJvciBieSBjYWxsaW5nIGl0IGRpcmVjdGx5LlxuICAgICAgICAgICAgZGVsZWdhdGUuYXBwbHkod2luZG93LCBhcmdzKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBwYXRjaEN1c3RvbUVsZW1lbnRzKF9nbG9iYWwsIGFwaSkge1xuICAgIGNvbnN0IHsgaXNCcm93c2VyLCBpc01peCB9ID0gYXBpLmdldEdsb2JhbE9iamVjdHMoKTtcbiAgICBpZiAoKCFpc0Jyb3dzZXIgJiYgIWlzTWl4KSB8fCAhX2dsb2JhbFsnY3VzdG9tRWxlbWVudHMnXSB8fCAhKCdjdXN0b21FbGVtZW50cycgaW4gX2dsb2JhbCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBodHRwczovL2h0bWwuc3BlYy53aGF0d2cub3JnL211bHRpcGFnZS9jdXN0b20tZWxlbWVudHMuaHRtbCNjb25jZXB0LWN1c3RvbS1lbGVtZW50LWRlZmluaXRpb24tbGlmZWN5Y2xlLWNhbGxiYWNrc1xuICAgIGNvbnN0IGNhbGxiYWNrcyA9IFtcbiAgICAgICAgJ2Nvbm5lY3RlZENhbGxiYWNrJyxcbiAgICAgICAgJ2Rpc2Nvbm5lY3RlZENhbGxiYWNrJyxcbiAgICAgICAgJ2Fkb3B0ZWRDYWxsYmFjaycsXG4gICAgICAgICdhdHRyaWJ1dGVDaGFuZ2VkQ2FsbGJhY2snLFxuICAgICAgICAnZm9ybUFzc29jaWF0ZWRDYWxsYmFjaycsXG4gICAgICAgICdmb3JtRGlzYWJsZWRDYWxsYmFjaycsXG4gICAgICAgICdmb3JtUmVzZXRDYWxsYmFjaycsXG4gICAgICAgICdmb3JtU3RhdGVSZXN0b3JlQ2FsbGJhY2snLFxuICAgIF07XG4gICAgYXBpLnBhdGNoQ2FsbGJhY2tzKGFwaSwgX2dsb2JhbC5jdXN0b21FbGVtZW50cywgJ2N1c3RvbUVsZW1lbnRzJywgJ2RlZmluZScsIGNhbGxiYWNrcyk7XG59XG5cbmZ1bmN0aW9uIGV2ZW50VGFyZ2V0UGF0Y2goX2dsb2JhbCwgYXBpKSB7XG4gICAgaWYgKFpvbmVbYXBpLnN5bWJvbCgncGF0Y2hFdmVudFRhcmdldCcpXSkge1xuICAgICAgICAvLyBFdmVudFRhcmdldCBpcyBhbHJlYWR5IHBhdGNoZWQuXG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBldmVudE5hbWVzLCB6b25lU3ltYm9sRXZlbnROYW1lcywgVFJVRV9TVFIsIEZBTFNFX1NUUiwgWk9ORV9TWU1CT0xfUFJFRklYIH0gPSBhcGkuZ2V0R2xvYmFsT2JqZWN0cygpO1xuICAgIC8vICBwcmVkZWZpbmUgYWxsIF9fem9uZV9zeW1ib2xfXyArIGV2ZW50TmFtZSArIHRydWUvZmFsc2Ugc3RyaW5nXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBldmVudE5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50TmFtZSA9IGV2ZW50TmFtZXNbaV07XG4gICAgICAgIGNvbnN0IGZhbHNlRXZlbnROYW1lID0gZXZlbnROYW1lICsgRkFMU0VfU1RSO1xuICAgICAgICBjb25zdCB0cnVlRXZlbnROYW1lID0gZXZlbnROYW1lICsgVFJVRV9TVFI7XG4gICAgICAgIGNvbnN0IHN5bWJvbCA9IFpPTkVfU1lNQk9MX1BSRUZJWCArIGZhbHNlRXZlbnROYW1lO1xuICAgICAgICBjb25zdCBzeW1ib2xDYXB0dXJlID0gWk9ORV9TWU1CT0xfUFJFRklYICsgdHJ1ZUV2ZW50TmFtZTtcbiAgICAgICAgem9uZVN5bWJvbEV2ZW50TmFtZXNbZXZlbnROYW1lXSA9IHt9O1xuICAgICAgICB6b25lU3ltYm9sRXZlbnROYW1lc1tldmVudE5hbWVdW0ZBTFNFX1NUUl0gPSBzeW1ib2w7XG4gICAgICAgIHpvbmVTeW1ib2xFdmVudE5hbWVzW2V2ZW50TmFtZV1bVFJVRV9TVFJdID0gc3ltYm9sQ2FwdHVyZTtcbiAgICB9XG4gICAgY29uc3QgRVZFTlRfVEFSR0VUID0gX2dsb2JhbFsnRXZlbnRUYXJnZXQnXTtcbiAgICBpZiAoIUVWRU5UX1RBUkdFVCB8fCAhRVZFTlRfVEFSR0VULnByb3RvdHlwZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGFwaS5wYXRjaEV2ZW50VGFyZ2V0KF9nbG9iYWwsIGFwaSwgW0VWRU5UX1RBUkdFVCAmJiBFVkVOVF9UQVJHRVQucHJvdG90eXBlXSk7XG4gICAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBwYXRjaEV2ZW50KGdsb2JhbCwgYXBpKSB7XG4gICAgYXBpLnBhdGNoRXZlbnRQcm90b3R5cGUoZ2xvYmFsLCBhcGkpO1xufVxuXG4vKipcbiAqIEBmaWxlb3ZlcnZpZXdcbiAqIEBzdXBwcmVzcyB7Z2xvYmFsVGhpc31cbiAqL1xuZnVuY3Rpb24gZmlsdGVyUHJvcGVydGllcyh0YXJnZXQsIG9uUHJvcGVydGllcywgaWdub3JlUHJvcGVydGllcykge1xuICAgIGlmICghaWdub3JlUHJvcGVydGllcyB8fCBpZ25vcmVQcm9wZXJ0aWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gb25Qcm9wZXJ0aWVzO1xuICAgIH1cbiAgICBjb25zdCB0aXAgPSBpZ25vcmVQcm9wZXJ0aWVzLmZpbHRlcigoaXApID0+IGlwLnRhcmdldCA9PT0gdGFyZ2V0KTtcbiAgICBpZiAodGlwLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gb25Qcm9wZXJ0aWVzO1xuICAgIH1cbiAgICBjb25zdCB0YXJnZXRJZ25vcmVQcm9wZXJ0aWVzID0gdGlwWzBdLmlnbm9yZVByb3BlcnRpZXM7XG4gICAgcmV0dXJuIG9uUHJvcGVydGllcy5maWx0ZXIoKG9wKSA9PiB0YXJnZXRJZ25vcmVQcm9wZXJ0aWVzLmluZGV4T2Yob3ApID09PSAtMSk7XG59XG5mdW5jdGlvbiBwYXRjaEZpbHRlcmVkUHJvcGVydGllcyh0YXJnZXQsIG9uUHJvcGVydGllcywgaWdub3JlUHJvcGVydGllcywgcHJvdG90eXBlKSB7XG4gICAgLy8gY2hlY2sgd2hldGhlciB0YXJnZXQgaXMgYXZhaWxhYmxlLCBzb21ldGltZXMgdGFyZ2V0IHdpbGwgYmUgdW5kZWZpbmVkXG4gICAgLy8gYmVjYXVzZSBkaWZmZXJlbnQgYnJvd3NlciBvciBzb21lIDNyZCBwYXJ0eSBwbHVnaW4uXG4gICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmaWx0ZXJlZFByb3BlcnRpZXMgPSBmaWx0ZXJQcm9wZXJ0aWVzKHRhcmdldCwgb25Qcm9wZXJ0aWVzLCBpZ25vcmVQcm9wZXJ0aWVzKTtcbiAgICBwYXRjaE9uUHJvcGVydGllcyh0YXJnZXQsIGZpbHRlcmVkUHJvcGVydGllcywgcHJvdG90eXBlKTtcbn1cbi8qKlxuICogR2V0IGFsbCBldmVudCBuYW1lIHByb3BlcnRpZXMgd2hpY2ggdGhlIGV2ZW50IG5hbWUgc3RhcnRzV2l0aCBgb25gXG4gKiBmcm9tIHRoZSB0YXJnZXQgb2JqZWN0IGl0c2VsZiwgaW5oZXJpdGVkIHByb3BlcnRpZXMgYXJlIG5vdCBjb25zaWRlcmVkLlxuICovXG5mdW5jdGlvbiBnZXRPbkV2ZW50TmFtZXModGFyZ2V0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHRhcmdldClcbiAgICAgICAgLmZpbHRlcigobmFtZSkgPT4gbmFtZS5zdGFydHNXaXRoKCdvbicpICYmIG5hbWUubGVuZ3RoID4gMilcbiAgICAgICAgLm1hcCgobmFtZSkgPT4gbmFtZS5zdWJzdHJpbmcoMikpO1xufVxuZnVuY3Rpb24gcHJvcGVydHlEZXNjcmlwdG9yUGF0Y2goYXBpLCBfZ2xvYmFsKSB7XG4gICAgaWYgKGlzTm9kZSAmJiAhaXNNaXgpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoWm9uZVthcGkuc3ltYm9sKCdwYXRjaEV2ZW50cycpXSkge1xuICAgICAgICAvLyBldmVudHMgYXJlIGFscmVhZHkgYmVlbiBwYXRjaGVkIGJ5IGxlZ2FjeSBwYXRjaC5cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpZ25vcmVQcm9wZXJ0aWVzID0gX2dsb2JhbFsnX19ab25lX2lnbm9yZV9vbl9wcm9wZXJ0aWVzJ107XG4gICAgLy8gZm9yIGJyb3dzZXJzIHRoYXQgd2UgY2FuIHBhdGNoIHRoZSBkZXNjcmlwdG9yOiAgQ2hyb21lICYgRmlyZWZveFxuICAgIGxldCBwYXRjaFRhcmdldHMgPSBbXTtcbiAgICBpZiAoaXNCcm93c2VyKSB7XG4gICAgICAgIGNvbnN0IGludGVybmFsV2luZG93ID0gd2luZG93O1xuICAgICAgICBwYXRjaFRhcmdldHMgPSBwYXRjaFRhcmdldHMuY29uY2F0KFtcbiAgICAgICAgICAgICdEb2N1bWVudCcsXG4gICAgICAgICAgICAnU1ZHRWxlbWVudCcsXG4gICAgICAgICAgICAnRWxlbWVudCcsXG4gICAgICAgICAgICAnSFRNTEVsZW1lbnQnLFxuICAgICAgICAgICAgJ0hUTUxCb2R5RWxlbWVudCcsXG4gICAgICAgICAgICAnSFRNTE1lZGlhRWxlbWVudCcsXG4gICAgICAgICAgICAnSFRNTEZyYW1lU2V0RWxlbWVudCcsXG4gICAgICAgICAgICAnSFRNTEZyYW1lRWxlbWVudCcsXG4gICAgICAgICAgICAnSFRNTElGcmFtZUVsZW1lbnQnLFxuICAgICAgICAgICAgJ0hUTUxNYXJxdWVlRWxlbWVudCcsXG4gICAgICAgICAgICAnV29ya2VyJyxcbiAgICAgICAgXSk7XG4gICAgICAgIGNvbnN0IGlnbm9yZUVycm9yUHJvcGVydGllcyA9IFtdO1xuICAgICAgICAvLyBJbiBvbGRlciBicm93c2VycyBsaWtlIElFIG9yIEVkZ2UsIGV2ZW50IGhhbmRsZXIgcHJvcGVydGllcyAoZS5nLiwgYG9uY2xpY2tgKVxuICAgICAgICAvLyBtYXkgbm90IGJlIGRlZmluZWQgZGlyZWN0bHkgb24gdGhlIGB3aW5kb3dgIG9iamVjdCBidXQgb24gaXRzIHByb3RvdHlwZSAoYFdpbmRvd1Byb3RvdHlwZWApLlxuICAgICAgICAvLyBUbyBlbnN1cmUgY29tcGxldGUgY292ZXJhZ2UsIHdlIHVzZSB0aGUgcHJvdG90eXBlIHdoZW4gY2hlY2tpbmdcbiAgICAgICAgLy8gZm9yIGFuZCBwYXRjaGluZyB0aGVzZSBwcm9wZXJ0aWVzLlxuICAgICAgICBwYXRjaEZpbHRlcmVkUHJvcGVydGllcyhpbnRlcm5hbFdpbmRvdywgZ2V0T25FdmVudE5hbWVzKGludGVybmFsV2luZG93KSwgaWdub3JlUHJvcGVydGllcyA/IGlnbm9yZVByb3BlcnRpZXMuY29uY2F0KGlnbm9yZUVycm9yUHJvcGVydGllcykgOiBpZ25vcmVQcm9wZXJ0aWVzLCBPYmplY3RHZXRQcm90b3R5cGVPZihpbnRlcm5hbFdpbmRvdykpO1xuICAgIH1cbiAgICBwYXRjaFRhcmdldHMgPSBwYXRjaFRhcmdldHMuY29uY2F0KFtcbiAgICAgICAgJ1hNTEh0dHBSZXF1ZXN0JyxcbiAgICAgICAgJ1hNTEh0dHBSZXF1ZXN0RXZlbnRUYXJnZXQnLFxuICAgICAgICAnSURCSW5kZXgnLFxuICAgICAgICAnSURCUmVxdWVzdCcsXG4gICAgICAgICdJREJPcGVuREJSZXF1ZXN0JyxcbiAgICAgICAgJ0lEQkRhdGFiYXNlJyxcbiAgICAgICAgJ0lEQlRyYW5zYWN0aW9uJyxcbiAgICAgICAgJ0lEQkN1cnNvcicsXG4gICAgICAgICdXZWJTb2NrZXQnLFxuICAgIF0pO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGF0Y2hUYXJnZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IF9nbG9iYWxbcGF0Y2hUYXJnZXRzW2ldXTtcbiAgICAgICAgdGFyZ2V0Py5wcm90b3R5cGUgJiZcbiAgICAgICAgICAgIHBhdGNoRmlsdGVyZWRQcm9wZXJ0aWVzKHRhcmdldC5wcm90b3R5cGUsIGdldE9uRXZlbnROYW1lcyh0YXJnZXQucHJvdG90eXBlKSwgaWdub3JlUHJvcGVydGllcyk7XG4gICAgfVxufVxuXG4vKipcbiAqIEBmaWxlb3ZlcnZpZXdcbiAqIEBzdXBwcmVzcyB7bWlzc2luZ1JlcXVpcmV9XG4gKi9cbmZ1bmN0aW9uIHBhdGNoQnJvd3Nlcihab25lKSB7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ2xlZ2FjeScsIChnbG9iYWwpID0+IHtcbiAgICAgICAgY29uc3QgbGVnYWN5UGF0Y2ggPSBnbG9iYWxbWm9uZS5fX3N5bWJvbF9fKCdsZWdhY3lQYXRjaCcpXTtcbiAgICAgICAgaWYgKGxlZ2FjeVBhdGNoKSB7XG4gICAgICAgICAgICBsZWdhY3lQYXRjaCgpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ3RpbWVycycsIChnbG9iYWwpID0+IHtcbiAgICAgICAgY29uc3Qgc2V0ID0gJ3NldCc7XG4gICAgICAgIGNvbnN0IGNsZWFyID0gJ2NsZWFyJztcbiAgICAgICAgcGF0Y2hUaW1lcihnbG9iYWwsIHNldCwgY2xlYXIsICdUaW1lb3V0Jyk7XG4gICAgICAgIHBhdGNoVGltZXIoZ2xvYmFsLCBzZXQsIGNsZWFyLCAnSW50ZXJ2YWwnKTtcbiAgICAgICAgcGF0Y2hUaW1lcihnbG9iYWwsIHNldCwgY2xlYXIsICdJbW1lZGlhdGUnKTtcbiAgICB9KTtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgncmVxdWVzdEFuaW1hdGlvbkZyYW1lJywgKGdsb2JhbCkgPT4ge1xuICAgICAgICBwYXRjaFRpbWVyKGdsb2JhbCwgJ3JlcXVlc3QnLCAnY2FuY2VsJywgJ0FuaW1hdGlvbkZyYW1lJyk7XG4gICAgICAgIHBhdGNoVGltZXIoZ2xvYmFsLCAnbW96UmVxdWVzdCcsICdtb3pDYW5jZWwnLCAnQW5pbWF0aW9uRnJhbWUnKTtcbiAgICAgICAgcGF0Y2hUaW1lcihnbG9iYWwsICd3ZWJraXRSZXF1ZXN0JywgJ3dlYmtpdENhbmNlbCcsICdBbmltYXRpb25GcmFtZScpO1xuICAgIH0pO1xuICAgIFpvbmUuX19sb2FkX3BhdGNoKCdibG9ja2luZycsIChnbG9iYWwsIFpvbmUpID0+IHtcbiAgICAgICAgY29uc3QgYmxvY2tpbmdNZXRob2RzID0gWydhbGVydCcsICdwcm9tcHQnLCAnY29uZmlybSddO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJsb2NraW5nTWV0aG9kcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgbmFtZSA9IGJsb2NraW5nTWV0aG9kc1tpXTtcbiAgICAgICAgICAgIHBhdGNoTWV0aG9kKGdsb2JhbCwgbmFtZSwgKGRlbGVnYXRlLCBzeW1ib2wsIG5hbWUpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHMsIGFyZ3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFpvbmUuY3VycmVudC5ydW4oZGVsZWdhdGUsIGdsb2JhbCwgYXJncywgbmFtZSk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ0V2ZW50VGFyZ2V0JywgKGdsb2JhbCwgWm9uZSwgYXBpKSA9PiB7XG4gICAgICAgIHBhdGNoRXZlbnQoZ2xvYmFsLCBhcGkpO1xuICAgICAgICBldmVudFRhcmdldFBhdGNoKGdsb2JhbCwgYXBpKTtcbiAgICAgICAgLy8gcGF0Y2ggWE1MSHR0cFJlcXVlc3RFdmVudFRhcmdldCdzIGFkZEV2ZW50TGlzdGVuZXIvcmVtb3ZlRXZlbnRMaXN0ZW5lclxuICAgICAgICBjb25zdCBYTUxIdHRwUmVxdWVzdEV2ZW50VGFyZ2V0ID0gZ2xvYmFsWydYTUxIdHRwUmVxdWVzdEV2ZW50VGFyZ2V0J107XG4gICAgICAgIGlmIChYTUxIdHRwUmVxdWVzdEV2ZW50VGFyZ2V0ICYmIFhNTEh0dHBSZXF1ZXN0RXZlbnRUYXJnZXQucHJvdG90eXBlKSB7XG4gICAgICAgICAgICBhcGkucGF0Y2hFdmVudFRhcmdldChnbG9iYWwsIGFwaSwgW1hNTEh0dHBSZXF1ZXN0RXZlbnRUYXJnZXQucHJvdG90eXBlXSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgnTXV0YXRpb25PYnNlcnZlcicsIChnbG9iYWwsIFpvbmUsIGFwaSkgPT4ge1xuICAgICAgICBwYXRjaENsYXNzKCdNdXRhdGlvbk9ic2VydmVyJyk7XG4gICAgICAgIHBhdGNoQ2xhc3MoJ1dlYktpdE11dGF0aW9uT2JzZXJ2ZXInKTtcbiAgICB9KTtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgnSW50ZXJzZWN0aW9uT2JzZXJ2ZXInLCAoZ2xvYmFsLCBab25lLCBhcGkpID0+IHtcbiAgICAgICAgcGF0Y2hDbGFzcygnSW50ZXJzZWN0aW9uT2JzZXJ2ZXInKTtcbiAgICB9KTtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgnRmlsZVJlYWRlcicsIChnbG9iYWwsIFpvbmUsIGFwaSkgPT4ge1xuICAgICAgICBwYXRjaENsYXNzKCdGaWxlUmVhZGVyJyk7XG4gICAgfSk7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ29uX3Byb3BlcnR5JywgKGdsb2JhbCwgWm9uZSwgYXBpKSA9PiB7XG4gICAgICAgIHByb3BlcnR5RGVzY3JpcHRvclBhdGNoKGFwaSwgZ2xvYmFsKTtcbiAgICB9KTtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgnY3VzdG9tRWxlbWVudHMnLCAoZ2xvYmFsLCBab25lLCBhcGkpID0+IHtcbiAgICAgICAgcGF0Y2hDdXN0b21FbGVtZW50cyhnbG9iYWwsIGFwaSk7XG4gICAgfSk7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ1hIUicsIChnbG9iYWwsIFpvbmUpID0+IHtcbiAgICAgICAgLy8gVHJlYXQgWE1MSHR0cFJlcXVlc3QgYXMgYSBtYWNyb3Rhc2suXG4gICAgICAgIHBhdGNoWEhSKGdsb2JhbCk7XG4gICAgICAgIGNvbnN0IFhIUl9UQVNLID0gem9uZVN5bWJvbCgneGhyVGFzaycpO1xuICAgICAgICBjb25zdCBYSFJfU1lOQyA9IHpvbmVTeW1ib2woJ3hoclN5bmMnKTtcbiAgICAgICAgY29uc3QgWEhSX0xJU1RFTkVSID0gem9uZVN5bWJvbCgneGhyTGlzdGVuZXInKTtcbiAgICAgICAgY29uc3QgWEhSX1NDSEVEVUxFRCA9IHpvbmVTeW1ib2woJ3hoclNjaGVkdWxlZCcpO1xuICAgICAgICBjb25zdCBYSFJfVVJMID0gem9uZVN5bWJvbCgneGhyVVJMJyk7XG4gICAgICAgIGNvbnN0IFhIUl9FUlJPUl9CRUZPUkVfU0NIRURVTEVEID0gem9uZVN5bWJvbCgneGhyRXJyb3JCZWZvcmVTY2hlZHVsZWQnKTtcbiAgICAgICAgZnVuY3Rpb24gcGF0Y2hYSFIod2luZG93KSB7XG4gICAgICAgICAgICBjb25zdCBYTUxIdHRwUmVxdWVzdCA9IHdpbmRvd1snWE1MSHR0cFJlcXVlc3QnXTtcbiAgICAgICAgICAgIGlmICghWE1MSHR0cFJlcXVlc3QpIHtcbiAgICAgICAgICAgICAgICAvLyBYTUxIdHRwUmVxdWVzdCBpcyBub3QgYXZhaWxhYmxlIGluIHNlcnZpY2Ugd29ya2VyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgWE1MSHR0cFJlcXVlc3RQcm90b3R5cGUgPSBYTUxIdHRwUmVxdWVzdC5wcm90b3R5cGU7XG4gICAgICAgICAgICBmdW5jdGlvbiBmaW5kUGVuZGluZ1Rhc2sodGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhcmdldFtYSFJfVEFTS107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgb3JpQWRkTGlzdGVuZXIgPSBYTUxIdHRwUmVxdWVzdFByb3RvdHlwZVtaT05FX1NZTUJPTF9BRERfRVZFTlRfTElTVEVORVJdO1xuICAgICAgICAgICAgbGV0IG9yaVJlbW92ZUxpc3RlbmVyID0gWE1MSHR0cFJlcXVlc3RQcm90b3R5cGVbWk9ORV9TWU1CT0xfUkVNT1ZFX0VWRU5UX0xJU1RFTkVSXTtcbiAgICAgICAgICAgIGlmICghb3JpQWRkTGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBYTUxIdHRwUmVxdWVzdEV2ZW50VGFyZ2V0ID0gd2luZG93WydYTUxIdHRwUmVxdWVzdEV2ZW50VGFyZ2V0J107XG4gICAgICAgICAgICAgICAgaWYgKFhNTEh0dHBSZXF1ZXN0RXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgWE1MSHR0cFJlcXVlc3RFdmVudFRhcmdldFByb3RvdHlwZSA9IFhNTEh0dHBSZXF1ZXN0RXZlbnRUYXJnZXQucHJvdG90eXBlO1xuICAgICAgICAgICAgICAgICAgICBvcmlBZGRMaXN0ZW5lciA9IFhNTEh0dHBSZXF1ZXN0RXZlbnRUYXJnZXRQcm90b3R5cGVbWk9ORV9TWU1CT0xfQUREX0VWRU5UX0xJU1RFTkVSXTtcbiAgICAgICAgICAgICAgICAgICAgb3JpUmVtb3ZlTGlzdGVuZXIgPSBYTUxIdHRwUmVxdWVzdEV2ZW50VGFyZ2V0UHJvdG90eXBlW1pPTkVfU1lNQk9MX1JFTU9WRV9FVkVOVF9MSVNURU5FUl07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgUkVBRFlfU1RBVEVfQ0hBTkdFID0gJ3JlYWR5c3RhdGVjaGFuZ2UnO1xuICAgICAgICAgICAgY29uc3QgU0NIRURVTEVEID0gJ3NjaGVkdWxlZCc7XG4gICAgICAgICAgICBmdW5jdGlvbiBzY2hlZHVsZVRhc2sodGFzaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB0YXNrLmRhdGE7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZGF0YS50YXJnZXQ7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W1hIUl9TQ0hFRFVMRURdID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W1hIUl9FUlJPUl9CRUZPUkVfU0NIRURVTEVEXSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBleGlzdGluZyBldmVudCBsaXN0ZW5lclxuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RlbmVyID0gdGFyZ2V0W1hIUl9MSVNURU5FUl07XG4gICAgICAgICAgICAgICAgaWYgKCFvcmlBZGRMaXN0ZW5lcikge1xuICAgICAgICAgICAgICAgICAgICBvcmlBZGRMaXN0ZW5lciA9IHRhcmdldFtaT05FX1NZTUJPTF9BRERfRVZFTlRfTElTVEVORVJdO1xuICAgICAgICAgICAgICAgICAgICBvcmlSZW1vdmVMaXN0ZW5lciA9IHRhcmdldFtaT05FX1NZTUJPTF9SRU1PVkVfRVZFTlRfTElTVEVORVJdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgb3JpUmVtb3ZlTGlzdGVuZXIuY2FsbCh0YXJnZXQsIFJFQURZX1NUQVRFX0NIQU5HRSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBuZXdMaXN0ZW5lciA9ICh0YXJnZXRbWEhSX0xJU1RFTkVSXSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhcmdldC5yZWFkeVN0YXRlID09PSB0YXJnZXQuRE9ORSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc29tZXRpbWVzIG9uIHNvbWUgYnJvd3NlcnMgWE1MSHR0cFJlcXVlc3Qgd2lsbCBmaXJlIG9ucmVhZHlzdGF0ZWNoYW5nZSB3aXRoXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyByZWFkeVN0YXRlPTQgbXVsdGlwbGUgdGltZXMsIHNvIHdlIG5lZWQgdG8gY2hlY2sgdGFzayBzdGF0ZSBoZXJlXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRhdGEuYWJvcnRlZCAmJiB0YXJnZXRbWEhSX1NDSEVEVUxFRF0gJiYgdGFzay5zdGF0ZSA9PT0gU0NIRURVTEVEKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgeGhyIGhhcyByZWdpc3RlcmVkIG9ubG9hZCBsaXN0ZW5lclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoYXQgaXMgdGhlIGNhc2UsIHRoZSB0YXNrIHNob3VsZCBpbnZva2UgYWZ0ZXIgYWxsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb25sb2FkIGxpc3RlbmVycyBmaW5pc2guXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWxzbyBpZiB0aGUgcmVxdWVzdCBmYWlsZWQgd2l0aG91dCByZXNwb25zZSAoc3RhdHVzID0gMCksIHRoZSBsb2FkIGV2ZW50IGhhbmRsZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB3aWxsIG5vdCBiZSB0cmlnZ2VyZWQsIGluIHRoYXQgY2FzZSwgd2Ugc2hvdWxkIGFsc28gaW52b2tlIHRoZSBwbGFjZWhvbGRlciBjYWxsYmFja1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRvIGNsb3NlIHRoZSBYTUxIdHRwUmVxdWVzdDo6c2VuZCBtYWNyb1Rhc2suXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci9pc3N1ZXMvMzg3OTVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsb2FkVGFza3MgPSB0YXJnZXRbWm9uZS5fX3N5bWJvbF9fKCdsb2FkZmFsc2UnKV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRhcmdldC5zdGF0dXMgIT09IDAgJiYgbG9hZFRhc2tzICYmIGxvYWRUYXNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9yaUludm9rZSA9IHRhc2suaW52b2tlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXNrLmludm9rZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5lZWQgdG8gbG9hZCB0aGUgdGFza3MgYWdhaW4sIGJlY2F1c2UgaW4gb3RoZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxvYWQgbGlzdGVuZXIsIHRoZXkgbWF5IHJlbW92ZSB0aGVtc2VsdmVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsb2FkVGFza3MgPSB0YXJnZXRbWm9uZS5fX3N5bWJvbF9fKCdsb2FkZmFsc2UnKV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxvYWRUYXNrcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsb2FkVGFza3NbaV0gPT09IHRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZFRhc2tzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWRhdGEuYWJvcnRlZCAmJiB0YXNrLnN0YXRlID09PSBTQ0hFRFVMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlJbnZva2UuY2FsbCh0YXNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZFRhc2tzLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXNrLmludm9rZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKCFkYXRhLmFib3J0ZWQgJiYgdGFyZ2V0W1hIUl9TQ0hFRFVMRURdID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVycm9yIG9jY3VycyB3aGVuIHhoci5zZW5kKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRbWEhSX0VSUk9SX0JFRk9SRV9TQ0hFRFVMRURdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIG9yaUFkZExpc3RlbmVyLmNhbGwodGFyZ2V0LCBSRUFEWV9TVEFURV9DSEFOR0UsIG5ld0xpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdG9yZWRUYXNrID0gdGFyZ2V0W1hIUl9UQVNLXTtcbiAgICAgICAgICAgICAgICBpZiAoIXN0b3JlZFRhc2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0W1hIUl9UQVNLXSA9IHRhc2s7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbmROYXRpdmUuYXBwbHkodGFyZ2V0LCBkYXRhLmFyZ3MpO1xuICAgICAgICAgICAgICAgIHRhcmdldFtYSFJfU0NIRURVTEVEXSA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2s7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdW5jdGlvbiBwbGFjZWhvbGRlckNhbGxiYWNrKCkgeyB9XG4gICAgICAgICAgICBmdW5jdGlvbiBjbGVhclRhc2sodGFzaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB0YXNrLmRhdGE7XG4gICAgICAgICAgICAgICAgLy8gTm90ZSAtIGlkZWFsbHksIHdlIHdvdWxkIGNhbGwgZGF0YS50YXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lciBoZXJlLCBidXQgaXQncyB0b28gbGF0ZVxuICAgICAgICAgICAgICAgIC8vIHRvIHByZXZlbnQgaXQgZnJvbSBmaXJpbmcuIFNvIGluc3RlYWQsIHdlIHN0b3JlIGluZm8gZm9yIHRoZSBldmVudCBsaXN0ZW5lci5cbiAgICAgICAgICAgICAgICBkYXRhLmFib3J0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybiBhYm9ydE5hdGl2ZS5hcHBseShkYXRhLnRhcmdldCwgZGF0YS5hcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG9wZW5OYXRpdmUgPSBwYXRjaE1ldGhvZChYTUxIdHRwUmVxdWVzdFByb3RvdHlwZSwgJ29wZW4nLCAoKSA9PiBmdW5jdGlvbiAoc2VsZiwgYXJncykge1xuICAgICAgICAgICAgICAgIHNlbGZbWEhSX1NZTkNdID0gYXJnc1syXSA9PSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmW1hIUl9VUkxdID0gYXJnc1sxXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3Blbk5hdGl2ZS5hcHBseShzZWxmLCBhcmdzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgWE1MSFRUUFJFUVVFU1RfU09VUkNFID0gJ1hNTEh0dHBSZXF1ZXN0LnNlbmQnO1xuICAgICAgICAgICAgY29uc3QgZmV0Y2hUYXNrQWJvcnRpbmcgPSB6b25lU3ltYm9sKCdmZXRjaFRhc2tBYm9ydGluZycpO1xuICAgICAgICAgICAgY29uc3QgZmV0Y2hUYXNrU2NoZWR1bGluZyA9IHpvbmVTeW1ib2woJ2ZldGNoVGFza1NjaGVkdWxpbmcnKTtcbiAgICAgICAgICAgIGNvbnN0IHNlbmROYXRpdmUgPSBwYXRjaE1ldGhvZChYTUxIdHRwUmVxdWVzdFByb3RvdHlwZSwgJ3NlbmQnLCAoKSA9PiBmdW5jdGlvbiAoc2VsZiwgYXJncykge1xuICAgICAgICAgICAgICAgIGlmIChab25lLmN1cnJlbnRbZmV0Y2hUYXNrU2NoZWR1bGluZ10gPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYSBmZXRjaCBpcyBzY2hlZHVsaW5nLCBzbyB3ZSBhcmUgdXNpbmcgeGhyIHRvIHBvbHlmaWxsIGZldGNoXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCBiZWNhdXNlIHdlIGFscmVhZHkgc2NoZWR1bGUgbWFjcm9UYXNrIGZvciBmZXRjaCwgd2Ugc2hvdWxkXG4gICAgICAgICAgICAgICAgICAgIC8vIG5vdCBzY2hlZHVsZSBhIG1hY3JvVGFzayBmb3IgeGhyIGFnYWluXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzZW5kTmF0aXZlLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2VsZltYSFJfU1lOQ10pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIFhIUiBpcyBzeW5jIHRoZXJlIGlzIG5vIHRhc2sgdG8gc2NoZWR1bGUsIGp1c3QgZXhlY3V0ZSB0aGUgY29kZS5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNlbmROYXRpdmUuYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBzZWxmLFxuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBzZWxmW1hIUl9VUkxdLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNQZXJpb2RpYzogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzOiBhcmdzLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWJvcnRlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhc2sgPSBzY2hlZHVsZU1hY3JvVGFza1dpdGhDdXJyZW50Wm9uZShYTUxIVFRQUkVRVUVTVF9TT1VSQ0UsIHBsYWNlaG9sZGVyQ2FsbGJhY2ssIG9wdGlvbnMsIHNjaGVkdWxlVGFzaywgY2xlYXJUYXNrKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGYgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGZbWEhSX0VSUk9SX0JFRk9SRV9TQ0hFRFVMRURdID09PSB0cnVlICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAhb3B0aW9ucy5hYm9ydGVkICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB0YXNrLnN0YXRlID09PSBTQ0hFRFVMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHhociByZXF1ZXN0IHRocm93IGVycm9yIHdoZW4gc2VuZFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIGludm9rZSB0YXNrIGluc3RlYWQgb2YgbGVhdmluZyBhIHNjaGVkdWxlZFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcGVuZGluZyBtYWNyb1Rhc2tcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2suaW52b2tlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGFib3J0TmF0aXZlID0gcGF0Y2hNZXRob2QoWE1MSHR0cFJlcXVlc3RQcm90b3R5cGUsICdhYm9ydCcsICgpID0+IGZ1bmN0aW9uIChzZWxmLCBhcmdzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFzayA9IGZpbmRQZW5kaW5nVGFzayhzZWxmKTtcbiAgICAgICAgICAgICAgICBpZiAodGFzayAmJiB0eXBlb2YgdGFzay50eXBlID09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSBYSFIgaGFzIGFscmVhZHkgY29tcGxldGVkLCBkbyBub3RoaW5nLlxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgWEhSIGhhcyBhbHJlYWR5IGJlZW4gYWJvcnRlZCwgZG8gbm90aGluZy5cbiAgICAgICAgICAgICAgICAgICAgLy8gRml4ICM1NjksIGNhbGwgYWJvcnQgbXVsdGlwbGUgdGltZXMgYmVmb3JlIGRvbmUgd2lsbCBjYXVzZVxuICAgICAgICAgICAgICAgICAgICAvLyBtYWNyb1Rhc2sgdGFzayBjb3VudCBiZSBuZWdhdGl2ZSBudW1iZXJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhc2suY2FuY2VsRm4gPT0gbnVsbCB8fCAodGFzay5kYXRhICYmIHRhc2suZGF0YS5hYm9ydGVkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRhc2suem9uZS5jYW5jZWxUYXNrKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChab25lLmN1cnJlbnRbZmV0Y2hUYXNrQWJvcnRpbmddID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSBhYm9ydCBpcyBjYWxsZWQgZnJvbSBmZXRjaCBwb2x5ZmlsbCwgd2UgbmVlZCB0byBjYWxsIG5hdGl2ZSBhYm9ydCBvZiBYSFIuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhYm9ydE5hdGl2ZS5hcHBseShzZWxmLCBhcmdzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlLCB3ZSBhcmUgdHJ5aW5nIHRvIGFib3J0IGFuIFhIUiB3aGljaCBoYXMgbm90IHlldCBiZWVuIHNlbnQsIHNvIHRoZXJlIGlzIG5vXG4gICAgICAgICAgICAgICAgLy8gdGFza1xuICAgICAgICAgICAgICAgIC8vIHRvIGNhbmNlbC4gRG8gbm90aGluZy5cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ2dlb2xvY2F0aW9uJywgKGdsb2JhbCkgPT4ge1xuICAgICAgICAvLy8gR0VPX0xPQ0FUSU9OXG4gICAgICAgIGlmIChnbG9iYWxbJ25hdmlnYXRvciddICYmIGdsb2JhbFsnbmF2aWdhdG9yJ10uZ2VvbG9jYXRpb24pIHtcbiAgICAgICAgICAgIHBhdGNoUHJvdG90eXBlKGdsb2JhbFsnbmF2aWdhdG9yJ10uZ2VvbG9jYXRpb24sIFsnZ2V0Q3VycmVudFBvc2l0aW9uJywgJ3dhdGNoUG9zaXRpb24nXSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgnUHJvbWlzZVJlamVjdGlvbkV2ZW50JywgKGdsb2JhbCwgWm9uZSkgPT4ge1xuICAgICAgICAvLyBoYW5kbGUgdW5oYW5kbGVkIHByb21pc2UgcmVqZWN0aW9uXG4gICAgICAgIGZ1bmN0aW9uIGZpbmRQcm9taXNlUmVqZWN0aW9uSGFuZGxlcihldnROYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBldmVudFRhc2tzID0gZmluZEV2ZW50VGFza3MoZ2xvYmFsLCBldnROYW1lKTtcbiAgICAgICAgICAgICAgICBldmVudFRhc2tzLmZvckVhY2goKGV2ZW50VGFzaykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAvLyB3aW5kb3dzIGhhcyBhZGRlZCB1bmhhbmRsZWRyZWplY3Rpb24gZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gdHJpZ2dlciB0aGUgZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgUHJvbWlzZVJlamVjdGlvbkV2ZW50ID0gZ2xvYmFsWydQcm9taXNlUmVqZWN0aW9uRXZlbnQnXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKFByb21pc2VSZWplY3Rpb25FdmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXZ0ID0gbmV3IFByb21pc2VSZWplY3Rpb25FdmVudChldnROYW1lLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvbWlzZTogZS5wcm9taXNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlYXNvbjogZS5yZWplY3Rpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50VGFzay5pbnZva2UoZXZ0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ2xvYmFsWydQcm9taXNlUmVqZWN0aW9uRXZlbnQnXSkge1xuICAgICAgICAgICAgWm9uZVt6b25lU3ltYm9sKCd1bmhhbmRsZWRQcm9taXNlUmVqZWN0aW9uSGFuZGxlcicpXSA9XG4gICAgICAgICAgICAgICAgZmluZFByb21pc2VSZWplY3Rpb25IYW5kbGVyKCd1bmhhbmRsZWRyZWplY3Rpb24nKTtcbiAgICAgICAgICAgIFpvbmVbem9uZVN5bWJvbCgncmVqZWN0aW9uSGFuZGxlZEhhbmRsZXInKV0gPVxuICAgICAgICAgICAgICAgIGZpbmRQcm9taXNlUmVqZWN0aW9uSGFuZGxlcigncmVqZWN0aW9uaGFuZGxlZCcpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgWm9uZS5fX2xvYWRfcGF0Y2goJ3F1ZXVlTWljcm90YXNrJywgKGdsb2JhbCwgWm9uZSwgYXBpKSA9PiB7XG4gICAgICAgIHBhdGNoUXVldWVNaWNyb3Rhc2soZ2xvYmFsLCBhcGkpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBwYXRjaFByb21pc2UoWm9uZSkge1xuICAgIFpvbmUuX19sb2FkX3BhdGNoKCdab25lQXdhcmVQcm9taXNlJywgKGdsb2JhbCwgWm9uZSwgYXBpKSA9PiB7XG4gICAgICAgIGNvbnN0IE9iamVjdEdldE93blByb3BlcnR5RGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3I7XG4gICAgICAgIGNvbnN0IE9iamVjdERlZmluZVByb3BlcnR5ID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xuICAgICAgICBmdW5jdGlvbiByZWFkYWJsZU9iamVjdFRvU3RyaW5nKG9iaikge1xuICAgICAgICAgICAgaWYgKG9iaiAmJiBvYmoudG9TdHJpbmcgPT09IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBvYmouY29uc3RydWN0b3IgJiYgb2JqLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChjbGFzc05hbWUgPyBjbGFzc05hbWUgOiAnJykgKyAnOiAnICsgSlNPTi5zdHJpbmdpZnkob2JqKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvYmogPyBvYmoudG9TdHJpbmcoKSA6IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IF9fc3ltYm9sX18gPSBhcGkuc3ltYm9sO1xuICAgICAgICBjb25zdCBfdW5jYXVnaHRQcm9taXNlRXJyb3JzID0gW107XG4gICAgICAgIGNvbnN0IGlzRGlzYWJsZVdyYXBwaW5nVW5jYXVnaHRQcm9taXNlUmVqZWN0aW9uID0gZ2xvYmFsW19fc3ltYm9sX18oJ0RJU0FCTEVfV1JBUFBJTkdfVU5DQVVHSFRfUFJPTUlTRV9SRUpFQ1RJT04nKV0gIT09IGZhbHNlO1xuICAgICAgICBjb25zdCBzeW1ib2xQcm9taXNlID0gX19zeW1ib2xfXygnUHJvbWlzZScpO1xuICAgICAgICBjb25zdCBzeW1ib2xUaGVuID0gX19zeW1ib2xfXygndGhlbicpO1xuICAgICAgICBjb25zdCBjcmVhdGlvblRyYWNlID0gJ19fY3JlYXRpb25UcmFjZV9fJztcbiAgICAgICAgYXBpLm9uVW5oYW5kbGVkRXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGFwaS5zaG93VW5jYXVnaHRFcnJvcigpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVqZWN0aW9uID0gZSAmJiBlLnJlamVjdGlvbjtcbiAgICAgICAgICAgICAgICBpZiAocmVqZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1VuaGFuZGxlZCBQcm9taXNlIHJlamVjdGlvbjonLCByZWplY3Rpb24gaW5zdGFuY2VvZiBFcnJvciA/IHJlamVjdGlvbi5tZXNzYWdlIDogcmVqZWN0aW9uLCAnOyBab25lOicsIGUuem9uZS5uYW1lLCAnOyBUYXNrOicsIGUudGFzayAmJiBlLnRhc2suc291cmNlLCAnOyBWYWx1ZTonLCByZWplY3Rpb24sIHJlamVjdGlvbiBpbnN0YW5jZW9mIEVycm9yID8gcmVqZWN0aW9uLnN0YWNrIDogdW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBhcGkubWljcm90YXNrRHJhaW5Eb25lID0gKCkgPT4ge1xuICAgICAgICAgICAgd2hpbGUgKF91bmNhdWdodFByb21pc2VFcnJvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5jYXVnaHRQcm9taXNlRXJyb3IgPSBfdW5jYXVnaHRQcm9taXNlRXJyb3JzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgdW5jYXVnaHRQcm9taXNlRXJyb3Iuem9uZS5ydW5HdWFyZGVkKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1bmNhdWdodFByb21pc2VFcnJvci50aHJvd09yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgdW5jYXVnaHRQcm9taXNlRXJyb3IucmVqZWN0aW9uO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgdW5jYXVnaHRQcm9taXNlRXJyb3I7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlVW5oYW5kbGVkUmVqZWN0aW9uKGVycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IFVOSEFORExFRF9QUk9NSVNFX1JFSkVDVElPTl9IQU5ETEVSX1NZTUJPTCA9IF9fc3ltYm9sX18oJ3VuaGFuZGxlZFByb21pc2VSZWplY3Rpb25IYW5kbGVyJyk7XG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZVVuaGFuZGxlZFJlamVjdGlvbihlKSB7XG4gICAgICAgICAgICBhcGkub25VbmhhbmRsZWRFcnJvcihlKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlciA9IFpvbmVbVU5IQU5ETEVEX1BST01JU0VfUkVKRUNUSU9OX0hBTkRMRVJfU1lNQk9MXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHsgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGlzVGhlbmFibGUodmFsdWUpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUudGhlbiA9PT0gJ2Z1bmN0aW9uJztcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBmb3J3YXJkUmVzb2x1dGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGZvcndhcmRSZWplY3Rpb24ocmVqZWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gWm9uZUF3YXJlUHJvbWlzZS5yZWplY3QocmVqZWN0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzeW1ib2xTdGF0ZSA9IF9fc3ltYm9sX18oJ3N0YXRlJyk7XG4gICAgICAgIGNvbnN0IHN5bWJvbFZhbHVlID0gX19zeW1ib2xfXygndmFsdWUnKTtcbiAgICAgICAgY29uc3Qgc3ltYm9sRmluYWxseSA9IF9fc3ltYm9sX18oJ2ZpbmFsbHknKTtcbiAgICAgICAgY29uc3Qgc3ltYm9sUGFyZW50UHJvbWlzZVZhbHVlID0gX19zeW1ib2xfXygncGFyZW50UHJvbWlzZVZhbHVlJyk7XG4gICAgICAgIGNvbnN0IHN5bWJvbFBhcmVudFByb21pc2VTdGF0ZSA9IF9fc3ltYm9sX18oJ3BhcmVudFByb21pc2VTdGF0ZScpO1xuICAgICAgICBjb25zdCBzb3VyY2UgPSAnUHJvbWlzZS50aGVuJztcbiAgICAgICAgY29uc3QgVU5SRVNPTFZFRCA9IG51bGw7XG4gICAgICAgIGNvbnN0IFJFU09MVkVEID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgUkVKRUNURUQgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgUkVKRUNURURfTk9fQ0FUQ0ggPSAwO1xuICAgICAgICBmdW5jdGlvbiBtYWtlUmVzb2x2ZXIocHJvbWlzZSwgc3RhdGUpIHtcbiAgICAgICAgICAgIHJldHVybiAodikgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVQcm9taXNlKHByb21pc2UsIHN0YXRlLCB2KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlUHJvbWlzZShwcm9taXNlLCBmYWxzZSwgZXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gRG8gbm90IHJldHVybiB2YWx1ZSBvciB5b3Ugd2lsbCBicmVhayB0aGUgUHJvbWlzZSBzcGVjLlxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvbmNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbGV0IHdhc0NhbGxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIod3JhcHBlZEZ1bmN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHdhc0NhbGxlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHdhc0NhbGxlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHdyYXBwZWRGdW5jdGlvbi5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBUWVBFX0VSUk9SID0gJ1Byb21pc2UgcmVzb2x2ZWQgd2l0aCBpdHNlbGYnO1xuICAgICAgICBjb25zdCBDVVJSRU5UX1RBU0tfVFJBQ0VfU1lNQk9MID0gX19zeW1ib2xfXygnY3VycmVudFRhc2tUcmFjZScpO1xuICAgICAgICAvLyBQcm9taXNlIFJlc29sdXRpb25cbiAgICAgICAgZnVuY3Rpb24gcmVzb2x2ZVByb21pc2UocHJvbWlzZSwgc3RhdGUsIHZhbHVlKSB7XG4gICAgICAgICAgICBjb25zdCBvbmNlV3JhcHBlciA9IG9uY2UoKTtcbiAgICAgICAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoVFlQRV9FUlJPUik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocHJvbWlzZVtzeW1ib2xTdGF0ZV0gPT09IFVOUkVTT0xWRUQpIHtcbiAgICAgICAgICAgICAgICAvLyBzaG91bGQgb25seSBnZXQgdmFsdWUudGhlbiBvbmNlIGJhc2VkIG9uIHByb21pc2Ugc3BlYy5cbiAgICAgICAgICAgICAgICBsZXQgdGhlbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgfHwgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGVuID0gdmFsdWUgJiYgdmFsdWUudGhlbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIG9uY2VXcmFwcGVyKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVQcm9taXNlKHByb21pc2UsIGZhbHNlLCBlcnIpO1xuICAgICAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gaWYgKHZhbHVlIGluc3RhbmNlb2YgWm9uZUF3YXJlUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZSAhPT0gUkVKRUNURUQgJiZcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgaW5zdGFuY2VvZiBab25lQXdhcmVQcm9taXNlICYmXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlLmhhc093blByb3BlcnR5KHN5bWJvbFN0YXRlKSAmJlxuICAgICAgICAgICAgICAgICAgICB2YWx1ZS5oYXNPd25Qcm9wZXJ0eShzeW1ib2xWYWx1ZSkgJiZcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVbc3ltYm9sU3RhdGVdICE9PSBVTlJFU09MVkVEKSB7XG4gICAgICAgICAgICAgICAgICAgIGNsZWFyUmVqZWN0ZWROb0NhdGNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZVByb21pc2UocHJvbWlzZSwgdmFsdWVbc3ltYm9sU3RhdGVdLCB2YWx1ZVtzeW1ib2xWYWx1ZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdGF0ZSAhPT0gUkVKRUNURUQgJiYgdHlwZW9mIHRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoZW4uY2FsbCh2YWx1ZSwgb25jZVdyYXBwZXIobWFrZVJlc29sdmVyKHByb21pc2UsIHN0YXRlKSksIG9uY2VXcmFwcGVyKG1ha2VSZXNvbHZlcihwcm9taXNlLCBmYWxzZSkpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvbmNlV3JhcHBlcigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZVByb21pc2UocHJvbWlzZSwgZmFsc2UsIGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcm9taXNlW3N5bWJvbFN0YXRlXSA9IHN0YXRlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBxdWV1ZSA9IHByb21pc2Vbc3ltYm9sVmFsdWVdO1xuICAgICAgICAgICAgICAgICAgICBwcm9taXNlW3N5bWJvbFZhbHVlXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvbWlzZVtzeW1ib2xGaW5hbGx5XSA9PT0gc3ltYm9sRmluYWxseSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHByb21pc2UgaXMgZ2VuZXJhdGVkIGJ5IFByb21pc2UucHJvdG90eXBlLmZpbmFsbHlcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZSA9PT0gUkVTT0xWRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgc3RhdGUgaXMgcmVzb2x2ZWQsIHNob3VsZCBpZ25vcmUgdGhlIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHVzZSBwYXJlbnQgcHJvbWlzZSB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb21pc2Vbc3ltYm9sU3RhdGVdID0gcHJvbWlzZVtzeW1ib2xQYXJlbnRQcm9taXNlU3RhdGVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb21pc2Vbc3ltYm9sVmFsdWVdID0gcHJvbWlzZVtzeW1ib2xQYXJlbnRQcm9taXNlVmFsdWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIHJlY29yZCB0YXNrIGluZm9ybWF0aW9uIGluIHZhbHVlIHdoZW4gZXJyb3Igb2NjdXJzLCBzbyB3ZSBjYW5cbiAgICAgICAgICAgICAgICAgICAgLy8gZG8gc29tZSBhZGRpdGlvbmFsIHdvcmsgc3VjaCBhcyByZW5kZXIgbG9uZ1N0YWNrVHJhY2VcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlID09PSBSRUpFQ1RFRCAmJiB2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiBsb25nU3RhY2tUcmFjZVpvbmUgaXMgaGVyZVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdHJhY2UgPSBab25lLmN1cnJlbnRUYXNrICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWm9uZS5jdXJyZW50VGFzay5kYXRhICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgWm9uZS5jdXJyZW50VGFzay5kYXRhW2NyZWF0aW9uVHJhY2VdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRyYWNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb25seSBrZWVwIHRoZSBsb25nIHN0YWNrIHRyYWNlIGludG8gZXJyb3Igd2hlbiBpbiBsb25nU3RhY2tUcmFjZVpvbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBPYmplY3REZWZpbmVQcm9wZXJ0eSh2YWx1ZSwgQ1VSUkVOVF9UQVNLX1RSQUNFX1NZTUJPTCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHRyYWNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NoZWR1bGVSZXNvbHZlT3JSZWplY3QocHJvbWlzZSwgcXVldWVbaSsrXSwgcXVldWVbaSsrXSwgcXVldWVbaSsrXSwgcXVldWVbaSsrXSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA9PSAwICYmIHN0YXRlID09IFJFSkVDVEVEKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9taXNlW3N5bWJvbFN0YXRlXSA9IFJFSkVDVEVEX05PX0NBVENIO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHVuY2F1Z2h0UHJvbWlzZUVycm9yID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEhlcmUgd2UgdGhyb3dzIGEgbmV3IEVycm9yIHRvIHByaW50IG1vcmUgcmVhZGFibGUgZXJyb3IgbG9nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gYW5kIGlmIHRoZSB2YWx1ZSBpcyBub3QgYW4gZXJyb3IsIHpvbmUuanMgYnVpbGRzIGFuIGBFcnJvcmBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBPYmplY3QgaGVyZSB0byBhdHRhY2ggdGhlIHN0YWNrIGluZm9ybWF0aW9uLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5jYXVnaHQgKGluIHByb21pc2UpOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVhZGFibGVPYmplY3RUb1N0cmluZyh2YWx1ZSkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAodmFsdWUgJiYgdmFsdWUuc3RhY2sgPyAnXFxuJyArIHZhbHVlLnN0YWNrIDogJycpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmNhdWdodFByb21pc2VFcnJvciA9IGVycjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0Rpc2FibGVXcmFwcGluZ1VuY2F1Z2h0UHJvbWlzZVJlamVjdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGRpc2FibGUgd3JhcHBpbmcgdW5jYXVnaHQgcHJvbWlzZSByZWplY3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB1c2UgdGhlIHZhbHVlIGluc3RlYWQgb2Ygd3JhcHBpbmcgaXQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5jYXVnaHRQcm9taXNlRXJyb3IudGhyb3dPcmlnaW5hbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmNhdWdodFByb21pc2VFcnJvci5yZWplY3Rpb24gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuY2F1Z2h0UHJvbWlzZUVycm9yLnByb21pc2UgPSBwcm9taXNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5jYXVnaHRQcm9taXNlRXJyb3Iuem9uZSA9IFpvbmUuY3VycmVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVuY2F1Z2h0UHJvbWlzZUVycm9yLnRhc2sgPSBab25lLmN1cnJlbnRUYXNrO1xuICAgICAgICAgICAgICAgICAgICAgICAgX3VuY2F1Z2h0UHJvbWlzZUVycm9ycy5wdXNoKHVuY2F1Z2h0UHJvbWlzZUVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5zY2hlZHVsZU1pY3JvVGFzaygpOyAvLyB0byBtYWtlIHN1cmUgdGhhdCBpdCBpcyBydW5uaW5nXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSZXNvbHZpbmcgYW4gYWxyZWFkeSByZXNvbHZlZCBwcm9taXNlIGlzIGEgbm9vcC5cbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IFJFSkVDVElPTl9IQU5ETEVEX0hBTkRMRVIgPSBfX3N5bWJvbF9fKCdyZWplY3Rpb25IYW5kbGVkSGFuZGxlcicpO1xuICAgICAgICBmdW5jdGlvbiBjbGVhclJlamVjdGVkTm9DYXRjaChwcm9taXNlKSB7XG4gICAgICAgICAgICBpZiAocHJvbWlzZVtzeW1ib2xTdGF0ZV0gPT09IFJFSkVDVEVEX05PX0NBVENIKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQgbm8gY2F0Y2ggc3RhdHVzXG4gICAgICAgICAgICAgICAgLy8gYW5kIHF1ZXVlLmxlbmd0aCA+IDAsIG1lYW5zIHRoZXJlIGlzIGEgZXJyb3IgaGFuZGxlclxuICAgICAgICAgICAgICAgIC8vIGhlcmUgdG8gaGFuZGxlIHRoZSByZWplY3RlZCBwcm9taXNlLCB3ZSBzaG91bGQgdHJpZ2dlclxuICAgICAgICAgICAgICAgIC8vIHdpbmRvd3MucmVqZWN0aW9uaGFuZGxlZCBldmVudEhhbmRsZXIgb3Igbm9kZWpzIHJlamVjdGlvbkhhbmRsZWRcbiAgICAgICAgICAgICAgICAvLyBldmVudEhhbmRsZXJcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGVyID0gWm9uZVtSRUpFQ1RJT05fSEFORExFRF9IQU5ETEVSXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZXIgJiYgdHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCB7IHJlamVjdGlvbjogcHJvbWlzZVtzeW1ib2xWYWx1ZV0sIHByb21pc2U6IHByb21pc2UgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycikgeyB9XG4gICAgICAgICAgICAgICAgcHJvbWlzZVtzeW1ib2xTdGF0ZV0gPSBSRUpFQ1RFRDtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IF91bmNhdWdodFByb21pc2VFcnJvcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb21pc2UgPT09IF91bmNhdWdodFByb21pc2VFcnJvcnNbaV0ucHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX3VuY2F1Z2h0UHJvbWlzZUVycm9ycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gc2NoZWR1bGVSZXNvbHZlT3JSZWplY3QocHJvbWlzZSwgem9uZSwgY2hhaW5Qcm9taXNlLCBvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCkge1xuICAgICAgICAgICAgY2xlYXJSZWplY3RlZE5vQ2F0Y2gocHJvbWlzZSk7XG4gICAgICAgICAgICBjb25zdCBwcm9taXNlU3RhdGUgPSBwcm9taXNlW3N5bWJvbFN0YXRlXTtcbiAgICAgICAgICAgIGNvbnN0IGRlbGVnYXRlID0gcHJvbWlzZVN0YXRlXG4gICAgICAgICAgICAgICAgPyB0eXBlb2Ygb25GdWxmaWxsZWQgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICAgICAgPyBvbkZ1bGZpbGxlZFxuICAgICAgICAgICAgICAgICAgICA6IGZvcndhcmRSZXNvbHV0aW9uXG4gICAgICAgICAgICAgICAgOiB0eXBlb2Ygb25SZWplY3RlZCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgICAgICA/IG9uUmVqZWN0ZWRcbiAgICAgICAgICAgICAgICAgICAgOiBmb3J3YXJkUmVqZWN0aW9uO1xuICAgICAgICAgICAgem9uZS5zY2hlZHVsZU1pY3JvVGFzayhzb3VyY2UsICgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnRQcm9taXNlVmFsdWUgPSBwcm9taXNlW3N5bWJvbFZhbHVlXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNGaW5hbGx5UHJvbWlzZSA9ICEhY2hhaW5Qcm9taXNlICYmIHN5bWJvbEZpbmFsbHkgPT09IGNoYWluUHJvbWlzZVtzeW1ib2xGaW5hbGx5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzRmluYWxseVByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBwcm9taXNlIGlzIGdlbmVyYXRlZCBmcm9tIGZpbmFsbHkgY2FsbCwga2VlcCBwYXJlbnQgcHJvbWlzZSdzIHN0YXRlIGFuZCB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhaW5Qcm9taXNlW3N5bWJvbFBhcmVudFByb21pc2VWYWx1ZV0gPSBwYXJlbnRQcm9taXNlVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFpblByb21pc2Vbc3ltYm9sUGFyZW50UHJvbWlzZVN0YXRlXSA9IHByb21pc2VTdGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBzaG91bGQgbm90IHBhc3MgdmFsdWUgdG8gZmluYWxseSBjYWxsYmFja1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHpvbmUucnVuKGRlbGVnYXRlLCB1bmRlZmluZWQsIGlzRmluYWxseVByb21pc2UgJiYgZGVsZWdhdGUgIT09IGZvcndhcmRSZWplY3Rpb24gJiYgZGVsZWdhdGUgIT09IGZvcndhcmRSZXNvbHV0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICA/IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtwYXJlbnRQcm9taXNlVmFsdWVdKTtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZVByb21pc2UoY2hhaW5Qcm9taXNlLCB0cnVlLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBlcnJvciBvY2N1cnMsIHNob3VsZCBhbHdheXMgcmV0dXJuIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZVByb21pc2UoY2hhaW5Qcm9taXNlLCBmYWxzZSwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sIGNoYWluUHJvbWlzZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgWk9ORV9BV0FSRV9QUk9NSVNFX1RPX1NUUklORyA9ICdmdW5jdGlvbiBab25lQXdhcmVQcm9taXNlKCkgeyBbbmF0aXZlIGNvZGVdIH0nO1xuICAgICAgICBjb25zdCBub29wID0gZnVuY3Rpb24gKCkgeyB9O1xuICAgICAgICBjb25zdCBBZ2dyZWdhdGVFcnJvciA9IGdsb2JhbC5BZ2dyZWdhdGVFcnJvcjtcbiAgICAgICAgY2xhc3MgWm9uZUF3YXJlUHJvbWlzZSB7XG4gICAgICAgICAgICBzdGF0aWMgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpPTkVfQVdBUkVfUFJPTUlTRV9UT19TVFJJTkc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdGF0aWMgcmVzb2x2ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFpvbmVBd2FyZVByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZVByb21pc2UobmV3IHRoaXMobnVsbCksIFJFU09MVkVELCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdGF0aWMgcmVqZWN0KGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmVQcm9taXNlKG5ldyB0aGlzKG51bGwpLCBSRUpFQ1RFRCwgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGljIHdpdGhSZXNvbHZlcnMoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0ge307XG4gICAgICAgICAgICAgICAgcmVzdWx0LnByb21pc2UgPSBuZXcgWm9uZUF3YXJlUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnJlc29sdmUgPSByZXM7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdC5yZWplY3QgPSByZWo7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRpYyBhbnkodmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF2YWx1ZXMgfHwgdHlwZW9mIHZhbHVlc1tTeW1ib2wuaXRlcmF0b3JdICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgQWdncmVnYXRlRXJyb3IoW10sICdBbGwgcHJvbWlzZXMgd2VyZSByZWplY3RlZCcpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcbiAgICAgICAgICAgICAgICBsZXQgY291bnQgPSAwO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IHYgb2YgdmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvbWlzZXMucHVzaChab25lQXdhcmVQcm9taXNlLnJlc29sdmUodikpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBBZ2dyZWdhdGVFcnJvcihbXSwgJ0FsbCBwcm9taXNlcyB3ZXJlIHJlamVjdGVkJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBBZ2dyZWdhdGVFcnJvcihbXSwgJ0FsbCBwcm9taXNlcyB3ZXJlIHJlamVjdGVkJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsZXQgZmluaXNoZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvcnMgPSBbXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFpvbmVBd2FyZVByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHByb21pc2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9taXNlc1tpXS50aGVuKCh2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZpbmlzaGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluaXNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUodik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3VudC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaW5pc2hlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgQWdncmVnYXRlRXJyb3IoZXJyb3JzLCAnQWxsIHByb21pc2VzIHdlcmUgcmVqZWN0ZWQnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRpYyByYWNlKHZhbHVlcykge1xuICAgICAgICAgICAgICAgIGxldCByZXNvbHZlO1xuICAgICAgICAgICAgICAgIGxldCByZWplY3Q7XG4gICAgICAgICAgICAgICAgbGV0IHByb21pc2UgPSBuZXcgdGhpcygocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSA9IHJlcztcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0ID0gcmVqO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIG9uUmVzb2x2ZSh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gb25SZWplY3QoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgdmFsdWUgb2YgdmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNUaGVuYWJsZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZS50aGVuKG9uUmVzb2x2ZSwgb25SZWplY3QpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRpYyBhbGwodmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvbmVBd2FyZVByb21pc2UuYWxsV2l0aENhbGxiYWNrKHZhbHVlcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdGF0aWMgYWxsU2V0dGxlZCh2YWx1ZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBQID0gdGhpcyAmJiB0aGlzLnByb3RvdHlwZSBpbnN0YW5jZW9mIFpvbmVBd2FyZVByb21pc2UgPyB0aGlzIDogWm9uZUF3YXJlUHJvbWlzZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUC5hbGxXaXRoQ2FsbGJhY2sodmFsdWVzLCB7XG4gICAgICAgICAgICAgICAgICAgIHRoZW5DYWxsYmFjazogKHZhbHVlKSA9PiAoeyBzdGF0dXM6ICdmdWxmaWxsZWQnLCB2YWx1ZSB9KSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JDYWxsYmFjazogKGVycikgPT4gKHsgc3RhdHVzOiAncmVqZWN0ZWQnLCByZWFzb246IGVyciB9KSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRpYyBhbGxXaXRoQ2FsbGJhY2sodmFsdWVzLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGxldCByZXNvbHZlO1xuICAgICAgICAgICAgICAgIGxldCByZWplY3Q7XG4gICAgICAgICAgICAgICAgbGV0IHByb21pc2UgPSBuZXcgdGhpcygocmVzLCByZWopID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSA9IHJlcztcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0ID0gcmVqO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIFN0YXJ0IGF0IDIgdG8gcHJldmVudCBwcmVtYXR1cmVseSByZXNvbHZpbmcgaWYgLnRoZW4gaXMgY2FsbGVkIGltbWVkaWF0ZWx5LlxuICAgICAgICAgICAgICAgIGxldCB1bnJlc29sdmVkQ291bnQgPSAyO1xuICAgICAgICAgICAgICAgIGxldCB2YWx1ZUluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHZlZFZhbHVlcyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzVGhlbmFibGUodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VyVmFsdWVJbmRleCA9IHZhbHVlSW5kZXg7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZS50aGVuKCh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVkVmFsdWVzW2N1clZhbHVlSW5kZXhdID0gY2FsbGJhY2sgPyBjYWxsYmFjay50aGVuQ2FsbGJhY2sodmFsdWUpIDogdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5yZXNvbHZlZENvdW50LS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVucmVzb2x2ZWRDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHJlc29sdmVkVmFsdWVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmVkVmFsdWVzW2N1clZhbHVlSW5kZXhdID0gY2FsbGJhY2suZXJyb3JDYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bnJlc29sdmVkQ291bnQtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVucmVzb2x2ZWRDb3VudCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXNvbHZlZFZhbHVlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaCAodGhlbkVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KHRoZW5FcnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHVucmVzb2x2ZWRDb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZUluZGV4Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIE1ha2UgdGhlIHVucmVzb2x2ZWRDb3VudCB6ZXJvLWJhc2VkIGFnYWluLlxuICAgICAgICAgICAgICAgIHVucmVzb2x2ZWRDb3VudCAtPSAyO1xuICAgICAgICAgICAgICAgIGlmICh1bnJlc29sdmVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXNvbHZlZFZhbHVlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3RydWN0b3IoZXhlY3V0b3IpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9taXNlID0gdGhpcztcbiAgICAgICAgICAgICAgICBpZiAoIShwcm9taXNlIGluc3RhbmNlb2YgWm9uZUF3YXJlUHJvbWlzZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNdXN0IGJlIGFuIGluc3RhbmNlb2YgUHJvbWlzZS4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJvbWlzZVtzeW1ib2xTdGF0ZV0gPSBVTlJFU09MVkVEO1xuICAgICAgICAgICAgICAgIHByb21pc2Vbc3ltYm9sVmFsdWVdID0gW107IC8vIHF1ZXVlO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9uY2VXcmFwcGVyID0gb25jZSgpO1xuICAgICAgICAgICAgICAgICAgICBleGVjdXRvciAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgZXhlY3V0b3Iob25jZVdyYXBwZXIobWFrZVJlc29sdmVyKHByb21pc2UsIFJFU09MVkVEKSksIG9uY2VXcmFwcGVyKG1ha2VSZXNvbHZlcihwcm9taXNlLCBSRUpFQ1RFRCkpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmVQcm9taXNlKHByb21pc2UsIGZhbHNlLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZ2V0IFtTeW1ib2wudG9TdHJpbmdUYWddKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAnUHJvbWlzZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBnZXQgW1N5bWJvbC5zcGVjaWVzXSgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9uZUF3YXJlUHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoZW4ob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBXZSBtdXN0IHJlYWQgYFN5bWJvbC5zcGVjaWVzYCBzYWZlbHkgYmVjYXVzZSBgdGhpc2AgbWF5IGJlIGFueXRoaW5nLiBGb3IgaW5zdGFuY2UsIGB0aGlzYFxuICAgICAgICAgICAgICAgIC8vIG1heSBiZSBhbiBvYmplY3Qgd2l0aG91dCBhIHByb3RvdHlwZSAoY3JlYXRlZCB0aHJvdWdoIGBPYmplY3QuY3JlYXRlKG51bGwpYCk7IHRodXNcbiAgICAgICAgICAgICAgICAvLyBgdGhpcy5jb25zdHJ1Y3RvcmAgd2lsbCBiZSB1bmRlZmluZWQuIE9uZSBvZiB0aGUgdXNlIGNhc2VzIGlzIFN5c3RlbUpTIGNyZWF0aW5nXG4gICAgICAgICAgICAgICAgLy8gcHJvdG90eXBlLWxlc3Mgb2JqZWN0cyAobW9kdWxlcykgdmlhIGBPYmplY3QuY3JlYXRlKG51bGwpYC4gVGhlIFN5c3RlbUpTIGNyZWF0ZXMgYW4gZW1wdHlcbiAgICAgICAgICAgICAgICAvLyBvYmplY3QgYW5kIGNvcGllcyBwcm9taXNlIHByb3BlcnRpZXMgaW50byB0aGF0IG9iamVjdCAod2l0aGluIHRoZSBgZ2V0T3JDcmVhdGVMb2FkYFxuICAgICAgICAgICAgICAgIC8vIGZ1bmN0aW9uKS4gVGhlIHpvbmUuanMgdGhlbiBjaGVja3MgaWYgdGhlIHJlc29sdmVkIHZhbHVlIGhhcyB0aGUgYHRoZW5gIG1ldGhvZCBhbmRcbiAgICAgICAgICAgICAgICAvLyBpbnZva2VzIGl0IHdpdGggdGhlIGB2YWx1ZWAgY29udGV4dC4gT3RoZXJ3aXNlLCB0aGlzIHdpbGwgdGhyb3cgYW4gZXJyb3I6IGBUeXBlRXJyb3I6XG4gICAgICAgICAgICAgICAgLy8gQ2Fubm90IHJlYWQgcHJvcGVydGllcyBvZiB1bmRlZmluZWQgKHJlYWRpbmcgJ1N5bWJvbChTeW1ib2wuc3BlY2llcyknKWAuXG4gICAgICAgICAgICAgICAgbGV0IEMgPSB0aGlzLmNvbnN0cnVjdG9yPy5bU3ltYm9sLnNwZWNpZXNdO1xuICAgICAgICAgICAgICAgIGlmICghQyB8fCB0eXBlb2YgQyAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBDID0gdGhpcy5jb25zdHJ1Y3RvciB8fCBab25lQXdhcmVQcm9taXNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBjaGFpblByb21pc2UgPSBuZXcgQyhub29wKTtcbiAgICAgICAgICAgICAgICBjb25zdCB6b25lID0gWm9uZS5jdXJyZW50O1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW3N5bWJvbFN0YXRlXSA9PSBVTlJFU09MVkVEKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbc3ltYm9sVmFsdWVdLnB1c2goem9uZSwgY2hhaW5Qcm9taXNlLCBvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzY2hlZHVsZVJlc29sdmVPclJlamVjdCh0aGlzLCB6b25lLCBjaGFpblByb21pc2UsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoYWluUHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoKG9uUmVqZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0ZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmluYWxseShvbkZpbmFsbHkpIHtcbiAgICAgICAgICAgICAgICAvLyBTZWUgY29tbWVudCBvbiB0aGUgY2FsbCB0byBgdGhlbmAgYWJvdXQgd2h5IHRoZWUgYFN5bWJvbC5zcGVjaWVzYCBpcyBzYWZlbHkgYWNjZXNzZWQuXG4gICAgICAgICAgICAgICAgbGV0IEMgPSB0aGlzLmNvbnN0cnVjdG9yPy5bU3ltYm9sLnNwZWNpZXNdO1xuICAgICAgICAgICAgICAgIGlmICghQyB8fCB0eXBlb2YgQyAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBDID0gWm9uZUF3YXJlUHJvbWlzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgY2hhaW5Qcm9taXNlID0gbmV3IEMobm9vcCk7XG4gICAgICAgICAgICAgICAgY2hhaW5Qcm9taXNlW3N5bWJvbEZpbmFsbHldID0gc3ltYm9sRmluYWxseTtcbiAgICAgICAgICAgICAgICBjb25zdCB6b25lID0gWm9uZS5jdXJyZW50O1xuICAgICAgICAgICAgICAgIGlmICh0aGlzW3N5bWJvbFN0YXRlXSA9PSBVTlJFU09MVkVEKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbc3ltYm9sVmFsdWVdLnB1c2goem9uZSwgY2hhaW5Qcm9taXNlLCBvbkZpbmFsbHksIG9uRmluYWxseSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzY2hlZHVsZVJlc29sdmVPclJlamVjdCh0aGlzLCB6b25lLCBjaGFpblByb21pc2UsIG9uRmluYWxseSwgb25GaW5hbGx5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNoYWluUHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBQcm90ZWN0IGFnYWluc3QgYWdncmVzc2l2ZSBvcHRpbWl6ZXJzIGRyb3BwaW5nIHNlZW1pbmdseSB1bnVzZWQgcHJvcGVydGllcy5cbiAgICAgICAgLy8gRS5nLiBDbG9zdXJlIENvbXBpbGVyIGluIGFkdmFuY2VkIG1vZGUuXG4gICAgICAgIFpvbmVBd2FyZVByb21pc2VbJ3Jlc29sdmUnXSA9IFpvbmVBd2FyZVByb21pc2UucmVzb2x2ZTtcbiAgICAgICAgWm9uZUF3YXJlUHJvbWlzZVsncmVqZWN0J10gPSBab25lQXdhcmVQcm9taXNlLnJlamVjdDtcbiAgICAgICAgWm9uZUF3YXJlUHJvbWlzZVsncmFjZSddID0gWm9uZUF3YXJlUHJvbWlzZS5yYWNlO1xuICAgICAgICBab25lQXdhcmVQcm9taXNlWydhbGwnXSA9IFpvbmVBd2FyZVByb21pc2UuYWxsO1xuICAgICAgICBjb25zdCBOYXRpdmVQcm9taXNlID0gKGdsb2JhbFtzeW1ib2xQcm9taXNlXSA9IGdsb2JhbFsnUHJvbWlzZSddKTtcbiAgICAgICAgZ2xvYmFsWydQcm9taXNlJ10gPSBab25lQXdhcmVQcm9taXNlO1xuICAgICAgICBjb25zdCBzeW1ib2xUaGVuUGF0Y2hlZCA9IF9fc3ltYm9sX18oJ3RoZW5QYXRjaGVkJyk7XG4gICAgICAgIGZ1bmN0aW9uIHBhdGNoVGhlbihDdG9yKSB7XG4gICAgICAgICAgICBjb25zdCBwcm90byA9IEN0b3IucHJvdG90eXBlO1xuICAgICAgICAgICAgY29uc3QgcHJvcCA9IE9iamVjdEdldE93blByb3BlcnR5RGVzY3JpcHRvcihwcm90bywgJ3RoZW4nKTtcbiAgICAgICAgICAgIGlmIChwcm9wICYmIChwcm9wLndyaXRhYmxlID09PSBmYWxzZSB8fCAhcHJvcC5jb25maWd1cmFibGUpKSB7XG4gICAgICAgICAgICAgICAgLy8gY2hlY2sgQ3Rvci5wcm90b3R5cGUudGhlbiBwcm9wZXJ0eURlc2NyaXB0b3IgaXMgd3JpdGFibGUgb3Igbm90XG4gICAgICAgICAgICAgICAgLy8gaW4gbWV0ZW9yIGVudiwgd3JpdGFibGUgaXMgZmFsc2UsIHdlIHNob3VsZCBpZ25vcmUgc3VjaCBjYXNlXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxUaGVuID0gcHJvdG8udGhlbjtcbiAgICAgICAgICAgIC8vIEtlZXAgYSByZWZlcmVuY2UgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZC5cbiAgICAgICAgICAgIHByb3RvW3N5bWJvbFRoZW5dID0gb3JpZ2luYWxUaGVuO1xuICAgICAgICAgICAgQ3Rvci5wcm90b3R5cGUudGhlbiA9IGZ1bmN0aW9uIChvblJlc29sdmUsIG9uUmVqZWN0KSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgd3JhcHBlZCA9IG5ldyBab25lQXdhcmVQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxUaGVuLmNhbGwodGhpcywgcmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gd3JhcHBlZC50aGVuKG9uUmVzb2x2ZSwgb25SZWplY3QpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIEN0b3Jbc3ltYm9sVGhlblBhdGNoZWRdID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBhcGkucGF0Y2hUaGVuID0gcGF0Y2hUaGVuO1xuICAgICAgICBmdW5jdGlvbiB6b25laWZ5KGZuKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHNlbGYsIGFyZ3MpIHtcbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0UHJvbWlzZSA9IGZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHRQcm9taXNlIGluc3RhbmNlb2YgWm9uZUF3YXJlUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0UHJvbWlzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGV0IGN0b3IgPSByZXN1bHRQcm9taXNlLmNvbnN0cnVjdG9yO1xuICAgICAgICAgICAgICAgIGlmICghY3RvcltzeW1ib2xUaGVuUGF0Y2hlZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgcGF0Y2hUaGVuKGN0b3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0UHJvbWlzZTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKE5hdGl2ZVByb21pc2UpIHtcbiAgICAgICAgICAgIHBhdGNoVGhlbihOYXRpdmVQcm9taXNlKTtcbiAgICAgICAgICAgIHBhdGNoTWV0aG9kKGdsb2JhbCwgJ2ZldGNoJywgKGRlbGVnYXRlKSA9PiB6b25laWZ5KGRlbGVnYXRlKSk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhpcyBpcyBub3QgcGFydCBvZiBwdWJsaWMgQVBJLCBidXQgaXQgaXMgdXNlZnVsIGZvciB0ZXN0cywgc28gd2UgZXhwb3NlIGl0LlxuICAgICAgICBQcm9taXNlW1pvbmUuX19zeW1ib2xfXygndW5jYXVnaHRQcm9taXNlRXJyb3JzJyldID0gX3VuY2F1Z2h0UHJvbWlzZUVycm9ycztcbiAgICAgICAgcmV0dXJuIFpvbmVBd2FyZVByb21pc2U7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHBhdGNoVG9TdHJpbmcoWm9uZSkge1xuICAgIC8vIG92ZXJyaWRlIEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZyB0byBtYWtlIHpvbmUuanMgcGF0Y2hlZCBmdW5jdGlvblxuICAgIC8vIGxvb2sgbGlrZSBuYXRpdmUgZnVuY3Rpb25cbiAgICBab25lLl9fbG9hZF9wYXRjaCgndG9TdHJpbmcnLCAoZ2xvYmFsKSA9PiB7XG4gICAgICAgIC8vIHBhdGNoIEZ1bmMucHJvdG90eXBlLnRvU3RyaW5nIHRvIGxldCB0aGVtIGxvb2sgbGlrZSBuYXRpdmVcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxGdW5jdGlvblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nO1xuICAgICAgICBjb25zdCBPUklHSU5BTF9ERUxFR0FURV9TWU1CT0wgPSB6b25lU3ltYm9sKCdPcmlnaW5hbERlbGVnYXRlJyk7XG4gICAgICAgIGNvbnN0IFBST01JU0VfU1lNQk9MID0gem9uZVN5bWJvbCgnUHJvbWlzZScpO1xuICAgICAgICBjb25zdCBFUlJPUl9TWU1CT0wgPSB6b25lU3ltYm9sKCdFcnJvcicpO1xuICAgICAgICBjb25zdCBuZXdGdW5jdGlvblRvU3RyaW5nID0gZnVuY3Rpb24gdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHRoaXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbERlbGVnYXRlID0gdGhpc1tPUklHSU5BTF9ERUxFR0FURV9TWU1CT0xdO1xuICAgICAgICAgICAgICAgIGlmIChvcmlnaW5hbERlbGVnYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2Ygb3JpZ2luYWxEZWxlZ2F0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsRnVuY3Rpb25Ub1N0cmluZy5jYWxsKG9yaWdpbmFsRGVsZWdhdGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvcmlnaW5hbERlbGVnYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGhpcyA9PT0gUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBuYXRpdmVQcm9taXNlID0gZ2xvYmFsW1BST01JU0VfU1lNQk9MXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5hdGl2ZVByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbEZ1bmN0aW9uVG9TdHJpbmcuY2FsbChuYXRpdmVQcm9taXNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodGhpcyA9PT0gRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmF0aXZlRXJyb3IgPSBnbG9iYWxbRVJST1JfU1lNQk9MXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5hdGl2ZUVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxGdW5jdGlvblRvU3RyaW5nLmNhbGwobmF0aXZlRXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsRnVuY3Rpb25Ub1N0cmluZy5jYWxsKHRoaXMpO1xuICAgICAgICB9O1xuICAgICAgICBuZXdGdW5jdGlvblRvU3RyaW5nW09SSUdJTkFMX0RFTEVHQVRFX1NZTUJPTF0gPSBvcmlnaW5hbEZ1bmN0aW9uVG9TdHJpbmc7XG4gICAgICAgIEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZyA9IG5ld0Z1bmN0aW9uVG9TdHJpbmc7XG4gICAgICAgIC8vIHBhdGNoIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcgdG8gbGV0IHRoZW0gbG9vayBsaWtlIG5hdGl2ZVxuICAgICAgICBjb25zdCBvcmlnaW5hbE9iamVjdFRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZztcbiAgICAgICAgY29uc3QgUFJPTUlTRV9PQkpFQ1RfVE9fU1RSSU5HID0gJ1tvYmplY3QgUHJvbWlzZV0nO1xuICAgICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBQcm9taXNlID09PSAnZnVuY3Rpb24nICYmIHRoaXMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFBST01JU0VfT0JKRUNUX1RPX1NUUklORztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbE9iamVjdFRvU3RyaW5nLmNhbGwodGhpcyk7XG4gICAgICAgIH07XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHBhdGNoQ2FsbGJhY2tzKGFwaSwgdGFyZ2V0LCB0YXJnZXROYW1lLCBtZXRob2QsIGNhbGxiYWNrcykge1xuICAgIGNvbnN0IHN5bWJvbCA9IFpvbmUuX19zeW1ib2xfXyhtZXRob2QpO1xuICAgIGlmICh0YXJnZXRbc3ltYm9sXSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5hdGl2ZURlbGVnYXRlID0gKHRhcmdldFtzeW1ib2xdID0gdGFyZ2V0W21ldGhvZF0pO1xuICAgIHRhcmdldFttZXRob2RdID0gZnVuY3Rpb24gKG5hbWUsIG9wdHMsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdHMgJiYgb3B0cy5wcm90b3R5cGUpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IGAke3RhcmdldE5hbWV9LiR7bWV0aG9kfTo6YCArIGNhbGxiYWNrO1xuICAgICAgICAgICAgICAgIGNvbnN0IHByb3RvdHlwZSA9IG9wdHMucHJvdG90eXBlO1xuICAgICAgICAgICAgICAgIC8vIE5vdGU6IHRoZSBgcGF0Y2hDYWxsYmFja3NgIGlzIHVzZWQgZm9yIHBhdGNoaW5nIHRoZSBgZG9jdW1lbnQucmVnaXN0ZXJFbGVtZW50YCBhbmRcbiAgICAgICAgICAgICAgICAvLyBgY3VzdG9tRWxlbWVudHMuZGVmaW5lYC4gV2UgZXhwbGljaXRseSB3cmFwIHRoZSBwYXRjaGluZyBjb2RlIGludG8gdHJ5LWNhdGNoIHNpbmNlXG4gICAgICAgICAgICAgICAgLy8gY2FsbGJhY2tzIG1heSBiZSBhbHJlYWR5IHBhdGNoZWQgYnkgb3RoZXIgd2ViIGNvbXBvbmVudHMgZnJhbWV3b3JrcyAoZS5nLiBMV0MpLCBhbmQgdGhleVxuICAgICAgICAgICAgICAgIC8vIG1ha2UgdGhvc2UgcHJvcGVydGllcyBub24td3JpdGFibGUuIFRoaXMgbWVhbnMgdGhhdCBwYXRjaGluZyBjYWxsYmFjayB3aWxsIHRocm93IGFuIGVycm9yXG4gICAgICAgICAgICAgICAgLy8gYGNhbm5vdCBhc3NpZ24gdG8gcmVhZC1vbmx5IHByb3BlcnR5YC4gU2VlIHRoaXMgY29kZSBhcyBhbiBleGFtcGxlOlxuICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9zYWxlc2ZvcmNlL2x3Yy9ibG9iL21hc3Rlci9wYWNrYWdlcy9AbHdjL2VuZ2luZS1jb3JlL3NyYy9mcmFtZXdvcmsvYmFzZS1icmlkZ2UtZWxlbWVudC50cyNMMTgwLUwxODZcbiAgICAgICAgICAgICAgICAvLyBXZSBkb24ndCB3YW50IHRvIHN0b3AgdGhlIGFwcGxpY2F0aW9uIHJlbmRlcmluZyBpZiB3ZSBjb3VsZG4ndCBwYXRjaCBzb21lXG4gICAgICAgICAgICAgICAgLy8gY2FsbGJhY2ssIGUuZy4gYGF0dHJpYnV0ZUNoYW5nZWRDYWxsYmFja2AuXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eShjYWxsYmFjaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlc2NyaXB0b3IgPSBhcGkuT2JqZWN0R2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHByb3RvdHlwZSwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlc2NyaXB0b3IgJiYgZGVzY3JpcHRvci52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0b3IudmFsdWUgPSBhcGkud3JhcFdpdGhDdXJyZW50Wm9uZShkZXNjcmlwdG9yLnZhbHVlLCBzb3VyY2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5fcmVkZWZpbmVQcm9wZXJ0eShvcHRzLnByb3RvdHlwZSwgY2FsbGJhY2ssIGRlc2NyaXB0b3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAocHJvdG90eXBlW2NhbGxiYWNrXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3RvdHlwZVtjYWxsYmFja10gPSBhcGkud3JhcFdpdGhDdXJyZW50Wm9uZShwcm90b3R5cGVbY2FsbGJhY2tdLCBzb3VyY2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHByb3RvdHlwZVtjYWxsYmFja10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3RvdHlwZVtjYWxsYmFja10gPSBhcGkud3JhcFdpdGhDdXJyZW50Wm9uZShwcm90b3R5cGVbY2FsbGJhY2tdLCBzb3VyY2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm90ZTogd2UgbGVhdmUgdGhlIGNhdGNoIGJsb2NrIGVtcHR5IHNpbmNlIHRoZXJlJ3Mgbm8gd2F5IHRvIGhhbmRsZSB0aGUgZXJyb3IgcmVsYXRlZFxuICAgICAgICAgICAgICAgICAgICAvLyB0byBub24td3JpdGFibGUgcHJvcGVydHkuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5hdGl2ZURlbGVnYXRlLmNhbGwodGFyZ2V0LCBuYW1lLCBvcHRzLCBvcHRpb25zKTtcbiAgICB9O1xuICAgIGFwaS5hdHRhY2hPcmlnaW5Ub1BhdGNoZWQodGFyZ2V0W21ldGhvZF0sIG5hdGl2ZURlbGVnYXRlKTtcbn1cblxuZnVuY3Rpb24gcGF0Y2hVdGlsKFpvbmUpIHtcbiAgICBab25lLl9fbG9hZF9wYXRjaCgndXRpbCcsIChnbG9iYWwsIFpvbmUsIGFwaSkgPT4ge1xuICAgICAgICAvLyBDb2xsZWN0IG5hdGl2ZSBldmVudCBuYW1lcyBieSBsb29raW5nIGF0IHByb3BlcnRpZXNcbiAgICAgICAgLy8gb24gdGhlIGdsb2JhbCBuYW1lc3BhY2UsIGUuZy4gJ29uY2xpY2snLlxuICAgICAgICBjb25zdCBldmVudE5hbWVzID0gZ2V0T25FdmVudE5hbWVzKGdsb2JhbCk7XG4gICAgICAgIGFwaS5wYXRjaE9uUHJvcGVydGllcyA9IHBhdGNoT25Qcm9wZXJ0aWVzO1xuICAgICAgICBhcGkucGF0Y2hNZXRob2QgPSBwYXRjaE1ldGhvZDtcbiAgICAgICAgYXBpLmJpbmRBcmd1bWVudHMgPSBiaW5kQXJndW1lbnRzO1xuICAgICAgICBhcGkucGF0Y2hNYWNyb1Rhc2sgPSBwYXRjaE1hY3JvVGFzaztcbiAgICAgICAgLy8gSW4gZWFybGllciB2ZXJzaW9uIG9mIHpvbmUuanMgKDwwLjkuMCksIHdlIHVzZSBlbnYgbmFtZSBgX196b25lX3N5bWJvbF9fQkxBQ0tfTElTVEVEX0VWRU5UU2BcbiAgICAgICAgLy8gdG8gZGVmaW5lIHdoaWNoIGV2ZW50cyB3aWxsIG5vdCBiZSBwYXRjaGVkIGJ5IGBab25lLmpzYC4gSW4gbmV3ZXIgdmVyc2lvbiAoPj0wLjkuMCksIHdlXG4gICAgICAgIC8vIGNoYW5nZSB0aGUgZW52IG5hbWUgdG8gYF9fem9uZV9zeW1ib2xfX1VOUEFUQ0hFRF9FVkVOVFNgIHRvIGtlZXAgdGhlIG5hbWUgY29uc2lzdGVudCB3aXRoXG4gICAgICAgIC8vIGFuZ3VsYXIgcmVwby4gVGhlICBgX196b25lX3N5bWJvbF9fQkxBQ0tfTElTVEVEX0VWRU5UU2AgaXMgZGVwcmVjYXRlZCwgYnV0IGl0IGlzIHN0aWxsIGJlXG4gICAgICAgIC8vIHN1cHBvcnRlZCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gICAgICAgIGNvbnN0IFNZTUJPTF9CTEFDS19MSVNURURfRVZFTlRTID0gWm9uZS5fX3N5bWJvbF9fKCdCTEFDS19MSVNURURfRVZFTlRTJyk7XG4gICAgICAgIGNvbnN0IFNZTUJPTF9VTlBBVENIRURfRVZFTlRTID0gWm9uZS5fX3N5bWJvbF9fKCdVTlBBVENIRURfRVZFTlRTJyk7XG4gICAgICAgIGlmIChnbG9iYWxbU1lNQk9MX1VOUEFUQ0hFRF9FVkVOVFNdKSB7XG4gICAgICAgICAgICBnbG9iYWxbU1lNQk9MX0JMQUNLX0xJU1RFRF9FVkVOVFNdID0gZ2xvYmFsW1NZTUJPTF9VTlBBVENIRURfRVZFTlRTXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZ2xvYmFsW1NZTUJPTF9CTEFDS19MSVNURURfRVZFTlRTXSkge1xuICAgICAgICAgICAgWm9uZVtTWU1CT0xfQkxBQ0tfTElTVEVEX0VWRU5UU10gPSBab25lW1NZTUJPTF9VTlBBVENIRURfRVZFTlRTXSA9XG4gICAgICAgICAgICAgICAgZ2xvYmFsW1NZTUJPTF9CTEFDS19MSVNURURfRVZFTlRTXTtcbiAgICAgICAgfVxuICAgICAgICBhcGkucGF0Y2hFdmVudFByb3RvdHlwZSA9IHBhdGNoRXZlbnRQcm90b3R5cGU7XG4gICAgICAgIGFwaS5wYXRjaEV2ZW50VGFyZ2V0ID0gcGF0Y2hFdmVudFRhcmdldDtcbiAgICAgICAgYXBpLmlzSUVPckVkZ2UgPSBpc0lFT3JFZGdlO1xuICAgICAgICBhcGkuT2JqZWN0RGVmaW5lUHJvcGVydHkgPSBPYmplY3REZWZpbmVQcm9wZXJ0eTtcbiAgICAgICAgYXBpLk9iamVjdEdldE93blByb3BlcnR5RGVzY3JpcHRvciA9IE9iamVjdEdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbiAgICAgICAgYXBpLk9iamVjdENyZWF0ZSA9IE9iamVjdENyZWF0ZTtcbiAgICAgICAgYXBpLkFycmF5U2xpY2UgPSBBcnJheVNsaWNlO1xuICAgICAgICBhcGkucGF0Y2hDbGFzcyA9IHBhdGNoQ2xhc3M7XG4gICAgICAgIGFwaS53cmFwV2l0aEN1cnJlbnRab25lID0gd3JhcFdpdGhDdXJyZW50Wm9uZTtcbiAgICAgICAgYXBpLmZpbHRlclByb3BlcnRpZXMgPSBmaWx0ZXJQcm9wZXJ0aWVzO1xuICAgICAgICBhcGkuYXR0YWNoT3JpZ2luVG9QYXRjaGVkID0gYXR0YWNoT3JpZ2luVG9QYXRjaGVkO1xuICAgICAgICBhcGkuX3JlZGVmaW5lUHJvcGVydHkgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG4gICAgICAgIGFwaS5wYXRjaENhbGxiYWNrcyA9IHBhdGNoQ2FsbGJhY2tzO1xuICAgICAgICBhcGkuZ2V0R2xvYmFsT2JqZWN0cyA9ICgpID0+ICh7XG4gICAgICAgICAgICBnbG9iYWxTb3VyY2VzLFxuICAgICAgICAgICAgem9uZVN5bWJvbEV2ZW50TmFtZXMsXG4gICAgICAgICAgICBldmVudE5hbWVzLFxuICAgICAgICAgICAgaXNCcm93c2VyLFxuICAgICAgICAgICAgaXNNaXgsXG4gICAgICAgICAgICBpc05vZGUsXG4gICAgICAgICAgICBUUlVFX1NUUixcbiAgICAgICAgICAgIEZBTFNFX1NUUixcbiAgICAgICAgICAgIFpPTkVfU1lNQk9MX1BSRUZJWCxcbiAgICAgICAgICAgIEFERF9FVkVOVF9MSVNURU5FUl9TVFIsXG4gICAgICAgICAgICBSRU1PVkVfRVZFTlRfTElTVEVORVJfU1RSLFxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcGF0Y2hDb21tb24oWm9uZSkge1xuICAgIHBhdGNoUHJvbWlzZShab25lKTtcbiAgICBwYXRjaFRvU3RyaW5nKFpvbmUpO1xuICAgIHBhdGNoVXRpbChab25lKTtcbn1cblxuY29uc3QgWm9uZSQxID0gbG9hZFpvbmUoKTtcbnBhdGNoQ29tbW9uKFpvbmUkMSk7XG5wYXRjaEJyb3dzZXIoWm9uZSQxKTtcbiJdLCJtYXBwaW5ncyI6IjtBQU1BLElBQU0sU0FBUztBQUdmLFNBQVMsV0FBVyxNQUFNO0FBQ3RCLFFBQU0sZUFBZSxPQUFPLHNCQUFzQixLQUFLO0FBQ3ZELFNBQU8sZUFBZTtBQUMxQjtBQUNBLFNBQVMsV0FBVztBQUNoQixRQUFNLGNBQWMsT0FBTyxhQUFhO0FBQ3hDLFdBQVMsS0FBSyxNQUFNO0FBQ2hCLG1CQUFlLFlBQVksTUFBTSxLQUFLLFlBQVksTUFBTSxFQUFFLElBQUk7QUFBQSxFQUNsRTtBQUNBLFdBQVMsbUJBQW1CLE1BQU0sT0FBTztBQUNyQyxtQkFBZSxZQUFZLFNBQVMsS0FBSyxZQUFZLFNBQVMsRUFBRSxNQUFNLEtBQUs7QUFBQSxFQUMvRTtBQUNBLE9BQUssTUFBTTtBQUFBLEVBQ1gsTUFBTSxTQUFTO0FBQUEsSUFDWCxPQUFPLGFBQWE7QUFBQSxJQUNwQixPQUFPLG9CQUFvQjtBQUN2QixVQUFJLE9BQU8sU0FBUyxNQUFNLFFBQVEsa0JBQWtCLEdBQUc7QUFDbkQsY0FBTSxJQUFJLE1BQU0sK1JBSTBDO0FBQUEsTUFDOUQ7QUFBQSxJQUNKO0FBQUEsSUFDQSxXQUFXLE9BQU87QUFDZCxVQUFJLE9BQU8sU0FBUztBQUNwQixhQUFPLEtBQUssUUFBUTtBQUNoQixlQUFPLEtBQUs7QUFBQSxNQUNoQjtBQUNBLGFBQU87QUFBQSxJQUNYO0FBQUEsSUFDQSxXQUFXLFVBQVU7QUFDakIsYUFBTyxrQkFBa0I7QUFBQSxJQUM3QjtBQUFBLElBQ0EsV0FBVyxjQUFjO0FBQ3JCLGFBQU87QUFBQSxJQUNYO0FBQUEsSUFDQSxPQUFPLGFBQWEsTUFBTSxJQUFJLGtCQUFrQixPQUFPO0FBQ25ELFVBQUksUUFBUSxlQUFlLElBQUksR0FBRztBQUk5QixjQUFNLGlCQUFpQixPQUFPLFdBQVcseUJBQXlCLENBQUMsTUFBTTtBQUN6RSxZQUFJLENBQUMsbUJBQW1CLGdCQUFnQjtBQUNwQyxnQkFBTSxNQUFNLDJCQUEyQixJQUFJO0FBQUEsUUFDL0M7QUFBQSxNQUNKLFdBQ1MsQ0FBQyxPQUFPLG9CQUFvQixJQUFJLEdBQUc7QUFDeEMsY0FBTSxXQUFXLFVBQVU7QUFDM0IsYUFBSyxRQUFRO0FBQ2IsZ0JBQVEsSUFBSSxJQUFJLEdBQUcsUUFBUSxVQUFVLElBQUk7QUFDekMsMkJBQW1CLFVBQVUsUUFBUTtBQUFBLE1BQ3pDO0FBQUEsSUFDSjtBQUFBLElBQ0EsSUFBSSxTQUFTO0FBQ1QsYUFBTyxLQUFLO0FBQUEsSUFDaEI7QUFBQSxJQUNBLElBQUksT0FBTztBQUNQLGFBQU8sS0FBSztBQUFBLElBQ2hCO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsWUFBWSxRQUFRLFVBQVU7QUFDMUIsV0FBSyxVQUFVO0FBQ2YsV0FBSyxRQUFRLFdBQVcsU0FBUyxRQUFRLFlBQVk7QUFDckQsV0FBSyxjQUFlLFlBQVksU0FBUyxjQUFlLENBQUM7QUFDekQsV0FBSyxnQkFBZ0IsSUFBSSxjQUFjLE1BQU0sS0FBSyxXQUFXLEtBQUssUUFBUSxlQUFlLFFBQVE7QUFBQSxJQUNyRztBQUFBLElBQ0EsSUFBSSxLQUFLO0FBQ0wsWUFBTSxPQUFPLEtBQUssWUFBWSxHQUFHO0FBQ2pDLFVBQUk7QUFDQSxlQUFPLEtBQUssWUFBWSxHQUFHO0FBQUEsSUFDbkM7QUFBQSxJQUNBLFlBQVksS0FBSztBQUNiLFVBQUksVUFBVTtBQUNkLGFBQU8sU0FBUztBQUNaLFlBQUksUUFBUSxZQUFZLGVBQWUsR0FBRyxHQUFHO0FBQ3pDLGlCQUFPO0FBQUEsUUFDWDtBQUNBLGtCQUFVLFFBQVE7QUFBQSxNQUN0QjtBQUNBLGFBQU87QUFBQSxJQUNYO0FBQUEsSUFDQSxLQUFLLFVBQVU7QUFDWCxVQUFJLENBQUM7QUFDRCxjQUFNLElBQUksTUFBTSxvQkFBb0I7QUFDeEMsYUFBTyxLQUFLLGNBQWMsS0FBSyxNQUFNLFFBQVE7QUFBQSxJQUNqRDtBQUFBLElBQ0EsS0FBSyxVQUFVLFFBQVE7QUFDbkIsVUFBSSxPQUFPLGFBQWEsWUFBWTtBQUNoQyxjQUFNLElBQUksTUFBTSw2QkFBNkIsUUFBUTtBQUFBLE1BQ3pEO0FBQ0EsWUFBTSxZQUFZLEtBQUssY0FBYyxVQUFVLE1BQU0sVUFBVSxNQUFNO0FBQ3JFLFlBQU0sT0FBTztBQUNiLGFBQU8sV0FBWTtBQUNmLGVBQU8sS0FBSyxXQUFXLFdBQVcsTUFBTSxXQUFXLE1BQU07QUFBQSxNQUM3RDtBQUFBLElBQ0o7QUFBQSxJQUNBLElBQUksVUFBVSxXQUFXLFdBQVcsUUFBUTtBQUN4QywwQkFBb0IsRUFBRSxRQUFRLG1CQUFtQixNQUFNLEtBQUs7QUFDNUQsVUFBSTtBQUNBLGVBQU8sS0FBSyxjQUFjLE9BQU8sTUFBTSxVQUFVLFdBQVcsV0FBVyxNQUFNO0FBQUEsTUFDakYsVUFDQTtBQUNJLDRCQUFvQixrQkFBa0I7QUFBQSxNQUMxQztBQUFBLElBQ0o7QUFBQSxJQUNBLFdBQVcsVUFBVSxZQUFZLE1BQU0sV0FBVyxRQUFRO0FBQ3RELDBCQUFvQixFQUFFLFFBQVEsbUJBQW1CLE1BQU0sS0FBSztBQUM1RCxVQUFJO0FBQ0EsWUFBSTtBQUNBLGlCQUFPLEtBQUssY0FBYyxPQUFPLE1BQU0sVUFBVSxXQUFXLFdBQVcsTUFBTTtBQUFBLFFBQ2pGLFNBQ08sT0FBTztBQUNWLGNBQUksS0FBSyxjQUFjLFlBQVksTUFBTSxLQUFLLEdBQUc7QUFDN0Msa0JBQU07QUFBQSxVQUNWO0FBQUEsUUFDSjtBQUFBLE1BQ0osVUFDQTtBQUNJLDRCQUFvQixrQkFBa0I7QUFBQSxNQUMxQztBQUFBLElBQ0o7QUFBQSxJQUNBLFFBQVEsTUFBTSxXQUFXLFdBQVc7QUFDaEMsVUFBSSxLQUFLLFFBQVEsTUFBTTtBQUNuQixjQUFNLElBQUksTUFBTSxpRUFDWCxLQUFLLFFBQVEsU0FBUyxPQUN2QixrQkFDQSxLQUFLLE9BQ0wsR0FBRztBQUFBLE1BQ1g7QUFDQSxZQUFNLFdBQVc7QUFJakIsWUFBTSxFQUFFLE1BQU0sTUFBTSxFQUFFLGFBQWEsT0FBTyxnQkFBZ0IsTUFBTSxJQUFJLENBQUMsRUFBRSxJQUFJO0FBQzNFLFVBQUksS0FBSyxVQUFVLGlCQUFpQixTQUFTLGFBQWEsU0FBUyxZQUFZO0FBQzNFO0FBQUEsTUFDSjtBQUNBLFlBQU0sZUFBZSxLQUFLLFNBQVM7QUFDbkMsc0JBQWdCLFNBQVMsY0FBYyxTQUFTLFNBQVM7QUFDekQsWUFBTSxlQUFlO0FBQ3JCLHFCQUFlO0FBQ2YsMEJBQW9CLEVBQUUsUUFBUSxtQkFBbUIsTUFBTSxLQUFLO0FBQzVELFVBQUk7QUFDQSxZQUFJLFFBQVEsYUFBYSxLQUFLLFFBQVEsQ0FBQyxjQUFjLENBQUMsZUFBZTtBQUNqRSxlQUFLLFdBQVc7QUFBQSxRQUNwQjtBQUNBLFlBQUk7QUFDQSxpQkFBTyxLQUFLLGNBQWMsV0FBVyxNQUFNLFVBQVUsV0FBVyxTQUFTO0FBQUEsUUFDN0UsU0FDTyxPQUFPO0FBQ1YsY0FBSSxLQUFLLGNBQWMsWUFBWSxNQUFNLEtBQUssR0FBRztBQUM3QyxrQkFBTTtBQUFBLFVBQ1Y7QUFBQSxRQUNKO0FBQUEsTUFDSixVQUNBO0FBR0ksY0FBTSxRQUFRLEtBQUs7QUFDbkIsWUFBSSxVQUFVLGdCQUFnQixVQUFVLFNBQVM7QUFDN0MsY0FBSSxRQUFRLGFBQWEsY0FBZSxpQkFBaUIsVUFBVSxZQUFhO0FBQzVFLDRCQUFnQixTQUFTLGNBQWMsV0FBVyxTQUFTLFVBQVU7QUFBQSxVQUN6RSxPQUNLO0FBQ0Qsa0JBQU0sZ0JBQWdCLFNBQVM7QUFDL0IsaUJBQUssaUJBQWlCLFVBQVUsRUFBRTtBQUNsQyw0QkFBZ0IsU0FBUyxjQUFjLGNBQWMsU0FBUyxZQUFZO0FBQzFFLGdCQUFJLGVBQWU7QUFDZix1QkFBUyxpQkFBaUI7QUFBQSxZQUM5QjtBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQ0EsNEJBQW9CLGtCQUFrQjtBQUN0Qyx1QkFBZTtBQUFBLE1BQ25CO0FBQUEsSUFDSjtBQUFBLElBQ0EsYUFBYSxNQUFNO0FBQ2YsVUFBSSxLQUFLLFFBQVEsS0FBSyxTQUFTLE1BQU07QUFHakMsWUFBSSxVQUFVO0FBQ2QsZUFBTyxTQUFTO0FBQ1osY0FBSSxZQUFZLEtBQUssTUFBTTtBQUN2QixrQkFBTSxNQUFNLDhCQUE4QixLQUFLLElBQUksOENBQThDLEtBQUssS0FBSyxJQUFJLEVBQUU7QUFBQSxVQUNySDtBQUNBLG9CQUFVLFFBQVE7QUFBQSxRQUN0QjtBQUFBLE1BQ0o7QUFDQSxXQUFLLGNBQWMsWUFBWSxZQUFZO0FBQzNDLFlBQU0sZ0JBQWdCLENBQUM7QUFDdkIsV0FBSyxpQkFBaUI7QUFDdEIsV0FBSyxRQUFRO0FBQ2IsVUFBSTtBQUNBLGVBQU8sS0FBSyxjQUFjLGFBQWEsTUFBTSxJQUFJO0FBQUEsTUFDckQsU0FDTyxLQUFLO0FBR1IsYUFBSyxjQUFjLFNBQVMsWUFBWSxZQUFZO0FBRXBELGFBQUssY0FBYyxZQUFZLE1BQU0sR0FBRztBQUN4QyxjQUFNO0FBQUEsTUFDVjtBQUNBLFVBQUksS0FBSyxtQkFBbUIsZUFBZTtBQUV2QyxhQUFLLGlCQUFpQixNQUFNLENBQUM7QUFBQSxNQUNqQztBQUNBLFVBQUksS0FBSyxTQUFTLFlBQVk7QUFDMUIsYUFBSyxjQUFjLFdBQVcsVUFBVTtBQUFBLE1BQzVDO0FBQ0EsYUFBTztBQUFBLElBQ1g7QUFBQSxJQUNBLGtCQUFrQixRQUFRLFVBQVUsTUFBTSxnQkFBZ0I7QUFDdEQsYUFBTyxLQUFLLGFBQWEsSUFBSSxTQUFTLFdBQVcsUUFBUSxVQUFVLE1BQU0sZ0JBQWdCLE1BQVMsQ0FBQztBQUFBLElBQ3ZHO0FBQUEsSUFDQSxrQkFBa0IsUUFBUSxVQUFVLE1BQU0sZ0JBQWdCLGNBQWM7QUFDcEUsYUFBTyxLQUFLLGFBQWEsSUFBSSxTQUFTLFdBQVcsUUFBUSxVQUFVLE1BQU0sZ0JBQWdCLFlBQVksQ0FBQztBQUFBLElBQzFHO0FBQUEsSUFDQSxrQkFBa0IsUUFBUSxVQUFVLE1BQU0sZ0JBQWdCLGNBQWM7QUFDcEUsYUFBTyxLQUFLLGFBQWEsSUFBSSxTQUFTLFdBQVcsUUFBUSxVQUFVLE1BQU0sZ0JBQWdCLFlBQVksQ0FBQztBQUFBLElBQzFHO0FBQUEsSUFDQSxXQUFXLE1BQU07QUFDYixVQUFJLEtBQUssUUFBUTtBQUNiLGNBQU0sSUFBSSxNQUFNLHVFQUNYLEtBQUssUUFBUSxTQUFTLE9BQ3ZCLGtCQUNBLEtBQUssT0FDTCxHQUFHO0FBQ1gsVUFBSSxLQUFLLFVBQVUsYUFBYSxLQUFLLFVBQVUsU0FBUztBQUNwRDtBQUFBLE1BQ0o7QUFDQSxXQUFLLGNBQWMsV0FBVyxXQUFXLE9BQU87QUFDaEQsVUFBSTtBQUNBLGFBQUssY0FBYyxXQUFXLE1BQU0sSUFBSTtBQUFBLE1BQzVDLFNBQ08sS0FBSztBQUVSLGFBQUssY0FBYyxTQUFTLFNBQVM7QUFDckMsYUFBSyxjQUFjLFlBQVksTUFBTSxHQUFHO0FBQ3hDLGNBQU07QUFBQSxNQUNWO0FBQ0EsV0FBSyxpQkFBaUIsTUFBTSxFQUFFO0FBQzlCLFdBQUssY0FBYyxjQUFjLFNBQVM7QUFDMUMsV0FBSyxXQUFXO0FBQ2hCLGFBQU87QUFBQSxJQUNYO0FBQUEsSUFDQSxpQkFBaUIsTUFBTSxPQUFPO0FBQzFCLFlBQU0sZ0JBQWdCLEtBQUs7QUFDM0IsVUFBSSxTQUFTLElBQUk7QUFDYixhQUFLLGlCQUFpQjtBQUFBLE1BQzFCO0FBQ0EsZUFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUMzQyxzQkFBYyxDQUFDLEVBQUUsaUJBQWlCLEtBQUssTUFBTSxLQUFLO0FBQUEsTUFDdEQ7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUNBLFFBQU0sY0FBYztBQUFBLElBQ2hCLE1BQU07QUFBQSxJQUNOLFdBQVcsQ0FBQyxVQUFVLEdBQUcsUUFBUSxpQkFBaUIsU0FBUyxRQUFRLFFBQVEsWUFBWTtBQUFBLElBQ3ZGLGdCQUFnQixDQUFDLFVBQVUsR0FBRyxRQUFRLFNBQVMsU0FBUyxhQUFhLFFBQVEsSUFBSTtBQUFBLElBQ2pGLGNBQWMsQ0FBQyxVQUFVLEdBQUcsUUFBUSxNQUFNLFdBQVcsY0FBYyxTQUFTLFdBQVcsUUFBUSxNQUFNLFdBQVcsU0FBUztBQUFBLElBQ3pILGNBQWMsQ0FBQyxVQUFVLEdBQUcsUUFBUSxTQUFTLFNBQVMsV0FBVyxRQUFRLElBQUk7QUFBQSxFQUNqRjtBQUFBLEVBQ0EsTUFBTSxjQUFjO0FBQUEsSUFDaEIsSUFBSSxPQUFPO0FBQ1AsYUFBTyxLQUFLO0FBQUEsSUFDaEI7QUFBQSxJQUNBO0FBQUEsSUFDQSxjQUFjO0FBQUEsTUFDVixhQUFhO0FBQUEsTUFDYixhQUFhO0FBQUEsTUFDYixhQUFhO0FBQUEsSUFDakI7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsWUFBWSxNQUFNLGdCQUFnQixVQUFVO0FBQ3hDLFdBQUssUUFBUTtBQUNiLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssVUFBVSxhQUFhLFlBQVksU0FBUyxTQUFTLFdBQVcsZUFBZTtBQUNwRixXQUFLLFlBQVksYUFBYSxTQUFTLFNBQVMsaUJBQWlCLGVBQWU7QUFDaEYsV0FBSyxnQkFDRCxhQUFhLFNBQVMsU0FBUyxLQUFLLFFBQVEsZUFBZTtBQUMvRCxXQUFLLGVBQ0QsYUFBYSxTQUFTLGNBQWMsV0FBVyxlQUFlO0FBQ2xFLFdBQUssaUJBQ0QsYUFBYSxTQUFTLGNBQWMsaUJBQWlCLGVBQWU7QUFDeEUsV0FBSyxxQkFDRCxhQUFhLFNBQVMsY0FBYyxLQUFLLFFBQVEsZUFBZTtBQUNwRSxXQUFLLFlBQVksYUFBYSxTQUFTLFdBQVcsV0FBVyxlQUFlO0FBQzVFLFdBQUssY0FDRCxhQUFhLFNBQVMsV0FBVyxpQkFBaUIsZUFBZTtBQUNyRSxXQUFLLGtCQUNELGFBQWEsU0FBUyxXQUFXLEtBQUssUUFBUSxlQUFlO0FBQ2pFLFdBQUssaUJBQ0QsYUFBYSxTQUFTLGdCQUFnQixXQUFXLGVBQWU7QUFDcEUsV0FBSyxtQkFDRCxhQUFhLFNBQVMsZ0JBQWdCLGlCQUFpQixlQUFlO0FBQzFFLFdBQUssdUJBQ0QsYUFBYSxTQUFTLGdCQUFnQixLQUFLLFFBQVEsZUFBZTtBQUN0RSxXQUFLLGtCQUNELGFBQWEsU0FBUyxpQkFBaUIsV0FBVyxlQUFlO0FBQ3JFLFdBQUssb0JBQ0QsYUFBYSxTQUFTLGlCQUFpQixpQkFBaUIsZUFBZTtBQUMzRSxXQUFLLHdCQUNELGFBQWEsU0FBUyxpQkFBaUIsS0FBSyxRQUFRLGVBQWU7QUFDdkUsV0FBSyxnQkFDRCxhQUFhLFNBQVMsZUFBZSxXQUFXLGVBQWU7QUFDbkUsV0FBSyxrQkFDRCxhQUFhLFNBQVMsZUFBZSxpQkFBaUIsZUFBZTtBQUN6RSxXQUFLLHNCQUNELGFBQWEsU0FBUyxlQUFlLEtBQUssUUFBUSxlQUFlO0FBQ3JFLFdBQUssZ0JBQ0QsYUFBYSxTQUFTLGVBQWUsV0FBVyxlQUFlO0FBQ25FLFdBQUssa0JBQ0QsYUFBYSxTQUFTLGVBQWUsaUJBQWlCLGVBQWU7QUFDekUsV0FBSyxzQkFDRCxhQUFhLFNBQVMsZUFBZSxLQUFLLFFBQVEsZUFBZTtBQUNyRSxXQUFLLGFBQWE7QUFDbEIsV0FBSyxlQUFlO0FBQ3BCLFdBQUssb0JBQW9CO0FBQ3pCLFdBQUssbUJBQW1CO0FBQ3hCLFlBQU0sa0JBQWtCLFlBQVksU0FBUztBQUM3QyxZQUFNLGdCQUFnQixrQkFBa0IsZUFBZTtBQUN2RCxVQUFJLG1CQUFtQixlQUFlO0FBR2xDLGFBQUssYUFBYSxrQkFBa0IsV0FBVztBQUMvQyxhQUFLLGVBQWU7QUFDcEIsYUFBSyxvQkFBb0I7QUFDekIsYUFBSyxtQkFBbUIsS0FBSztBQUM3QixZQUFJLENBQUMsU0FBUyxnQkFBZ0I7QUFDMUIsZUFBSyxrQkFBa0I7QUFDdkIsZUFBSyxvQkFBb0I7QUFDekIsZUFBSyx3QkFBd0IsS0FBSztBQUFBLFFBQ3RDO0FBQ0EsWUFBSSxDQUFDLFNBQVMsY0FBYztBQUN4QixlQUFLLGdCQUFnQjtBQUNyQixlQUFLLGtCQUFrQjtBQUN2QixlQUFLLHNCQUFzQixLQUFLO0FBQUEsUUFDcEM7QUFDQSxZQUFJLENBQUMsU0FBUyxjQUFjO0FBQ3hCLGVBQUssZ0JBQWdCO0FBQ3JCLGVBQUssa0JBQWtCO0FBQ3ZCLGVBQUssc0JBQXNCLEtBQUs7QUFBQSxRQUNwQztBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsSUFDQSxLQUFLLFlBQVksVUFBVTtBQUN2QixhQUFPLEtBQUssVUFDTixLQUFLLFFBQVEsT0FBTyxLQUFLLFdBQVcsS0FBSyxNQUFNLFlBQVksUUFBUSxJQUNuRSxJQUFJLFNBQVMsWUFBWSxRQUFRO0FBQUEsSUFDM0M7QUFBQSxJQUNBLFVBQVUsWUFBWSxVQUFVLFFBQVE7QUFDcEMsYUFBTyxLQUFLLGVBQ04sS0FBSyxhQUFhLFlBQVksS0FBSyxnQkFBZ0IsS0FBSyxvQkFBb0IsWUFBWSxVQUFVLE1BQU0sSUFDeEc7QUFBQSxJQUNWO0FBQUEsSUFDQSxPQUFPLFlBQVksVUFBVSxXQUFXLFdBQVcsUUFBUTtBQUN2RCxhQUFPLEtBQUssWUFDTixLQUFLLFVBQVUsU0FBUyxLQUFLLGFBQWEsS0FBSyxpQkFBaUIsWUFBWSxVQUFVLFdBQVcsV0FBVyxNQUFNLElBQ2xILFNBQVMsTUFBTSxXQUFXLFNBQVM7QUFBQSxJQUM3QztBQUFBLElBQ0EsWUFBWSxZQUFZLE9BQU87QUFDM0IsYUFBTyxLQUFLLGlCQUNOLEtBQUssZUFBZSxjQUFjLEtBQUssa0JBQWtCLEtBQUssc0JBQXNCLFlBQVksS0FBSyxJQUNyRztBQUFBLElBQ1Y7QUFBQSxJQUNBLGFBQWEsWUFBWSxNQUFNO0FBQzNCLFVBQUksYUFBYTtBQUNqQixVQUFJLEtBQUssaUJBQWlCO0FBQ3RCLFlBQUksS0FBSyxZQUFZO0FBQ2pCLHFCQUFXLGVBQWUsS0FBSyxLQUFLLGlCQUFpQjtBQUFBLFFBQ3pEO0FBQ0EscUJBQWEsS0FBSyxnQkFBZ0IsZUFBZSxLQUFLLG1CQUFtQixLQUFLLHVCQUF1QixZQUFZLElBQUk7QUFDckgsWUFBSSxDQUFDO0FBQ0QsdUJBQWE7QUFBQSxNQUNyQixPQUNLO0FBQ0QsWUFBSSxLQUFLLFlBQVk7QUFDakIsZUFBSyxXQUFXLElBQUk7QUFBQSxRQUN4QixXQUNTLEtBQUssUUFBUSxXQUFXO0FBQzdCLDRCQUFrQixJQUFJO0FBQUEsUUFDMUIsT0FDSztBQUNELGdCQUFNLElBQUksTUFBTSw2QkFBNkI7QUFBQSxRQUNqRDtBQUFBLE1BQ0o7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUFBLElBQ0EsV0FBVyxZQUFZLE1BQU0sV0FBVyxXQUFXO0FBQy9DLGFBQU8sS0FBSyxnQkFDTixLQUFLLGNBQWMsYUFBYSxLQUFLLGlCQUFpQixLQUFLLHFCQUFxQixZQUFZLE1BQU0sV0FBVyxTQUFTLElBQ3RILEtBQUssU0FBUyxNQUFNLFdBQVcsU0FBUztBQUFBLElBQ2xEO0FBQUEsSUFDQSxXQUFXLFlBQVksTUFBTTtBQUN6QixVQUFJO0FBQ0osVUFBSSxLQUFLLGVBQWU7QUFDcEIsZ0JBQVEsS0FBSyxjQUFjLGFBQWEsS0FBSyxpQkFBaUIsS0FBSyxxQkFBcUIsWUFBWSxJQUFJO0FBQUEsTUFDNUcsT0FDSztBQUNELFlBQUksQ0FBQyxLQUFLLFVBQVU7QUFDaEIsZ0JBQU0sTUFBTSx3QkFBd0I7QUFBQSxRQUN4QztBQUNBLGdCQUFRLEtBQUssU0FBUyxJQUFJO0FBQUEsTUFDOUI7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUFBLElBQ0EsUUFBUSxZQUFZLFNBQVM7QUFHekIsVUFBSTtBQUNBLGFBQUssY0FDRCxLQUFLLFdBQVcsVUFBVSxLQUFLLGNBQWMsS0FBSyxrQkFBa0IsWUFBWSxPQUFPO0FBQUEsTUFDL0YsU0FDTyxLQUFLO0FBQ1IsYUFBSyxZQUFZLFlBQVksR0FBRztBQUFBLE1BQ3BDO0FBQUEsSUFDSjtBQUFBLElBQ0EsaUJBQWlCLE1BQU0sT0FBTztBQUMxQixZQUFNLFNBQVMsS0FBSztBQUNwQixZQUFNLE9BQU8sT0FBTyxJQUFJO0FBQ3hCLFlBQU0sT0FBUSxPQUFPLElBQUksSUFBSSxPQUFPO0FBQ3BDLFVBQUksT0FBTyxHQUFHO0FBQ1YsY0FBTSxJQUFJLE1BQU0sMENBQTBDO0FBQUEsTUFDOUQ7QUFDQSxVQUFJLFFBQVEsS0FBSyxRQUFRLEdBQUc7QUFDeEIsY0FBTSxVQUFVO0FBQUEsVUFDWixXQUFXLE9BQU8sV0FBVyxJQUFJO0FBQUEsVUFDakMsV0FBVyxPQUFPLFdBQVcsSUFBSTtBQUFBLFVBQ2pDLFdBQVcsT0FBTyxXQUFXLElBQUk7QUFBQSxVQUNqQyxRQUFRO0FBQUEsUUFDWjtBQUNBLGFBQUssUUFBUSxLQUFLLE9BQU8sT0FBTztBQUFBLE1BQ3BDO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFBQSxFQUNBLE1BQU0sU0FBUztBQUFBLElBQ1g7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLGlCQUFpQjtBQUFBLElBQ2pCLFNBQVM7QUFBQSxJQUNULFlBQVksTUFBTSxRQUFRLFVBQVUsU0FBUyxZQUFZLFVBQVU7QUFDL0QsV0FBSyxPQUFPO0FBQ1osV0FBSyxTQUFTO0FBQ2QsV0FBSyxPQUFPO0FBQ1osV0FBSyxhQUFhO0FBQ2xCLFdBQUssV0FBVztBQUNoQixVQUFJLENBQUMsVUFBVTtBQUNYLGNBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLE1BQzdDO0FBQ0EsV0FBSyxXQUFXO0FBQ2hCLFlBQU1BLFFBQU87QUFFYixVQUFJLFNBQVMsYUFBYSxXQUFXLFFBQVEsTUFBTTtBQUMvQyxhQUFLLFNBQVMsU0FBUztBQUFBLE1BQzNCLE9BQ0s7QUFDRCxhQUFLLFNBQVMsV0FBWTtBQUN0QixpQkFBTyxTQUFTLFdBQVcsS0FBSyxRQUFRQSxPQUFNLE1BQU0sU0FBUztBQUFBLFFBQ2pFO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFBQSxJQUNBLE9BQU8sV0FBVyxNQUFNLFFBQVEsTUFBTTtBQUNsQyxVQUFJLENBQUMsTUFBTTtBQUNQLGVBQU87QUFBQSxNQUNYO0FBQ0E7QUFDQSxVQUFJO0FBQ0EsYUFBSztBQUNMLGVBQU8sS0FBSyxLQUFLLFFBQVEsTUFBTSxRQUFRLElBQUk7QUFBQSxNQUMvQyxVQUNBO0FBQ0ksWUFBSSw2QkFBNkIsR0FBRztBQUNoQyw4QkFBb0I7QUFBQSxRQUN4QjtBQUNBO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFBQSxJQUNBLElBQUksT0FBTztBQUNQLGFBQU8sS0FBSztBQUFBLElBQ2hCO0FBQUEsSUFDQSxJQUFJLFFBQVE7QUFDUixhQUFPLEtBQUs7QUFBQSxJQUNoQjtBQUFBLElBQ0Esd0JBQXdCO0FBQ3BCLFdBQUssY0FBYyxjQUFjLFVBQVU7QUFBQSxJQUMvQztBQUFBLElBQ0EsY0FBYyxTQUFTLFlBQVksWUFBWTtBQUMzQyxVQUFJLEtBQUssV0FBVyxjQUFjLEtBQUssV0FBVyxZQUFZO0FBQzFELGFBQUssU0FBUztBQUNkLFlBQUksV0FBVyxjQUFjO0FBQ3pCLGVBQUssaUJBQWlCO0FBQUEsUUFDMUI7QUFBQSxNQUNKLE9BQ0s7QUFDRCxjQUFNLElBQUksTUFBTSxHQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssTUFBTSw2QkFBNkIsT0FBTyx1QkFBdUIsVUFBVSxJQUFJLGFBQWEsVUFBVSxhQUFhLE1BQU0sRUFBRSxVQUFVLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDOUw7QUFBQSxJQUNKO0FBQUEsSUFDQSxXQUFXO0FBQ1AsVUFBSSxLQUFLLFFBQVEsT0FBTyxLQUFLLEtBQUssYUFBYSxhQUFhO0FBQ3hELGVBQU8sS0FBSyxLQUFLLFNBQVMsU0FBUztBQUFBLE1BQ3ZDLE9BQ0s7QUFDRCxlQUFPLE9BQU8sVUFBVSxTQUFTLEtBQUssSUFBSTtBQUFBLE1BQzlDO0FBQUEsSUFDSjtBQUFBO0FBQUE7QUFBQSxJQUdBLFNBQVM7QUFDTCxhQUFPO0FBQUEsUUFDSCxNQUFNLEtBQUs7QUFBQSxRQUNYLE9BQU8sS0FBSztBQUFBLFFBQ1osUUFBUSxLQUFLO0FBQUEsUUFDYixNQUFNLEtBQUssS0FBSztBQUFBLFFBQ2hCLFVBQVUsS0FBSztBQUFBLE1BQ25CO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFNQSxRQUFNLG1CQUFtQixXQUFXLFlBQVk7QUFDaEQsUUFBTSxnQkFBZ0IsV0FBVyxTQUFTO0FBQzFDLFFBQU0sYUFBYSxXQUFXLE1BQU07QUFDcEMsTUFBSSxrQkFBa0IsQ0FBQztBQUN2QixNQUFJLDRCQUE0QjtBQUNoQyxNQUFJO0FBQ0osV0FBUyx3QkFBd0IsTUFBTTtBQUNuQyxRQUFJLENBQUMsNkJBQTZCO0FBQzlCLFVBQUksT0FBTyxhQUFhLEdBQUc7QUFDdkIsc0NBQThCLE9BQU8sYUFBYSxFQUFFLFFBQVEsQ0FBQztBQUFBLE1BQ2pFO0FBQUEsSUFDSjtBQUNBLFFBQUksNkJBQTZCO0FBQzdCLFVBQUksYUFBYSw0QkFBNEIsVUFBVTtBQUN2RCxVQUFJLENBQUMsWUFBWTtBQUdiLHFCQUFhLDRCQUE0QixNQUFNO0FBQUEsTUFDbkQ7QUFDQSxpQkFBVyxLQUFLLDZCQUE2QixJQUFJO0FBQUEsSUFDckQsT0FDSztBQUNELGFBQU8sZ0JBQWdCLEVBQUUsTUFBTSxDQUFDO0FBQUEsSUFDcEM7QUFBQSxFQUNKO0FBQ0EsV0FBUyxrQkFBa0IsTUFBTTtBQUc3QixRQUFJLDhCQUE4QixLQUFLLGdCQUFnQixXQUFXLEdBQUc7QUFFakUsOEJBQXdCLG1CQUFtQjtBQUFBLElBQy9DO0FBQ0EsWUFBUSxnQkFBZ0IsS0FBSyxJQUFJO0FBQUEsRUFDckM7QUFDQSxXQUFTLHNCQUFzQjtBQUMzQixRQUFJLENBQUMsMkJBQTJCO0FBQzVCLGtDQUE0QjtBQUM1QixhQUFPLGdCQUFnQixRQUFRO0FBQzNCLGNBQU0sUUFBUTtBQUNkLDBCQUFrQixDQUFDO0FBQ25CLGlCQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ25DLGdCQUFNLE9BQU8sTUFBTSxDQUFDO0FBQ3BCLGNBQUk7QUFDQSxpQkFBSyxLQUFLLFFBQVEsTUFBTSxNQUFNLElBQUk7QUFBQSxVQUN0QyxTQUNPLE9BQU87QUFDVixpQkFBSyxpQkFBaUIsS0FBSztBQUFBLFVBQy9CO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFDQSxXQUFLLG1CQUFtQjtBQUN4QixrQ0FBNEI7QUFBQSxJQUNoQztBQUFBLEVBQ0o7QUFNQSxRQUFNLFVBQVUsRUFBRSxNQUFNLFVBQVU7QUFDbEMsUUFBTSxlQUFlLGdCQUFnQixhQUFhLGNBQWMsWUFBWSxhQUFhLFVBQVUsV0FBVyxZQUFZLGFBQWEsVUFBVTtBQUNqSixRQUFNLFlBQVksYUFBYSxZQUFZLGFBQWEsWUFBWTtBQUNwRSxRQUFNLFVBQVUsQ0FBQztBQUNqQixRQUFNLE9BQU87QUFBQSxJQUNULFFBQVE7QUFBQSxJQUNSLGtCQUFrQixNQUFNO0FBQUEsSUFDeEIsa0JBQWtCO0FBQUEsSUFDbEIsb0JBQW9CO0FBQUEsSUFDcEI7QUFBQSxJQUNBLG1CQUFtQixNQUFNLENBQUMsU0FBUyxXQUFXLGlDQUFpQyxDQUFDO0FBQUEsSUFDaEYsa0JBQWtCLE1BQU0sQ0FBQztBQUFBLElBQ3pCLG1CQUFtQjtBQUFBLElBQ25CLGFBQWEsTUFBTTtBQUFBLElBQ25CLGVBQWUsTUFBTSxDQUFDO0FBQUEsSUFDdEIsV0FBVyxNQUFNO0FBQUEsSUFDakIsZ0JBQWdCLE1BQU07QUFBQSxJQUN0QixxQkFBcUIsTUFBTTtBQUFBLElBQzNCLFlBQVksTUFBTTtBQUFBLElBQ2xCLGtCQUFrQixNQUFNO0FBQUEsSUFDeEIsc0JBQXNCLE1BQU07QUFBQSxJQUM1QixnQ0FBZ0MsTUFBTTtBQUFBLElBQ3RDLGNBQWMsTUFBTTtBQUFBLElBQ3BCLFlBQVksTUFBTSxDQUFDO0FBQUEsSUFDbkIsWUFBWSxNQUFNO0FBQUEsSUFDbEIscUJBQXFCLE1BQU07QUFBQSxJQUMzQixrQkFBa0IsTUFBTSxDQUFDO0FBQUEsSUFDekIsdUJBQXVCLE1BQU07QUFBQSxJQUM3QixtQkFBbUIsTUFBTTtBQUFBLElBQ3pCLGdCQUFnQixNQUFNO0FBQUEsSUFDdEI7QUFBQSxFQUNKO0FBQ0EsTUFBSSxvQkFBb0IsRUFBRSxRQUFRLE1BQU0sTUFBTSxJQUFJLFNBQVMsTUFBTSxJQUFJLEVBQUU7QUFDdkUsTUFBSSxlQUFlO0FBQ25CLE1BQUksNEJBQTRCO0FBQ2hDLFdBQVMsT0FBTztBQUFBLEVBQUU7QUFDbEIscUJBQW1CLFFBQVEsTUFBTTtBQUNqQyxTQUFPO0FBQ1g7QUFFQSxTQUFTLFdBQVc7QUFVaEIsUUFBTUMsVUFBUztBQUNmLFFBQU0saUJBQWlCQSxRQUFPLFdBQVcseUJBQXlCLENBQUMsTUFBTTtBQUN6RSxNQUFJQSxRQUFPLE1BQU0sTUFBTSxrQkFBa0IsT0FBT0EsUUFBTyxNQUFNLEVBQUUsZUFBZSxhQUFhO0FBQ3ZGLFVBQU0sSUFBSSxNQUFNLHNCQUFzQjtBQUFBLEVBQzFDO0FBRUEsRUFBQUEsUUFBTyxNQUFNLE1BQU0sU0FBUztBQUM1QixTQUFPQSxRQUFPLE1BQU07QUFDeEI7QUFVQSxJQUFNLGlDQUFpQyxPQUFPO0FBRTlDLElBQU0sdUJBQXVCLE9BQU87QUFFcEMsSUFBTSx1QkFBdUIsT0FBTztBQUVwQyxJQUFNLGVBQWUsT0FBTztBQUU1QixJQUFNLGFBQWEsTUFBTSxVQUFVO0FBRW5DLElBQU0seUJBQXlCO0FBRS9CLElBQU0sNEJBQTRCO0FBRWxDLElBQU0saUNBQWlDLFdBQVcsc0JBQXNCO0FBRXhFLElBQU0sb0NBQW9DLFdBQVcseUJBQXlCO0FBRTlFLElBQU0sV0FBVztBQUVqQixJQUFNLFlBQVk7QUFFbEIsSUFBTSxxQkFBcUIsV0FBVyxFQUFFO0FBQ3hDLFNBQVMsb0JBQW9CLFVBQVUsUUFBUTtBQUMzQyxTQUFPLEtBQUssUUFBUSxLQUFLLFVBQVUsTUFBTTtBQUM3QztBQUNBLFNBQVMsaUNBQWlDLFFBQVEsVUFBVSxNQUFNLGdCQUFnQixjQUFjO0FBQzVGLFNBQU8sS0FBSyxRQUFRLGtCQUFrQixRQUFRLFVBQVUsTUFBTSxnQkFBZ0IsWUFBWTtBQUM5RjtBQUNBLElBQU0sYUFBYTtBQUNuQixJQUFNLGlCQUFpQixPQUFPLFdBQVc7QUFDekMsSUFBTSxpQkFBaUIsaUJBQWlCLFNBQVM7QUFDakQsSUFBTSxVQUFXLGtCQUFrQixrQkFBbUI7QUFDdEQsSUFBTSxtQkFBbUI7QUFDekIsU0FBUyxjQUFjLE1BQU0sUUFBUTtBQUNqQyxXQUFTLElBQUksS0FBSyxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDdkMsUUFBSSxPQUFPLEtBQUssQ0FBQyxNQUFNLFlBQVk7QUFDL0IsV0FBSyxDQUFDLElBQUksb0JBQW9CLEtBQUssQ0FBQyxHQUFHLFNBQVMsTUFBTSxDQUFDO0FBQUEsSUFDM0Q7QUFBQSxFQUNKO0FBQ0EsU0FBTztBQUNYO0FBQ0EsU0FBUyxlQUFlLFdBQVcsU0FBUztBQUN4QyxRQUFNLFNBQVMsVUFBVSxZQUFZLE1BQU07QUFDM0MsV0FBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLFFBQVEsS0FBSztBQUNyQyxVQUFNLE9BQU8sUUFBUSxDQUFDO0FBQ3RCLFVBQU0sV0FBVyxVQUFVLElBQUk7QUFDL0IsUUFBSSxVQUFVO0FBQ1YsWUFBTSxnQkFBZ0IsK0JBQStCLFdBQVcsSUFBSTtBQUNwRSxVQUFJLENBQUMsbUJBQW1CLGFBQWEsR0FBRztBQUNwQztBQUFBLE1BQ0o7QUFDQSxnQkFBVSxJQUFJLEtBQUssQ0FBQ0MsY0FBYTtBQUM3QixjQUFNLFVBQVUsV0FBWTtBQUN4QixpQkFBT0EsVUFBUyxNQUFNLE1BQU0sY0FBYyxXQUFXLFNBQVMsTUFBTSxJQUFJLENBQUM7QUFBQSxRQUM3RTtBQUNBLDhCQUFzQixTQUFTQSxTQUFRO0FBQ3ZDLGVBQU87QUFBQSxNQUNYLEdBQUcsUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNKO0FBQ0o7QUFDQSxTQUFTLG1CQUFtQixjQUFjO0FBQ3RDLE1BQUksQ0FBQyxjQUFjO0FBQ2YsV0FBTztBQUFBLEVBQ1g7QUFDQSxNQUFJLGFBQWEsYUFBYSxPQUFPO0FBQ2pDLFdBQU87QUFBQSxFQUNYO0FBQ0EsU0FBTyxFQUFFLE9BQU8sYUFBYSxRQUFRLGNBQWMsT0FBTyxhQUFhLFFBQVE7QUFDbkY7QUFDQSxJQUFNLGNBQWMsT0FBTyxzQkFBc0IsZUFBZSxnQkFBZ0I7QUFHaEYsSUFBTSxTQUFTLEVBQUUsUUFBUSxZQUNyQixPQUFPLFFBQVEsWUFBWSxlQUMzQixRQUFRLFFBQVEsU0FBUyxNQUFNO0FBQ25DLElBQU0sWUFBWSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsRUFBRSxrQkFBa0IsZUFBZSxhQUFhO0FBSTlGLElBQU0sUUFBUSxPQUFPLFFBQVEsWUFBWSxlQUNyQyxRQUFRLFFBQVEsU0FBUyxNQUFNLHNCQUMvQixDQUFDLGVBQ0QsQ0FBQyxFQUFFLGtCQUFrQixlQUFlLGFBQWE7QUFDckQsSUFBTSx5QkFBeUIsQ0FBQztBQUNoQyxJQUFNLDJCQUEyQixXQUFXLHFCQUFxQjtBQUNqRSxJQUFNLFNBQVMsU0FBVSxPQUFPO0FBRzVCLFVBQVEsU0FBUyxRQUFRO0FBQ3pCLE1BQUksQ0FBQyxPQUFPO0FBQ1I7QUFBQSxFQUNKO0FBQ0EsTUFBSSxrQkFBa0IsdUJBQXVCLE1BQU0sSUFBSTtBQUN2RCxNQUFJLENBQUMsaUJBQWlCO0FBQ2xCLHNCQUFrQix1QkFBdUIsTUFBTSxJQUFJLElBQUksV0FBVyxnQkFBZ0IsTUFBTSxJQUFJO0FBQUEsRUFDaEc7QUFDQSxRQUFNLFNBQVMsUUFBUSxNQUFNLFVBQVU7QUFDdkMsUUFBTSxXQUFXLE9BQU8sZUFBZTtBQUN2QyxNQUFJO0FBQ0osTUFBSSxhQUFhLFdBQVcsa0JBQWtCLE1BQU0sU0FBUyxTQUFTO0FBSWxFLFVBQU0sYUFBYTtBQUNuQixhQUNJLFlBQ0ksU0FBUyxLQUFLLE1BQU0sV0FBVyxTQUFTLFdBQVcsVUFBVSxXQUFXLFFBQVEsV0FBVyxPQUFPLFdBQVcsS0FBSztBQUMxSCxRQUFJLFdBQVcsTUFBTTtBQUNqQixZQUFNLGVBQWU7QUFBQSxJQUN6QjtBQUFBLEVBQ0osT0FDSztBQUNELGFBQVMsWUFBWSxTQUFTLE1BQU0sTUFBTSxTQUFTO0FBQ25EO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BTUEsTUFBTSxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQU1YLFFBQVEsd0JBQXdCO0FBQUE7QUFBQSxNQUdoQyxPQUFPLFdBQVc7QUFBQSxNQUFVO0FBQzVCLFlBQU0sY0FBYztBQUFBLElBQ3hCLFdBQ1MsVUFBVSxVQUFhLENBQUMsUUFBUTtBQUNyQyxZQUFNLGVBQWU7QUFBQSxJQUN6QjtBQUFBLEVBQ0o7QUFDQSxTQUFPO0FBQ1g7QUFDQSxTQUFTLGNBQWMsS0FBSyxNQUFNLFdBQVc7QUFDekMsTUFBSSxPQUFPLCtCQUErQixLQUFLLElBQUk7QUFDbkQsTUFBSSxDQUFDLFFBQVEsV0FBVztBQUVwQixVQUFNLGdCQUFnQiwrQkFBK0IsV0FBVyxJQUFJO0FBQ3BFLFFBQUksZUFBZTtBQUNmLGFBQU8sRUFBRSxZQUFZLE1BQU0sY0FBYyxLQUFLO0FBQUEsSUFDbEQ7QUFBQSxFQUNKO0FBR0EsTUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLGNBQWM7QUFDN0I7QUFBQSxFQUNKO0FBQ0EsUUFBTSxzQkFBc0IsV0FBVyxPQUFPLE9BQU8sU0FBUztBQUM5RCxNQUFJLElBQUksZUFBZSxtQkFBbUIsS0FBSyxJQUFJLG1CQUFtQixHQUFHO0FBQ3JFO0FBQUEsRUFDSjtBQU1BLFNBQU8sS0FBSztBQUNaLFNBQU8sS0FBSztBQUNaLFFBQU0sa0JBQWtCLEtBQUs7QUFDN0IsUUFBTSxrQkFBa0IsS0FBSztBQUU3QixRQUFNLFlBQVksS0FBSyxNQUFNLENBQUM7QUFDOUIsTUFBSSxrQkFBa0IsdUJBQXVCLFNBQVM7QUFDdEQsTUFBSSxDQUFDLGlCQUFpQjtBQUNsQixzQkFBa0IsdUJBQXVCLFNBQVMsSUFBSSxXQUFXLGdCQUFnQixTQUFTO0FBQUEsRUFDOUY7QUFDQSxPQUFLLE1BQU0sU0FBVSxVQUFVO0FBSzNCLFFBQUksU0FBUztBQUNiLFFBQUksQ0FBQyxVQUFVLFFBQVEsU0FBUztBQUM1QixlQUFTO0FBQUEsSUFDYjtBQUNBLFFBQUksQ0FBQyxRQUFRO0FBQ1Q7QUFBQSxJQUNKO0FBQ0EsVUFBTSxnQkFBZ0IsT0FBTyxlQUFlO0FBQzVDLFFBQUksT0FBTyxrQkFBa0IsWUFBWTtBQUNyQyxhQUFPLG9CQUFvQixXQUFXLE1BQU07QUFBQSxJQUNoRDtBQUlBLHFCQUFpQixLQUFLLFFBQVEsSUFBSTtBQUNsQyxXQUFPLGVBQWUsSUFBSTtBQUMxQixRQUFJLE9BQU8sYUFBYSxZQUFZO0FBQ2hDLGFBQU8saUJBQWlCLFdBQVcsUUFBUSxLQUFLO0FBQUEsSUFDcEQ7QUFBQSxFQUNKO0FBR0EsT0FBSyxNQUFNLFdBQVk7QUFHbkIsUUFBSSxTQUFTO0FBQ2IsUUFBSSxDQUFDLFVBQVUsUUFBUSxTQUFTO0FBQzVCLGVBQVM7QUFBQSxJQUNiO0FBQ0EsUUFBSSxDQUFDLFFBQVE7QUFDVCxhQUFPO0FBQUEsSUFDWDtBQUNBLFVBQU0sV0FBVyxPQUFPLGVBQWU7QUFDdkMsUUFBSSxVQUFVO0FBQ1YsYUFBTztBQUFBLElBQ1gsV0FDUyxpQkFBaUI7QUFPdEIsVUFBSSxRQUFRLGdCQUFnQixLQUFLLElBQUk7QUFDckMsVUFBSSxPQUFPO0FBQ1AsYUFBSyxJQUFJLEtBQUssTUFBTSxLQUFLO0FBQ3pCLFlBQUksT0FBTyxPQUFPLGdCQUFnQixNQUFNLFlBQVk7QUFDaEQsaUJBQU8sZ0JBQWdCLElBQUk7QUFBQSxRQUMvQjtBQUNBLGVBQU87QUFBQSxNQUNYO0FBQUEsSUFDSjtBQUNBLFdBQU87QUFBQSxFQUNYO0FBQ0EsdUJBQXFCLEtBQUssTUFBTSxJQUFJO0FBQ3BDLE1BQUksbUJBQW1CLElBQUk7QUFDL0I7QUFDQSxTQUFTLGtCQUFrQixLQUFLLFlBQVksV0FBVztBQUNuRCxNQUFJLFlBQVk7QUFDWixhQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsUUFBUSxLQUFLO0FBQ3hDLG9CQUFjLEtBQUssT0FBTyxXQUFXLENBQUMsR0FBRyxTQUFTO0FBQUEsSUFDdEQ7QUFBQSxFQUNKLE9BQ0s7QUFDRCxVQUFNLGVBQWUsQ0FBQztBQUN0QixlQUFXLFFBQVEsS0FBSztBQUNwQixVQUFJLEtBQUssTUFBTSxHQUFHLENBQUMsS0FBSyxNQUFNO0FBQzFCLHFCQUFhLEtBQUssSUFBSTtBQUFBLE1BQzFCO0FBQUEsSUFDSjtBQUNBLGFBQVMsSUFBSSxHQUFHLElBQUksYUFBYSxRQUFRLEtBQUs7QUFDMUMsb0JBQWMsS0FBSyxhQUFhLENBQUMsR0FBRyxTQUFTO0FBQUEsSUFDakQ7QUFBQSxFQUNKO0FBQ0o7QUFDQSxJQUFNLHNCQUFzQixXQUFXLGtCQUFrQjtBQUV6RCxTQUFTLFdBQVcsV0FBVztBQUMzQixRQUFNLGdCQUFnQixRQUFRLFNBQVM7QUFDdkMsTUFBSSxDQUFDO0FBQ0Q7QUFFSixVQUFRLFdBQVcsU0FBUyxDQUFDLElBQUk7QUFDakMsVUFBUSxTQUFTLElBQUksV0FBWTtBQUM3QixVQUFNLElBQUksY0FBYyxXQUFXLFNBQVM7QUFDNUMsWUFBUSxFQUFFLFFBQVE7QUFBQSxNQUNkLEtBQUs7QUFDRCxhQUFLLG1CQUFtQixJQUFJLElBQUksY0FBYztBQUM5QztBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssbUJBQW1CLElBQUksSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBQ2xEO0FBQUEsTUFDSixLQUFLO0FBQ0QsYUFBSyxtQkFBbUIsSUFBSSxJQUFJLGNBQWMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDeEQ7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLG1CQUFtQixJQUFJLElBQUksY0FBYyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUM5RDtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssbUJBQW1CLElBQUksSUFBSSxjQUFjLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ3BFO0FBQUEsTUFDSjtBQUNJLGNBQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUFBLElBQzVDO0FBQUEsRUFDSjtBQUVBLHdCQUFzQixRQUFRLFNBQVMsR0FBRyxhQUFhO0FBQ3ZELFFBQU0sV0FBVyxJQUFJLGNBQWMsV0FBWTtBQUFBLEVBQUUsQ0FBQztBQUNsRCxNQUFJO0FBQ0osT0FBSyxRQUFRLFVBQVU7QUFFbkIsUUFBSSxjQUFjLG9CQUFvQixTQUFTO0FBQzNDO0FBQ0osS0FBQyxTQUFVQyxPQUFNO0FBQ2IsVUFBSSxPQUFPLFNBQVNBLEtBQUksTUFBTSxZQUFZO0FBQ3RDLGdCQUFRLFNBQVMsRUFBRSxVQUFVQSxLQUFJLElBQUksV0FBWTtBQUM3QyxpQkFBTyxLQUFLLG1CQUFtQixFQUFFQSxLQUFJLEVBQUUsTUFBTSxLQUFLLG1CQUFtQixHQUFHLFNBQVM7QUFBQSxRQUNyRjtBQUFBLE1BQ0osT0FDSztBQUNELDZCQUFxQixRQUFRLFNBQVMsRUFBRSxXQUFXQSxPQUFNO0FBQUEsVUFDckQsS0FBSyxTQUFVLElBQUk7QUFDZixnQkFBSSxPQUFPLE9BQU8sWUFBWTtBQUMxQixtQkFBSyxtQkFBbUIsRUFBRUEsS0FBSSxJQUFJLG9CQUFvQixJQUFJLFlBQVksTUFBTUEsS0FBSTtBQUloRixvQ0FBc0IsS0FBSyxtQkFBbUIsRUFBRUEsS0FBSSxHQUFHLEVBQUU7QUFBQSxZQUM3RCxPQUNLO0FBQ0QsbUJBQUssbUJBQW1CLEVBQUVBLEtBQUksSUFBSTtBQUFBLFlBQ3RDO0FBQUEsVUFDSjtBQUFBLFVBQ0EsS0FBSyxXQUFZO0FBQ2IsbUJBQU8sS0FBSyxtQkFBbUIsRUFBRUEsS0FBSTtBQUFBLFVBQ3pDO0FBQUEsUUFDSixDQUFDO0FBQUEsTUFDTDtBQUFBLElBQ0osR0FBRyxJQUFJO0FBQUEsRUFDWDtBQUNBLE9BQUssUUFBUSxlQUFlO0FBQ3hCLFFBQUksU0FBUyxlQUFlLGNBQWMsZUFBZSxJQUFJLEdBQUc7QUFDNUQsY0FBUSxTQUFTLEVBQUUsSUFBSSxJQUFJLGNBQWMsSUFBSTtBQUFBLElBQ2pEO0FBQUEsRUFDSjtBQUNKO0FBQ0EsU0FBUyxZQUFZLFFBQVEsTUFBTSxTQUFTO0FBQ3hDLE1BQUksUUFBUTtBQUNaLFNBQU8sU0FBUyxDQUFDLE1BQU0sZUFBZSxJQUFJLEdBQUc7QUFDekMsWUFBUSxxQkFBcUIsS0FBSztBQUFBLEVBQ3RDO0FBQ0EsTUFBSSxDQUFDLFNBQVMsT0FBTyxJQUFJLEdBQUc7QUFFeEIsWUFBUTtBQUFBLEVBQ1o7QUFDQSxRQUFNLGVBQWUsV0FBVyxJQUFJO0FBQ3BDLE1BQUksV0FBVztBQUNmLE1BQUksVUFBVSxFQUFFLFdBQVcsTUFBTSxZQUFZLE1BQU0sQ0FBQyxNQUFNLGVBQWUsWUFBWSxJQUFJO0FBQ3JGLGVBQVcsTUFBTSxZQUFZLElBQUksTUFBTSxJQUFJO0FBRzNDLFVBQU0sT0FBTyxTQUFTLCtCQUErQixPQUFPLElBQUk7QUFDaEUsUUFBSSxtQkFBbUIsSUFBSSxHQUFHO0FBQzFCLFlBQU0sZ0JBQWdCLFFBQVEsVUFBVSxjQUFjLElBQUk7QUFDMUQsWUFBTSxJQUFJLElBQUksV0FBWTtBQUN0QixlQUFPLGNBQWMsTUFBTSxTQUFTO0FBQUEsTUFDeEM7QUFDQSw0QkFBc0IsTUFBTSxJQUFJLEdBQUcsUUFBUTtBQUFBLElBQy9DO0FBQUEsRUFDSjtBQUNBLFNBQU87QUFDWDtBQUVBLFNBQVMsZUFBZSxLQUFLLFVBQVUsYUFBYTtBQUNoRCxNQUFJLFlBQVk7QUFDaEIsV0FBUyxhQUFhLE1BQU07QUFDeEIsVUFBTSxPQUFPLEtBQUs7QUFDbEIsU0FBSyxLQUFLLEtBQUssS0FBSyxJQUFJLFdBQVk7QUFDaEMsV0FBSyxPQUFPLE1BQU0sTUFBTSxTQUFTO0FBQUEsSUFDckM7QUFDQSxjQUFVLE1BQU0sS0FBSyxRQUFRLEtBQUssSUFBSTtBQUN0QyxXQUFPO0FBQUEsRUFDWDtBQUNBLGNBQVksWUFBWSxLQUFLLFVBQVUsQ0FBQyxhQUFhLFNBQVVILE9BQU0sTUFBTTtBQUN2RSxVQUFNLE9BQU8sWUFBWUEsT0FBTSxJQUFJO0FBQ25DLFFBQUksS0FBSyxTQUFTLEtBQUssT0FBTyxLQUFLLEtBQUssS0FBSyxNQUFNLFlBQVk7QUFDM0QsYUFBTyxpQ0FBaUMsS0FBSyxNQUFNLEtBQUssS0FBSyxLQUFLLEdBQUcsTUFBTSxZQUFZO0FBQUEsSUFDM0YsT0FDSztBQUVELGFBQU8sU0FBUyxNQUFNQSxPQUFNLElBQUk7QUFBQSxJQUNwQztBQUFBLEVBQ0osQ0FBQztBQUNMO0FBQ0EsU0FBUyxzQkFBc0IsU0FBUyxVQUFVO0FBQzlDLFVBQVEsV0FBVyxrQkFBa0IsQ0FBQyxJQUFJO0FBQzlDO0FBQ0EsSUFBSSxxQkFBcUI7QUFDekIsSUFBSSxXQUFXO0FBQ2YsU0FBUyxhQUFhO0FBQ2xCLE1BQUksb0JBQW9CO0FBQ3BCLFdBQU87QUFBQSxFQUNYO0FBQ0EsdUJBQXFCO0FBQ3JCLE1BQUk7QUFDQSxVQUFNLEtBQUssZUFBZSxVQUFVO0FBQ3BDLFFBQUksR0FBRyxRQUFRLE9BQU8sTUFBTSxNQUFNLEdBQUcsUUFBUSxVQUFVLE1BQU0sTUFBTSxHQUFHLFFBQVEsT0FBTyxNQUFNLElBQUk7QUFDM0YsaUJBQVc7QUFBQSxJQUNmO0FBQUEsRUFDSixTQUNPLE9BQU87QUFBQSxFQUFFO0FBQ2hCLFNBQU87QUFDWDtBQUNBLFNBQVMsV0FBVyxPQUFPO0FBQ3ZCLFNBQU8sT0FBTyxVQUFVO0FBQzVCO0FBQ0EsU0FBUyxTQUFTLE9BQU87QUFDckIsU0FBTyxPQUFPLFVBQVU7QUFDNUI7QUFPQSxJQUFNLGlDQUFpQztBQUFBLEVBQ25DLE1BQU07QUFDVjtBQUNBLElBQU0sdUJBQXVCLENBQUM7QUFDOUIsSUFBTSxnQkFBZ0IsQ0FBQztBQUN2QixJQUFNLHlCQUF5QixJQUFJLE9BQU8sTUFBTSxxQkFBcUIscUJBQXFCO0FBQzFGLElBQU0sK0JBQStCLFdBQVcsb0JBQW9CO0FBQ3BFLFNBQVMsa0JBQWtCLFdBQVcsbUJBQW1CO0FBQ3JELFFBQU0sa0JBQWtCLG9CQUFvQixrQkFBa0IsU0FBUyxJQUFJLGFBQWE7QUFDeEYsUUFBTSxpQkFBaUIsb0JBQW9CLGtCQUFrQixTQUFTLElBQUksYUFBYTtBQUN2RixRQUFNLFNBQVMscUJBQXFCO0FBQ3BDLFFBQU0sZ0JBQWdCLHFCQUFxQjtBQUMzQyx1QkFBcUIsU0FBUyxJQUFJLENBQUM7QUFDbkMsdUJBQXFCLFNBQVMsRUFBRSxTQUFTLElBQUk7QUFDN0MsdUJBQXFCLFNBQVMsRUFBRSxRQUFRLElBQUk7QUFDaEQ7QUFDQSxTQUFTLGlCQUFpQkksVUFBUyxLQUFLLE1BQU0sY0FBYztBQUN4RCxRQUFNLHFCQUFzQixnQkFBZ0IsYUFBYSxPQUFRO0FBQ2pFLFFBQU0sd0JBQXlCLGdCQUFnQixhQUFhLE1BQU87QUFDbkUsUUFBTSwyQkFBNEIsZ0JBQWdCLGFBQWEsYUFBYztBQUM3RSxRQUFNLHNDQUF1QyxnQkFBZ0IsYUFBYSxTQUFVO0FBQ3BGLFFBQU0sNkJBQTZCLFdBQVcsa0JBQWtCO0FBQ2hFLFFBQU0sNEJBQTRCLE1BQU0scUJBQXFCO0FBQzdELFFBQU0seUJBQXlCO0FBQy9CLFFBQU0sZ0NBQWdDLE1BQU0seUJBQXlCO0FBQ3JFLFFBQU0sYUFBYSxTQUFVLE1BQU0sUUFBUSxPQUFPO0FBRzlDLFFBQUksS0FBSyxXQUFXO0FBQ2hCO0FBQUEsSUFDSjtBQUNBLFVBQU0sV0FBVyxLQUFLO0FBQ3RCLFFBQUksT0FBTyxhQUFhLFlBQVksU0FBUyxhQUFhO0FBRXRELFdBQUssV0FBVyxDQUFDQyxXQUFVLFNBQVMsWUFBWUEsTUFBSztBQUNyRCxXQUFLLG1CQUFtQjtBQUFBLElBQzVCO0FBS0EsUUFBSTtBQUNKLFFBQUk7QUFDQSxXQUFLLE9BQU8sTUFBTSxRQUFRLENBQUMsS0FBSyxDQUFDO0FBQUEsSUFDckMsU0FDTyxLQUFLO0FBQ1IsY0FBUTtBQUFBLElBQ1o7QUFDQSxVQUFNLFVBQVUsS0FBSztBQUNyQixRQUFJLFdBQVcsT0FBTyxZQUFZLFlBQVksUUFBUSxNQUFNO0FBSXhELFlBQU1ILFlBQVcsS0FBSyxtQkFBbUIsS0FBSyxtQkFBbUIsS0FBSztBQUN0RSxhQUFPLHFCQUFxQixFQUFFLEtBQUssUUFBUSxNQUFNLE1BQU1BLFdBQVUsT0FBTztBQUFBLElBQzVFO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFDQSxXQUFTLGVBQWUsU0FBUyxPQUFPLFdBQVc7QUFHL0MsWUFBUSxTQUFTRSxTQUFRO0FBQ3pCLFFBQUksQ0FBQyxPQUFPO0FBQ1I7QUFBQSxJQUNKO0FBR0EsVUFBTSxTQUFTLFdBQVcsTUFBTSxVQUFVQTtBQUMxQyxVQUFNLFFBQVEsT0FBTyxxQkFBcUIsTUFBTSxJQUFJLEVBQUUsWUFBWSxXQUFXLFNBQVMsQ0FBQztBQUN2RixRQUFJLE9BQU87QUFDUCxZQUFNLFNBQVMsQ0FBQztBQUdoQixVQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3BCLGNBQU0sTUFBTSxXQUFXLE1BQU0sQ0FBQyxHQUFHLFFBQVEsS0FBSztBQUM5QyxlQUFPLE9BQU8sS0FBSyxHQUFHO0FBQUEsTUFDMUIsT0FDSztBQUlELGNBQU0sWUFBWSxNQUFNLE1BQU07QUFDOUIsaUJBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDdkMsY0FBSSxTQUFTLE1BQU0sNEJBQTRCLE1BQU0sTUFBTTtBQUN2RDtBQUFBLFVBQ0o7QUFDQSxnQkFBTSxNQUFNLFdBQVcsVUFBVSxDQUFDLEdBQUcsUUFBUSxLQUFLO0FBQ2xELGlCQUFPLE9BQU8sS0FBSyxHQUFHO0FBQUEsUUFDMUI7QUFBQSxNQUNKO0FBR0EsVUFBSSxPQUFPLFdBQVcsR0FBRztBQUNyQixjQUFNLE9BQU8sQ0FBQztBQUFBLE1BQ2xCLE9BQ0s7QUFDRCxpQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUNwQyxnQkFBTSxNQUFNLE9BQU8sQ0FBQztBQUNwQixjQUFJLHdCQUF3QixNQUFNO0FBQzlCLGtCQUFNO0FBQUEsVUFDVixDQUFDO0FBQUEsUUFDTDtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUVBLFFBQU0sMEJBQTBCLFNBQVUsT0FBTztBQUM3QyxXQUFPLGVBQWUsTUFBTSxPQUFPLEtBQUs7QUFBQSxFQUM1QztBQUVBLFFBQU0saUNBQWlDLFNBQVUsT0FBTztBQUNwRCxXQUFPLGVBQWUsTUFBTSxPQUFPLElBQUk7QUFBQSxFQUMzQztBQUNBLFdBQVMsd0JBQXdCLEtBQUtFLGVBQWM7QUFDaEQsUUFBSSxDQUFDLEtBQUs7QUFDTixhQUFPO0FBQUEsSUFDWDtBQUNBLFFBQUksb0JBQW9CO0FBQ3hCLFFBQUlBLGlCQUFnQkEsY0FBYSxTQUFTLFFBQVc7QUFDakQsMEJBQW9CQSxjQUFhO0FBQUEsSUFDckM7QUFDQSxVQUFNLGtCQUFrQkEsaUJBQWdCQSxjQUFhO0FBQ3JELFFBQUksaUJBQWlCO0FBQ3JCLFFBQUlBLGlCQUFnQkEsY0FBYSxXQUFXLFFBQVc7QUFDbkQsdUJBQWlCQSxjQUFhO0FBQUEsSUFDbEM7QUFDQSxRQUFJLGVBQWU7QUFDbkIsUUFBSUEsaUJBQWdCQSxjQUFhLE9BQU8sUUFBVztBQUMvQyxxQkFBZUEsY0FBYTtBQUFBLElBQ2hDO0FBQ0EsUUFBSSxRQUFRO0FBQ1osV0FBTyxTQUFTLENBQUMsTUFBTSxlQUFlLGtCQUFrQixHQUFHO0FBQ3ZELGNBQVEscUJBQXFCLEtBQUs7QUFBQSxJQUN0QztBQUNBLFFBQUksQ0FBQyxTQUFTLElBQUksa0JBQWtCLEdBQUc7QUFFbkMsY0FBUTtBQUFBLElBQ1o7QUFDQSxRQUFJLENBQUMsT0FBTztBQUNSLGFBQU87QUFBQSxJQUNYO0FBQ0EsUUFBSSxNQUFNLDBCQUEwQixHQUFHO0FBQ25DLGFBQU87QUFBQSxJQUNYO0FBQ0EsVUFBTSxvQkFBb0JBLGlCQUFnQkEsY0FBYTtBQVN2RCxVQUFNLFdBQVcsQ0FBQztBQUNsQixVQUFNLHlCQUEwQixNQUFNLDBCQUEwQixJQUFJLE1BQU0sa0JBQWtCO0FBQzVGLFVBQU0sNEJBQTZCLE1BQU0sV0FBVyxxQkFBcUIsQ0FBQyxJQUN0RSxNQUFNLHFCQUFxQjtBQUMvQixVQUFNLGtCQUFtQixNQUFNLFdBQVcsd0JBQXdCLENBQUMsSUFDL0QsTUFBTSx3QkFBd0I7QUFDbEMsVUFBTSwyQkFBNEIsTUFBTSxXQUFXLG1DQUFtQyxDQUFDLElBQ25GLE1BQU0sbUNBQW1DO0FBQzdDLFFBQUk7QUFDSixRQUFJQSxpQkFBZ0JBLGNBQWEsU0FBUztBQUN0QyxtQ0FBNkIsTUFBTSxXQUFXQSxjQUFhLE9BQU8sQ0FBQyxJQUMvRCxNQUFNQSxjQUFhLE9BQU87QUFBQSxJQUNsQztBQUtBLGFBQVMsMEJBQTBCLFNBQVMsU0FBUztBQUNqRCxVQUFJLENBQUMsU0FBUztBQUNWLGVBQU87QUFBQSxNQUNYO0FBQ0EsVUFBSSxPQUFPLFlBQVksV0FBVztBQUM5QixlQUFPLEVBQUUsU0FBUyxTQUFTLFNBQVMsS0FBSztBQUFBLE1BQzdDO0FBQ0EsVUFBSSxDQUFDLFNBQVM7QUFDVixlQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsTUFDM0I7QUFDQSxVQUFJLE9BQU8sWUFBWSxZQUFZLFFBQVEsWUFBWSxPQUFPO0FBQzFELGVBQU8sRUFBRSxHQUFHLFNBQVMsU0FBUyxLQUFLO0FBQUEsTUFDdkM7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUNBLFVBQU0sdUJBQXVCLFNBQVUsTUFBTTtBQUd6QyxVQUFJLFNBQVMsWUFBWTtBQUNyQjtBQUFBLE1BQ0o7QUFDQSxhQUFPLHVCQUF1QixLQUFLLFNBQVMsUUFBUSxTQUFTLFdBQVcsU0FBUyxVQUFVLGlDQUFpQyx5QkFBeUIsU0FBUyxPQUFPO0FBQUEsSUFDeks7QUFPQSxVQUFNLHFCQUFxQixTQUFVLE1BQU07QUFJdkMsVUFBSSxDQUFDLEtBQUssV0FBVztBQUNqQixjQUFNLG1CQUFtQixxQkFBcUIsS0FBSyxTQUFTO0FBQzVELFlBQUk7QUFDSixZQUFJLGtCQUFrQjtBQUNsQiw0QkFBa0IsaUJBQWlCLEtBQUssVUFBVSxXQUFXLFNBQVM7QUFBQSxRQUMxRTtBQUNBLGNBQU0sZ0JBQWdCLG1CQUFtQixLQUFLLE9BQU8sZUFBZTtBQUNwRSxZQUFJLGVBQWU7QUFDZixtQkFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUMzQyxrQkFBTSxlQUFlLGNBQWMsQ0FBQztBQUNwQyxnQkFBSSxpQkFBaUIsTUFBTTtBQUN2Qiw0QkFBYyxPQUFPLEdBQUcsQ0FBQztBQUV6QixtQkFBSyxZQUFZO0FBQ2pCLGtCQUFJLEtBQUsscUJBQXFCO0FBQzFCLHFCQUFLLG9CQUFvQjtBQUN6QixxQkFBSyxzQkFBc0I7QUFBQSxjQUMvQjtBQUNBLGtCQUFJLGNBQWMsV0FBVyxHQUFHO0FBRzVCLHFCQUFLLGFBQWE7QUFDbEIscUJBQUssT0FBTyxlQUFlLElBQUk7QUFBQSxjQUNuQztBQUNBO0FBQUEsWUFDSjtBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUlBLFVBQUksQ0FBQyxLQUFLLFlBQVk7QUFDbEI7QUFBQSxNQUNKO0FBQ0EsYUFBTywwQkFBMEIsS0FBSyxLQUFLLFFBQVEsS0FBSyxXQUFXLEtBQUssVUFBVSxpQ0FBaUMseUJBQXlCLEtBQUssT0FBTztBQUFBLElBQzVKO0FBQ0EsVUFBTSwwQkFBMEIsU0FBVSxNQUFNO0FBQzVDLGFBQU8sdUJBQXVCLEtBQUssU0FBUyxRQUFRLFNBQVMsV0FBVyxLQUFLLFFBQVEsU0FBUyxPQUFPO0FBQUEsSUFDekc7QUFDQSxVQUFNLHdCQUF3QixTQUFVLE1BQU07QUFDMUMsYUFBTywyQkFBMkIsS0FBSyxTQUFTLFFBQVEsU0FBUyxXQUFXLEtBQUssUUFBUSxTQUFTLE9BQU87QUFBQSxJQUM3RztBQUNBLFVBQU0sd0JBQXdCLFNBQVUsTUFBTTtBQUMxQyxhQUFPLDBCQUEwQixLQUFLLEtBQUssUUFBUSxLQUFLLFdBQVcsS0FBSyxRQUFRLEtBQUssT0FBTztBQUFBLElBQ2hHO0FBQ0EsVUFBTSxpQkFBaUIsb0JBQW9CLHVCQUF1QjtBQUNsRSxVQUFNLGVBQWUsb0JBQW9CLHFCQUFxQjtBQUM5RCxVQUFNLGdDQUFnQyxTQUFVLE1BQU0sVUFBVTtBQUM1RCxZQUFNLGlCQUFpQixPQUFPO0FBQzlCLGFBQVMsbUJBQW1CLGNBQWMsS0FBSyxhQUFhLFlBQ3ZELG1CQUFtQixZQUFZLEtBQUsscUJBQXFCO0FBQUEsSUFDbEU7QUFDQSxVQUFNLFVBQVVBLGVBQWMsUUFBUTtBQUN0QyxVQUFNLGtCQUFrQixLQUFLLFdBQVcsa0JBQWtCLENBQUM7QUFDM0QsVUFBTSxnQkFBZ0JGLFNBQVEsV0FBVyxnQkFBZ0IsQ0FBQztBQUMxRCxhQUFTLHlCQUF5QixTQUFTO0FBQ3ZDLFVBQUksT0FBTyxZQUFZLFlBQVksWUFBWSxNQUFNO0FBSWpELGNBQU0sYUFBYSxFQUFFLEdBQUcsUUFBUTtBQVVoQyxZQUFJLFFBQVEsUUFBUTtBQUNoQixxQkFBVyxTQUFTLFFBQVE7QUFBQSxRQUNoQztBQUNBLGVBQU87QUFBQSxNQUNYO0FBQ0EsYUFBTztBQUFBLElBQ1g7QUFDQSxVQUFNLGtCQUFrQixTQUFVLGdCQUFnQixXQUFXLGtCQUFrQixnQkFBZ0JHLGdCQUFlLE9BQU8sVUFBVSxPQUFPO0FBQ2xJLGFBQU8sV0FBWTtBQUNmLGNBQU0sU0FBUyxRQUFRSDtBQUN2QixZQUFJLFlBQVksVUFBVSxDQUFDO0FBQzNCLFlBQUlFLGlCQUFnQkEsY0FBYSxtQkFBbUI7QUFDaEQsc0JBQVlBLGNBQWEsa0JBQWtCLFNBQVM7QUFBQSxRQUN4RDtBQUNBLFlBQUksV0FBVyxVQUFVLENBQUM7QUFDMUIsWUFBSSxDQUFDLFVBQVU7QUFDWCxpQkFBTyxlQUFlLE1BQU0sTUFBTSxTQUFTO0FBQUEsUUFDL0M7QUFDQSxZQUFJLFVBQVUsY0FBYyxxQkFBcUI7QUFFN0MsaUJBQU8sZUFBZSxNQUFNLE1BQU0sU0FBUztBQUFBLFFBQy9DO0FBR0EsWUFBSSx3QkFBd0I7QUFDNUIsWUFBSSxPQUFPLGFBQWEsWUFBWTtBQUloQyxjQUFJLENBQUMsU0FBUyxhQUFhO0FBQ3ZCLG1CQUFPLGVBQWUsTUFBTSxNQUFNLFNBQVM7QUFBQSxVQUMvQztBQUNBLGtDQUF3QjtBQUFBLFFBQzVCO0FBQ0EsWUFBSSxtQkFBbUIsQ0FBQyxnQkFBZ0IsZ0JBQWdCLFVBQVUsUUFBUSxTQUFTLEdBQUc7QUFDbEY7QUFBQSxRQUNKO0FBQ0EsY0FBTSxVQUFVLENBQUMsQ0FBQyxpQkFBaUIsY0FBYyxRQUFRLFNBQVMsTUFBTTtBQUN4RSxjQUFNLFVBQVUseUJBQXlCLDBCQUEwQixVQUFVLENBQUMsR0FBRyxPQUFPLENBQUM7QUFDekYsY0FBTSxTQUFTLFNBQVM7QUFDeEIsWUFBSSxRQUFRLFNBQVM7QUFFakI7QUFBQSxRQUNKO0FBQ0EsWUFBSSxpQkFBaUI7QUFFakIsbUJBQVMsSUFBSSxHQUFHLElBQUksZ0JBQWdCLFFBQVEsS0FBSztBQUM3QyxnQkFBSSxjQUFjLGdCQUFnQixDQUFDLEdBQUc7QUFDbEMsa0JBQUksU0FBUztBQUNULHVCQUFPLGVBQWUsS0FBSyxRQUFRLFdBQVcsVUFBVSxPQUFPO0FBQUEsY0FDbkUsT0FDSztBQUNELHVCQUFPLGVBQWUsTUFBTSxNQUFNLFNBQVM7QUFBQSxjQUMvQztBQUFBLFlBQ0o7QUFBQSxVQUNKO0FBQUEsUUFDSjtBQUNBLGNBQU0sVUFBVSxDQUFDLFVBQVUsUUFBUSxPQUFPLFlBQVksWUFBWSxPQUFPLFFBQVE7QUFDakYsY0FBTSxPQUFPLFdBQVcsT0FBTyxZQUFZLFdBQVcsUUFBUSxPQUFPO0FBQ3JFLGNBQU0sT0FBTyxLQUFLO0FBQ2xCLFlBQUksbUJBQW1CLHFCQUFxQixTQUFTO0FBQ3JELFlBQUksQ0FBQyxrQkFBa0I7QUFDbkIsNEJBQWtCLFdBQVcsaUJBQWlCO0FBQzlDLDZCQUFtQixxQkFBcUIsU0FBUztBQUFBLFFBQ3JEO0FBQ0EsY0FBTSxrQkFBa0IsaUJBQWlCLFVBQVUsV0FBVyxTQUFTO0FBQ3ZFLFlBQUksZ0JBQWdCLE9BQU8sZUFBZTtBQUMxQyxZQUFJLGFBQWE7QUFDakIsWUFBSSxlQUFlO0FBRWYsdUJBQWE7QUFDYixjQUFJLGdCQUFnQjtBQUNoQixxQkFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUMzQyxrQkFBSSxRQUFRLGNBQWMsQ0FBQyxHQUFHLFFBQVEsR0FBRztBQUVyQztBQUFBLGNBQ0o7QUFBQSxZQUNKO0FBQUEsVUFDSjtBQUFBLFFBQ0osT0FDSztBQUNELDBCQUFnQixPQUFPLGVBQWUsSUFBSSxDQUFDO0FBQUEsUUFDL0M7QUFDQSxZQUFJO0FBQ0osY0FBTSxrQkFBa0IsT0FBTyxZQUFZLE1BQU07QUFDakQsY0FBTSxlQUFlLGNBQWMsZUFBZTtBQUNsRCxZQUFJLGNBQWM7QUFDZCxtQkFBUyxhQUFhLFNBQVM7QUFBQSxRQUNuQztBQUNBLFlBQUksQ0FBQyxRQUFRO0FBQ1QsbUJBQ0ksa0JBQ0ksYUFDQyxvQkFBb0Isa0JBQWtCLFNBQVMsSUFBSTtBQUFBLFFBQ2hFO0FBTUEsaUJBQVMsVUFBVTtBQUNuQixZQUFJLE1BQU07QUFJTixtQkFBUyxRQUFRLE9BQU87QUFBQSxRQUM1QjtBQUNBLGlCQUFTLFNBQVM7QUFDbEIsaUJBQVMsVUFBVTtBQUNuQixpQkFBUyxZQUFZO0FBQ3JCLGlCQUFTLGFBQWE7QUFDdEIsY0FBTSxPQUFPLG9CQUFvQixpQ0FBaUM7QUFFbEUsWUFBSSxNQUFNO0FBQ04sZUFBSyxXQUFXO0FBQUEsUUFDcEI7QUFDQSxZQUFJLFFBQVE7QUFJUixtQkFBUyxRQUFRLFNBQVM7QUFBQSxRQUM5QjtBQUtBLGNBQU0sT0FBTyxLQUFLLGtCQUFrQixRQUFRLFVBQVUsTUFBTSxrQkFBa0IsY0FBYztBQUM1RixZQUFJLFFBQVE7QUFFUixtQkFBUyxRQUFRLFNBQVM7QUFJMUIsZ0JBQU0sVUFBVSxNQUFNLEtBQUssS0FBSyxXQUFXLElBQUk7QUFDL0MseUJBQWUsS0FBSyxRQUFRLFNBQVMsU0FBUyxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBSzVELGVBQUssc0JBQXNCLE1BQU0sT0FBTyxvQkFBb0IsU0FBUyxPQUFPO0FBQUEsUUFDaEY7QUFHQSxpQkFBUyxTQUFTO0FBRWxCLFlBQUksTUFBTTtBQUNOLGVBQUssV0FBVztBQUFBLFFBQ3BCO0FBR0EsWUFBSSxNQUFNO0FBQ04sbUJBQVMsUUFBUSxPQUFPO0FBQUEsUUFDNUI7QUFDQSxZQUFJLE9BQU8sS0FBSyxZQUFZLFdBQVc7QUFJbkMsZUFBSyxVQUFVO0FBQUEsUUFDbkI7QUFDQSxhQUFLLFNBQVM7QUFDZCxhQUFLLFVBQVU7QUFDZixhQUFLLFlBQVk7QUFDakIsWUFBSSx1QkFBdUI7QUFFdkIsZUFBSyxtQkFBbUI7QUFBQSxRQUM1QjtBQUNBLFlBQUksQ0FBQyxTQUFTO0FBQ1Ysd0JBQWMsS0FBSyxJQUFJO0FBQUEsUUFDM0IsT0FDSztBQUNELHdCQUFjLFFBQVEsSUFBSTtBQUFBLFFBQzlCO0FBQ0EsWUFBSUMsZUFBYztBQUNkLGlCQUFPO0FBQUEsUUFDWDtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQ0EsVUFBTSxrQkFBa0IsSUFBSSxnQkFBZ0Isd0JBQXdCLDJCQUEyQixnQkFBZ0IsY0FBYyxZQUFZO0FBQ3pJLFFBQUksNEJBQTRCO0FBQzVCLFlBQU0sc0JBQXNCLElBQUksZ0JBQWdCLDRCQUE0QiwrQkFBK0IsdUJBQXVCLGNBQWMsY0FBYyxJQUFJO0FBQUEsSUFDdEs7QUFDQSxVQUFNLHFCQUFxQixJQUFJLFdBQVk7QUFDdkMsWUFBTSxTQUFTLFFBQVFIO0FBQ3ZCLFVBQUksWUFBWSxVQUFVLENBQUM7QUFDM0IsVUFBSUUsaUJBQWdCQSxjQUFhLG1CQUFtQjtBQUNoRCxvQkFBWUEsY0FBYSxrQkFBa0IsU0FBUztBQUFBLE1BQ3hEO0FBQ0EsWUFBTSxVQUFVLFVBQVUsQ0FBQztBQUMzQixZQUFNLFVBQVUsQ0FBQyxVQUFVLFFBQVEsT0FBTyxZQUFZLFlBQVksT0FBTyxRQUFRO0FBQ2pGLFlBQU0sV0FBVyxVQUFVLENBQUM7QUFDNUIsVUFBSSxDQUFDLFVBQVU7QUFDWCxlQUFPLDBCQUEwQixNQUFNLE1BQU0sU0FBUztBQUFBLE1BQzFEO0FBQ0EsVUFBSSxtQkFDQSxDQUFDLGdCQUFnQiwyQkFBMkIsVUFBVSxRQUFRLFNBQVMsR0FBRztBQUMxRTtBQUFBLE1BQ0o7QUFDQSxZQUFNLG1CQUFtQixxQkFBcUIsU0FBUztBQUN2RCxVQUFJO0FBQ0osVUFBSSxrQkFBa0I7QUFDbEIsMEJBQWtCLGlCQUFpQixVQUFVLFdBQVcsU0FBUztBQUFBLE1BQ3JFO0FBQ0EsWUFBTSxnQkFBZ0IsbUJBQW1CLE9BQU8sZUFBZTtBQUsvRCxVQUFJLGVBQWU7QUFDZixpQkFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUMzQyxnQkFBTSxlQUFlLGNBQWMsQ0FBQztBQUNwQyxjQUFJLFFBQVEsY0FBYyxRQUFRLEdBQUc7QUFDakMsMEJBQWMsT0FBTyxHQUFHLENBQUM7QUFFekIseUJBQWEsWUFBWTtBQUN6QixnQkFBSSxjQUFjLFdBQVcsR0FBRztBQUc1QiwyQkFBYSxhQUFhO0FBQzFCLHFCQUFPLGVBQWUsSUFBSTtBQU0xQixrQkFBSSxDQUFDLFdBQVcsT0FBTyxjQUFjLFVBQVU7QUFDM0Msc0JBQU0sbUJBQW1CLHFCQUFxQixnQkFBZ0I7QUFDOUQsdUJBQU8sZ0JBQWdCLElBQUk7QUFBQSxjQUMvQjtBQUFBLFlBQ0o7QUFNQSx5QkFBYSxLQUFLLFdBQVcsWUFBWTtBQUN6QyxnQkFBSSxjQUFjO0FBQ2QscUJBQU87QUFBQSxZQUNYO0FBQ0E7QUFBQSxVQUNKO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFPQSxhQUFPLDBCQUEwQixNQUFNLE1BQU0sU0FBUztBQUFBLElBQzFEO0FBQ0EsVUFBTSx3QkFBd0IsSUFBSSxXQUFZO0FBQzFDLFlBQU0sU0FBUyxRQUFRRjtBQUN2QixVQUFJLFlBQVksVUFBVSxDQUFDO0FBQzNCLFVBQUlFLGlCQUFnQkEsY0FBYSxtQkFBbUI7QUFDaEQsb0JBQVlBLGNBQWEsa0JBQWtCLFNBQVM7QUFBQSxNQUN4RDtBQUNBLFlBQU0sWUFBWSxDQUFDO0FBQ25CLFlBQU0sUUFBUSxlQUFlLFFBQVEsb0JBQW9CLGtCQUFrQixTQUFTLElBQUksU0FBUztBQUNqRyxlQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ25DLGNBQU0sT0FBTyxNQUFNLENBQUM7QUFDcEIsWUFBSSxXQUFXLEtBQUssbUJBQW1CLEtBQUssbUJBQW1CLEtBQUs7QUFDcEUsa0JBQVUsS0FBSyxRQUFRO0FBQUEsTUFDM0I7QUFDQSxhQUFPO0FBQUEsSUFDWDtBQUNBLFVBQU0sbUNBQW1DLElBQUksV0FBWTtBQUNyRCxZQUFNLFNBQVMsUUFBUUY7QUFDdkIsVUFBSSxZQUFZLFVBQVUsQ0FBQztBQUMzQixVQUFJLENBQUMsV0FBVztBQUNaLGNBQU0sT0FBTyxPQUFPLEtBQUssTUFBTTtBQUMvQixpQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNsQyxnQkFBTSxPQUFPLEtBQUssQ0FBQztBQUNuQixnQkFBTSxRQUFRLHVCQUF1QixLQUFLLElBQUk7QUFDOUMsY0FBSSxVQUFVLFNBQVMsTUFBTSxDQUFDO0FBSzlCLGNBQUksV0FBVyxZQUFZLGtCQUFrQjtBQUN6QyxpQkFBSyxtQ0FBbUMsRUFBRSxLQUFLLE1BQU0sT0FBTztBQUFBLFVBQ2hFO0FBQUEsUUFDSjtBQUVBLGFBQUssbUNBQW1DLEVBQUUsS0FBSyxNQUFNLGdCQUFnQjtBQUFBLE1BQ3pFLE9BQ0s7QUFDRCxZQUFJRSxpQkFBZ0JBLGNBQWEsbUJBQW1CO0FBQ2hELHNCQUFZQSxjQUFhLGtCQUFrQixTQUFTO0FBQUEsUUFDeEQ7QUFDQSxjQUFNLG1CQUFtQixxQkFBcUIsU0FBUztBQUN2RCxZQUFJLGtCQUFrQjtBQUNsQixnQkFBTSxrQkFBa0IsaUJBQWlCLFNBQVM7QUFDbEQsZ0JBQU0seUJBQXlCLGlCQUFpQixRQUFRO0FBQ3hELGdCQUFNLFFBQVEsT0FBTyxlQUFlO0FBQ3BDLGdCQUFNLGVBQWUsT0FBTyxzQkFBc0I7QUFDbEQsY0FBSSxPQUFPO0FBQ1Asa0JBQU0sY0FBYyxNQUFNLE1BQU07QUFDaEMscUJBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxRQUFRLEtBQUs7QUFDekMsb0JBQU0sT0FBTyxZQUFZLENBQUM7QUFDMUIsa0JBQUksV0FBVyxLQUFLLG1CQUFtQixLQUFLLG1CQUFtQixLQUFLO0FBQ3BFLG1CQUFLLHFCQUFxQixFQUFFLEtBQUssTUFBTSxXQUFXLFVBQVUsS0FBSyxPQUFPO0FBQUEsWUFDNUU7QUFBQSxVQUNKO0FBQ0EsY0FBSSxjQUFjO0FBQ2Qsa0JBQU0sY0FBYyxhQUFhLE1BQU07QUFDdkMscUJBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxRQUFRLEtBQUs7QUFDekMsb0JBQU0sT0FBTyxZQUFZLENBQUM7QUFDMUIsa0JBQUksV0FBVyxLQUFLLG1CQUFtQixLQUFLLG1CQUFtQixLQUFLO0FBQ3BFLG1CQUFLLHFCQUFxQixFQUFFLEtBQUssTUFBTSxXQUFXLFVBQVUsS0FBSyxPQUFPO0FBQUEsWUFDNUU7QUFBQSxVQUNKO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFDQSxVQUFJLGNBQWM7QUFDZCxlQUFPO0FBQUEsTUFDWDtBQUFBLElBQ0o7QUFFQSwwQkFBc0IsTUFBTSxrQkFBa0IsR0FBRyxzQkFBc0I7QUFDdkUsMEJBQXNCLE1BQU0scUJBQXFCLEdBQUcseUJBQXlCO0FBQzdFLFFBQUksMEJBQTBCO0FBQzFCLDRCQUFzQixNQUFNLG1DQUFtQyxHQUFHLHdCQUF3QjtBQUFBLElBQzlGO0FBQ0EsUUFBSSxpQkFBaUI7QUFDakIsNEJBQXNCLE1BQU0sd0JBQXdCLEdBQUcsZUFBZTtBQUFBLElBQzFFO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFDQSxNQUFJLFVBQVUsQ0FBQztBQUNmLFdBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLEtBQUs7QUFDbEMsWUFBUSxDQUFDLElBQUksd0JBQXdCLEtBQUssQ0FBQyxHQUFHLFlBQVk7QUFBQSxFQUM5RDtBQUNBLFNBQU87QUFDWDtBQUNBLFNBQVMsZUFBZSxRQUFRLFdBQVc7QUFDdkMsTUFBSSxDQUFDLFdBQVc7QUFDWixVQUFNLGFBQWEsQ0FBQztBQUNwQixhQUFTLFFBQVEsUUFBUTtBQUNyQixZQUFNLFFBQVEsdUJBQXVCLEtBQUssSUFBSTtBQUM5QyxVQUFJLFVBQVUsU0FBUyxNQUFNLENBQUM7QUFDOUIsVUFBSSxZQUFZLENBQUMsYUFBYSxZQUFZLFlBQVk7QUFDbEQsY0FBTSxRQUFRLE9BQU8sSUFBSTtBQUN6QixZQUFJLE9BQU87QUFDUCxtQkFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUNuQyx1QkFBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUEsVUFDNUI7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUNBLE1BQUksa0JBQWtCLHFCQUFxQixTQUFTO0FBQ3BELE1BQUksQ0FBQyxpQkFBaUI7QUFDbEIsc0JBQWtCLFNBQVM7QUFDM0Isc0JBQWtCLHFCQUFxQixTQUFTO0FBQUEsRUFDcEQ7QUFDQSxRQUFNLG9CQUFvQixPQUFPLGdCQUFnQixTQUFTLENBQUM7QUFDM0QsUUFBTSxtQkFBbUIsT0FBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQ3pELE1BQUksQ0FBQyxtQkFBbUI7QUFDcEIsV0FBTyxtQkFBbUIsaUJBQWlCLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDMUQsT0FDSztBQUNELFdBQU8sbUJBQ0Qsa0JBQWtCLE9BQU8sZ0JBQWdCLElBQ3pDLGtCQUFrQixNQUFNO0FBQUEsRUFDbEM7QUFDSjtBQUNBLFNBQVMsb0JBQW9CTCxTQUFRLEtBQUs7QUFDdEMsUUFBTSxRQUFRQSxRQUFPLE9BQU87QUFDNUIsTUFBSSxTQUFTLE1BQU0sV0FBVztBQUMxQixRQUFJLFlBQVksTUFBTSxXQUFXLDRCQUE0QixDQUFDLGFBQWEsU0FBVUQsT0FBTSxNQUFNO0FBQzdGLE1BQUFBLE1BQUssNEJBQTRCLElBQUk7QUFJckMsa0JBQVksU0FBUyxNQUFNQSxPQUFNLElBQUk7QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDTDtBQUNKO0FBTUEsU0FBUyxvQkFBb0JDLFNBQVEsS0FBSztBQUN0QyxNQUFJLFlBQVlBLFNBQVEsa0JBQWtCLENBQUMsYUFBYTtBQUNwRCxXQUFPLFNBQVVELE9BQU0sTUFBTTtBQUN6QixXQUFLLFFBQVEsa0JBQWtCLGtCQUFrQixLQUFLLENBQUMsQ0FBQztBQUFBLElBQzVEO0FBQUEsRUFDSixDQUFDO0FBQ0w7QUFNQSxJQUFNLGFBQWEsV0FBVyxVQUFVO0FBQ3hDLFNBQVMsV0FBV1EsU0FBUSxTQUFTLFlBQVksWUFBWTtBQUN6RCxNQUFJLFlBQVk7QUFDaEIsTUFBSSxjQUFjO0FBQ2xCLGFBQVc7QUFDWCxnQkFBYztBQUNkLFFBQU0sa0JBQWtCLENBQUM7QUFDekIsV0FBUyxhQUFhLE1BQU07QUFDeEIsVUFBTSxPQUFPLEtBQUs7QUFDbEIsU0FBSyxLQUFLLENBQUMsSUFBSSxXQUFZO0FBQ3ZCLGFBQU8sS0FBSyxPQUFPLE1BQU0sTUFBTSxTQUFTO0FBQUEsSUFDNUM7QUFDQSxVQUFNLGFBQWEsVUFBVSxNQUFNQSxTQUFRLEtBQUssSUFBSTtBQUlwRCxRQUFJLFNBQVMsVUFBVSxHQUFHO0FBQ3RCLFdBQUssV0FBVztBQUFBLElBQ3BCLE9BQ0s7QUFDRCxXQUFLLFNBQVM7QUFFZCxXQUFLLGdCQUFnQixXQUFXLFdBQVcsT0FBTztBQUFBLElBQ3REO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFDQSxXQUFTLFVBQVUsTUFBTTtBQUNyQixVQUFNLEVBQUUsUUFBUSxTQUFTLElBQUksS0FBSztBQUNsQyxXQUFPLFlBQVksS0FBS0EsU0FBUSxVQUFVLFFBQVE7QUFBQSxFQUN0RDtBQUNBLGNBQVksWUFBWUEsU0FBUSxTQUFTLENBQUMsYUFBYSxTQUFVUixPQUFNLE1BQU07QUFDekUsUUFBSSxXQUFXLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFDckIsWUFBTSxVQUFVO0FBQUEsUUFDWixlQUFlO0FBQUEsUUFDZixZQUFZLGVBQWU7QUFBQSxRQUMzQixPQUFPLGVBQWUsYUFBYSxlQUFlLGFBQWEsS0FBSyxDQUFDLEtBQUssSUFBSTtBQUFBLFFBQzlFO0FBQUEsTUFDSjtBQUNBLFlBQU0sV0FBVyxLQUFLLENBQUM7QUFDdkIsV0FBSyxDQUFDLElBQUksU0FBUyxRQUFRO0FBQ3ZCLFlBQUk7QUFDQSxpQkFBTyxTQUFTLE1BQU0sTUFBTSxTQUFTO0FBQUEsUUFDekMsVUFDQTtBQVFJLGdCQUFNLEVBQUUsUUFBQVMsU0FBUSxVQUFBQyxXQUFVLFlBQUFDLGFBQVksZUFBQUMsZUFBYyxJQUFJO0FBQ3hELGNBQUksQ0FBQ0QsZUFBYyxDQUFDQyxnQkFBZTtBQUMvQixnQkFBSUYsV0FBVTtBQUdWLHFCQUFPLGdCQUFnQkEsU0FBUTtBQUFBLFlBQ25DLFdBQ1NELFNBQVE7QUFHYixjQUFBQSxRQUFPLFVBQVUsSUFBSTtBQUFBLFlBQ3pCO0FBQUEsVUFDSjtBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQ0EsWUFBTSxPQUFPLGlDQUFpQyxTQUFTLEtBQUssQ0FBQyxHQUFHLFNBQVMsY0FBYyxTQUFTO0FBQ2hHLFVBQUksQ0FBQyxNQUFNO0FBQ1AsZUFBTztBQUFBLE1BQ1g7QUFFQSxZQUFNLEVBQUUsVUFBVSxRQUFRLGVBQWUsV0FBVyxJQUFJLEtBQUs7QUFDN0QsVUFBSSxVQUFVO0FBR1Ysd0JBQWdCLFFBQVEsSUFBSTtBQUFBLE1BQ2hDLFdBQ1MsUUFBUTtBQUdiLGVBQU8sVUFBVSxJQUFJO0FBQ3JCLFlBQUksaUJBQWlCLENBQUMsWUFBWTtBQUM5QixnQkFBTSxrQkFBa0IsT0FBTztBQUMvQixpQkFBTyxVQUFVLFdBQVk7QUFDekIsa0JBQU0sRUFBRSxNQUFNLE1BQU0sSUFBSTtBQUN4QixnQkFBSSxVQUFVLGdCQUFnQjtBQUMxQixtQkFBSyxTQUFTO0FBQ2QsbUJBQUssaUJBQWlCLE1BQU0sQ0FBQztBQUFBLFlBQ2pDLFdBQ1MsVUFBVSxXQUFXO0FBQzFCLG1CQUFLLFNBQVM7QUFBQSxZQUNsQjtBQUNBLG1CQUFPLGdCQUFnQixLQUFLLElBQUk7QUFBQSxVQUNwQztBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQ0EsYUFBTyxVQUFVLFlBQVk7QUFBQSxJQUNqQyxPQUNLO0FBRUQsYUFBTyxTQUFTLE1BQU1ELFNBQVEsSUFBSTtBQUFBLElBQ3RDO0FBQUEsRUFDSixDQUFDO0FBQ0QsZ0JBQWMsWUFBWUEsU0FBUSxZQUFZLENBQUMsYUFBYSxTQUFVUixPQUFNLE1BQU07QUFDOUUsVUFBTSxLQUFLLEtBQUssQ0FBQztBQUNqQixRQUFJO0FBQ0osUUFBSSxTQUFTLEVBQUUsR0FBRztBQUVkLGFBQU8sZ0JBQWdCLEVBQUU7QUFDekIsYUFBTyxnQkFBZ0IsRUFBRTtBQUFBLElBQzdCLE9BQ0s7QUFFRCxhQUFPLEtBQUssVUFBVTtBQUN0QixVQUFJLE1BQU07QUFDTixXQUFHLFVBQVUsSUFBSTtBQUFBLE1BQ3JCLE9BQ0s7QUFDRCxlQUFPO0FBQUEsTUFDWDtBQUFBLElBQ0o7QUFDQSxRQUFJLE1BQU0sTUFBTTtBQUNaLFVBQUksS0FBSyxVQUFVO0FBRWYsYUFBSyxLQUFLLFdBQVcsSUFBSTtBQUFBLE1BQzdCO0FBQUEsSUFDSixPQUNLO0FBRUQsZUFBUyxNQUFNUSxTQUFRLElBQUk7QUFBQSxJQUMvQjtBQUFBLEVBQ0osQ0FBQztBQUNMO0FBRUEsU0FBUyxvQkFBb0JKLFVBQVMsS0FBSztBQUN2QyxRQUFNLEVBQUUsV0FBQVMsWUFBVyxPQUFBQyxPQUFNLElBQUksSUFBSSxpQkFBaUI7QUFDbEQsTUFBSyxDQUFDRCxjQUFhLENBQUNDLFVBQVUsQ0FBQ1YsU0FBUSxnQkFBZ0IsS0FBSyxFQUFFLG9CQUFvQkEsV0FBVTtBQUN4RjtBQUFBLEVBQ0o7QUFFQSxRQUFNLFlBQVk7QUFBQSxJQUNkO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0o7QUFDQSxNQUFJLGVBQWUsS0FBS0EsU0FBUSxnQkFBZ0Isa0JBQWtCLFVBQVUsU0FBUztBQUN6RjtBQUVBLFNBQVMsaUJBQWlCQSxVQUFTLEtBQUs7QUFDcEMsTUFBSSxLQUFLLElBQUksT0FBTyxrQkFBa0IsQ0FBQyxHQUFHO0FBRXRDO0FBQUEsRUFDSjtBQUNBLFFBQU0sRUFBRSxZQUFZLHNCQUFBVyx1QkFBc0IsVUFBQUMsV0FBVSxXQUFBQyxZQUFXLG9CQUFBQyxvQkFBbUIsSUFBSSxJQUFJLGlCQUFpQjtBQUUzRyxXQUFTLElBQUksR0FBRyxJQUFJLFdBQVcsUUFBUSxLQUFLO0FBQ3hDLFVBQU0sWUFBWSxXQUFXLENBQUM7QUFDOUIsVUFBTSxpQkFBaUIsWUFBWUQ7QUFDbkMsVUFBTSxnQkFBZ0IsWUFBWUQ7QUFDbEMsVUFBTSxTQUFTRSxzQkFBcUI7QUFDcEMsVUFBTSxnQkFBZ0JBLHNCQUFxQjtBQUMzQyxJQUFBSCxzQkFBcUIsU0FBUyxJQUFJLENBQUM7QUFDbkMsSUFBQUEsc0JBQXFCLFNBQVMsRUFBRUUsVUFBUyxJQUFJO0FBQzdDLElBQUFGLHNCQUFxQixTQUFTLEVBQUVDLFNBQVEsSUFBSTtBQUFBLEVBQ2hEO0FBQ0EsUUFBTSxlQUFlWixTQUFRLGFBQWE7QUFDMUMsTUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsV0FBVztBQUMxQztBQUFBLEVBQ0o7QUFDQSxNQUFJLGlCQUFpQkEsVUFBUyxLQUFLLENBQUMsZ0JBQWdCLGFBQWEsU0FBUyxDQUFDO0FBQzNFLFNBQU87QUFDWDtBQUNBLFNBQVMsV0FBV0gsU0FBUSxLQUFLO0FBQzdCLE1BQUksb0JBQW9CQSxTQUFRLEdBQUc7QUFDdkM7QUFNQSxTQUFTLGlCQUFpQixRQUFRLGNBQWMsa0JBQWtCO0FBQzlELE1BQUksQ0FBQyxvQkFBb0IsaUJBQWlCLFdBQVcsR0FBRztBQUNwRCxXQUFPO0FBQUEsRUFDWDtBQUNBLFFBQU0sTUFBTSxpQkFBaUIsT0FBTyxDQUFDLE9BQU8sR0FBRyxXQUFXLE1BQU07QUFDaEUsTUFBSSxJQUFJLFdBQVcsR0FBRztBQUNsQixXQUFPO0FBQUEsRUFDWDtBQUNBLFFBQU0seUJBQXlCLElBQUksQ0FBQyxFQUFFO0FBQ3RDLFNBQU8sYUFBYSxPQUFPLENBQUMsT0FBTyx1QkFBdUIsUUFBUSxFQUFFLE1BQU0sRUFBRTtBQUNoRjtBQUNBLFNBQVMsd0JBQXdCLFFBQVEsY0FBYyxrQkFBa0IsV0FBVztBQUdoRixNQUFJLENBQUMsUUFBUTtBQUNUO0FBQUEsRUFDSjtBQUNBLFFBQU0scUJBQXFCLGlCQUFpQixRQUFRLGNBQWMsZ0JBQWdCO0FBQ2xGLG9CQUFrQixRQUFRLG9CQUFvQixTQUFTO0FBQzNEO0FBS0EsU0FBUyxnQkFBZ0IsUUFBUTtBQUM3QixTQUFPLE9BQU8sb0JBQW9CLE1BQU0sRUFDbkMsT0FBTyxDQUFDLFNBQVMsS0FBSyxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsQ0FBQyxFQUN6RCxJQUFJLENBQUMsU0FBUyxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQ3hDO0FBQ0EsU0FBUyx3QkFBd0IsS0FBS0csVUFBUztBQUMzQyxNQUFJLFVBQVUsQ0FBQyxPQUFPO0FBQ2xCO0FBQUEsRUFDSjtBQUNBLE1BQUksS0FBSyxJQUFJLE9BQU8sYUFBYSxDQUFDLEdBQUc7QUFFakM7QUFBQSxFQUNKO0FBQ0EsUUFBTSxtQkFBbUJBLFNBQVEsNkJBQTZCO0FBRTlELE1BQUksZUFBZSxDQUFDO0FBQ3BCLE1BQUksV0FBVztBQUNYLFVBQU1lLGtCQUFpQjtBQUN2QixtQkFBZSxhQUFhLE9BQU87QUFBQSxNQUMvQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNKLENBQUM7QUFDRCxVQUFNLHdCQUF3QixDQUFDO0FBSy9CLDRCQUF3QkEsaUJBQWdCLGdCQUFnQkEsZUFBYyxHQUFHLG1CQUFtQixpQkFBaUIsT0FBTyxxQkFBcUIsSUFBSSxrQkFBa0IscUJBQXFCQSxlQUFjLENBQUM7QUFBQSxFQUN2TTtBQUNBLGlCQUFlLGFBQWEsT0FBTztBQUFBLElBQy9CO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNKLENBQUM7QUFDRCxXQUFTLElBQUksR0FBRyxJQUFJLGFBQWEsUUFBUSxLQUFLO0FBQzFDLFVBQU0sU0FBU2YsU0FBUSxhQUFhLENBQUMsQ0FBQztBQUN0QyxZQUFRLGFBQ0osd0JBQXdCLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTyxTQUFTLEdBQUcsZ0JBQWdCO0FBQUEsRUFDckc7QUFDSjtBQU1BLFNBQVMsYUFBYWdCLE9BQU07QUFDeEIsRUFBQUEsTUFBSyxhQUFhLFVBQVUsQ0FBQ25CLFlBQVc7QUFDcEMsVUFBTSxjQUFjQSxRQUFPbUIsTUFBSyxXQUFXLGFBQWEsQ0FBQztBQUN6RCxRQUFJLGFBQWE7QUFDYixrQkFBWTtBQUFBLElBQ2hCO0FBQUEsRUFDSixDQUFDO0FBQ0QsRUFBQUEsTUFBSyxhQUFhLFVBQVUsQ0FBQ25CLFlBQVc7QUFDcEMsVUFBTSxNQUFNO0FBQ1osVUFBTSxRQUFRO0FBQ2QsZUFBV0EsU0FBUSxLQUFLLE9BQU8sU0FBUztBQUN4QyxlQUFXQSxTQUFRLEtBQUssT0FBTyxVQUFVO0FBQ3pDLGVBQVdBLFNBQVEsS0FBSyxPQUFPLFdBQVc7QUFBQSxFQUM5QyxDQUFDO0FBQ0QsRUFBQW1CLE1BQUssYUFBYSx5QkFBeUIsQ0FBQ25CLFlBQVc7QUFDbkQsZUFBV0EsU0FBUSxXQUFXLFVBQVUsZ0JBQWdCO0FBQ3hELGVBQVdBLFNBQVEsY0FBYyxhQUFhLGdCQUFnQjtBQUM5RCxlQUFXQSxTQUFRLGlCQUFpQixnQkFBZ0IsZ0JBQWdCO0FBQUEsRUFDeEUsQ0FBQztBQUNELEVBQUFtQixNQUFLLGFBQWEsWUFBWSxDQUFDbkIsU0FBUW1CLFVBQVM7QUFDNUMsVUFBTSxrQkFBa0IsQ0FBQyxTQUFTLFVBQVUsU0FBUztBQUNyRCxhQUFTLElBQUksR0FBRyxJQUFJLGdCQUFnQixRQUFRLEtBQUs7QUFDN0MsWUFBTSxPQUFPLGdCQUFnQixDQUFDO0FBQzlCLGtCQUFZbkIsU0FBUSxNQUFNLENBQUMsVUFBVSxRQUFRb0IsVUFBUztBQUNsRCxlQUFPLFNBQVUsR0FBRyxNQUFNO0FBQ3RCLGlCQUFPRCxNQUFLLFFBQVEsSUFBSSxVQUFVbkIsU0FBUSxNQUFNb0IsS0FBSTtBQUFBLFFBQ3hEO0FBQUEsTUFDSixDQUFDO0FBQUEsSUFDTDtBQUFBLEVBQ0osQ0FBQztBQUNELEVBQUFELE1BQUssYUFBYSxlQUFlLENBQUNuQixTQUFRbUIsT0FBTSxRQUFRO0FBQ3BELGVBQVduQixTQUFRLEdBQUc7QUFDdEIscUJBQWlCQSxTQUFRLEdBQUc7QUFFNUIsVUFBTSw0QkFBNEJBLFFBQU8sMkJBQTJCO0FBQ3BFLFFBQUksNkJBQTZCLDBCQUEwQixXQUFXO0FBQ2xFLFVBQUksaUJBQWlCQSxTQUFRLEtBQUssQ0FBQywwQkFBMEIsU0FBUyxDQUFDO0FBQUEsSUFDM0U7QUFBQSxFQUNKLENBQUM7QUFDRCxFQUFBbUIsTUFBSyxhQUFhLG9CQUFvQixDQUFDbkIsU0FBUW1CLE9BQU0sUUFBUTtBQUN6RCxlQUFXLGtCQUFrQjtBQUM3QixlQUFXLHdCQUF3QjtBQUFBLEVBQ3ZDLENBQUM7QUFDRCxFQUFBQSxNQUFLLGFBQWEsd0JBQXdCLENBQUNuQixTQUFRbUIsT0FBTSxRQUFRO0FBQzdELGVBQVcsc0JBQXNCO0FBQUEsRUFDckMsQ0FBQztBQUNELEVBQUFBLE1BQUssYUFBYSxjQUFjLENBQUNuQixTQUFRbUIsT0FBTSxRQUFRO0FBQ25ELGVBQVcsWUFBWTtBQUFBLEVBQzNCLENBQUM7QUFDRCxFQUFBQSxNQUFLLGFBQWEsZUFBZSxDQUFDbkIsU0FBUW1CLE9BQU0sUUFBUTtBQUNwRCw0QkFBd0IsS0FBS25CLE9BQU07QUFBQSxFQUN2QyxDQUFDO0FBQ0QsRUFBQW1CLE1BQUssYUFBYSxrQkFBa0IsQ0FBQ25CLFNBQVFtQixPQUFNLFFBQVE7QUFDdkQsd0JBQW9CbkIsU0FBUSxHQUFHO0FBQUEsRUFDbkMsQ0FBQztBQUNELEVBQUFtQixNQUFLLGFBQWEsT0FBTyxDQUFDbkIsU0FBUW1CLFVBQVM7QUFFdkMsYUFBU25CLE9BQU07QUFDZixVQUFNLFdBQVcsV0FBVyxTQUFTO0FBQ3JDLFVBQU0sV0FBVyxXQUFXLFNBQVM7QUFDckMsVUFBTSxlQUFlLFdBQVcsYUFBYTtBQUM3QyxVQUFNLGdCQUFnQixXQUFXLGNBQWM7QUFDL0MsVUFBTSxVQUFVLFdBQVcsUUFBUTtBQUNuQyxVQUFNLDZCQUE2QixXQUFXLHlCQUF5QjtBQUN2RSxhQUFTLFNBQVNPLFNBQVE7QUFDdEIsWUFBTSxpQkFBaUJBLFFBQU8sZ0JBQWdCO0FBQzlDLFVBQUksQ0FBQyxnQkFBZ0I7QUFFakI7QUFBQSxNQUNKO0FBQ0EsWUFBTSwwQkFBMEIsZUFBZTtBQUMvQyxlQUFTLGdCQUFnQixRQUFRO0FBQzdCLGVBQU8sT0FBTyxRQUFRO0FBQUEsTUFDMUI7QUFDQSxVQUFJLGlCQUFpQix3QkFBd0IsOEJBQThCO0FBQzNFLFVBQUksb0JBQW9CLHdCQUF3QixpQ0FBaUM7QUFDakYsVUFBSSxDQUFDLGdCQUFnQjtBQUNqQixjQUFNLDRCQUE0QkEsUUFBTywyQkFBMkI7QUFDcEUsWUFBSSwyQkFBMkI7QUFDM0IsZ0JBQU0scUNBQXFDLDBCQUEwQjtBQUNyRSwyQkFBaUIsbUNBQW1DLDhCQUE4QjtBQUNsRiw4QkFBb0IsbUNBQW1DLGlDQUFpQztBQUFBLFFBQzVGO0FBQUEsTUFDSjtBQUNBLFlBQU0scUJBQXFCO0FBQzNCLFlBQU0sWUFBWTtBQUNsQixlQUFTLGFBQWEsTUFBTTtBQUN4QixjQUFNLE9BQU8sS0FBSztBQUNsQixjQUFNLFNBQVMsS0FBSztBQUNwQixlQUFPLGFBQWEsSUFBSTtBQUN4QixlQUFPLDBCQUEwQixJQUFJO0FBRXJDLGNBQU0sV0FBVyxPQUFPLFlBQVk7QUFDcEMsWUFBSSxDQUFDLGdCQUFnQjtBQUNqQiwyQkFBaUIsT0FBTyw4QkFBOEI7QUFDdEQsOEJBQW9CLE9BQU8saUNBQWlDO0FBQUEsUUFDaEU7QUFDQSxZQUFJLFVBQVU7QUFDViw0QkFBa0IsS0FBSyxRQUFRLG9CQUFvQixRQUFRO0FBQUEsUUFDL0Q7QUFDQSxjQUFNLGNBQWUsT0FBTyxZQUFZLElBQUksTUFBTTtBQUM5QyxjQUFJLE9BQU8sZUFBZSxPQUFPLE1BQU07QUFHbkMsZ0JBQUksQ0FBQyxLQUFLLFdBQVcsT0FBTyxhQUFhLEtBQUssS0FBSyxVQUFVLFdBQVc7QUFRcEUsb0JBQU0sWUFBWSxPQUFPWSxNQUFLLFdBQVcsV0FBVyxDQUFDO0FBQ3JELGtCQUFJLE9BQU8sV0FBVyxLQUFLLGFBQWEsVUFBVSxTQUFTLEdBQUc7QUFDMUQsc0JBQU0sWUFBWSxLQUFLO0FBQ3ZCLHFCQUFLLFNBQVMsV0FBWTtBQUd0Qix3QkFBTUUsYUFBWSxPQUFPRixNQUFLLFdBQVcsV0FBVyxDQUFDO0FBQ3JELDJCQUFTLElBQUksR0FBRyxJQUFJRSxXQUFVLFFBQVEsS0FBSztBQUN2Qyx3QkFBSUEsV0FBVSxDQUFDLE1BQU0sTUFBTTtBQUN2QixzQkFBQUEsV0FBVSxPQUFPLEdBQUcsQ0FBQztBQUFBLG9CQUN6QjtBQUFBLGtCQUNKO0FBQ0Esc0JBQUksQ0FBQyxLQUFLLFdBQVcsS0FBSyxVQUFVLFdBQVc7QUFDM0MsOEJBQVUsS0FBSyxJQUFJO0FBQUEsa0JBQ3ZCO0FBQUEsZ0JBQ0o7QUFDQSwwQkFBVSxLQUFLLElBQUk7QUFBQSxjQUN2QixPQUNLO0FBQ0QscUJBQUssT0FBTztBQUFBLGNBQ2hCO0FBQUEsWUFDSixXQUNTLENBQUMsS0FBSyxXQUFXLE9BQU8sYUFBYSxNQUFNLE9BQU87QUFFdkQscUJBQU8sMEJBQTBCLElBQUk7QUFBQSxZQUN6QztBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQ0EsdUJBQWUsS0FBSyxRQUFRLG9CQUFvQixXQUFXO0FBQzNELGNBQU0sYUFBYSxPQUFPLFFBQVE7QUFDbEMsWUFBSSxDQUFDLFlBQVk7QUFDYixpQkFBTyxRQUFRLElBQUk7QUFBQSxRQUN2QjtBQUNBLG1CQUFXLE1BQU0sUUFBUSxLQUFLLElBQUk7QUFDbEMsZUFBTyxhQUFhLElBQUk7QUFDeEIsZUFBTztBQUFBLE1BQ1g7QUFDQSxlQUFTLHNCQUFzQjtBQUFBLE1BQUU7QUFDakMsZUFBUyxVQUFVLE1BQU07QUFDckIsY0FBTSxPQUFPLEtBQUs7QUFHbEIsYUFBSyxVQUFVO0FBQ2YsZUFBTyxZQUFZLE1BQU0sS0FBSyxRQUFRLEtBQUssSUFBSTtBQUFBLE1BQ25EO0FBQ0EsWUFBTSxhQUFhLFlBQVkseUJBQXlCLFFBQVEsTUFBTSxTQUFVdEIsT0FBTSxNQUFNO0FBQ3hGLFFBQUFBLE1BQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxLQUFLO0FBQzVCLFFBQUFBLE1BQUssT0FBTyxJQUFJLEtBQUssQ0FBQztBQUN0QixlQUFPLFdBQVcsTUFBTUEsT0FBTSxJQUFJO0FBQUEsTUFDdEMsQ0FBQztBQUNELFlBQU0sd0JBQXdCO0FBQzlCLFlBQU0sb0JBQW9CLFdBQVcsbUJBQW1CO0FBQ3hELFlBQU0sc0JBQXNCLFdBQVcscUJBQXFCO0FBQzVELFlBQU0sYUFBYSxZQUFZLHlCQUF5QixRQUFRLE1BQU0sU0FBVUEsT0FBTSxNQUFNO0FBQ3hGLFlBQUlvQixNQUFLLFFBQVEsbUJBQW1CLE1BQU0sTUFBTTtBQUk1QyxpQkFBTyxXQUFXLE1BQU1wQixPQUFNLElBQUk7QUFBQSxRQUN0QztBQUNBLFlBQUlBLE1BQUssUUFBUSxHQUFHO0FBRWhCLGlCQUFPLFdBQVcsTUFBTUEsT0FBTSxJQUFJO0FBQUEsUUFDdEMsT0FDSztBQUNELGdCQUFNLFVBQVU7QUFBQSxZQUNaLFFBQVFBO0FBQUEsWUFDUixLQUFLQSxNQUFLLE9BQU87QUFBQSxZQUNqQixZQUFZO0FBQUEsWUFDWjtBQUFBLFlBQ0EsU0FBUztBQUFBLFVBQ2I7QUFDQSxnQkFBTSxPQUFPLGlDQUFpQyx1QkFBdUIscUJBQXFCLFNBQVMsY0FBYyxTQUFTO0FBQzFILGNBQUlBLFNBQ0FBLE1BQUssMEJBQTBCLE1BQU0sUUFDckMsQ0FBQyxRQUFRLFdBQ1QsS0FBSyxVQUFVLFdBQVc7QUFJMUIsaUJBQUssT0FBTztBQUFBLFVBQ2hCO0FBQUEsUUFDSjtBQUFBLE1BQ0osQ0FBQztBQUNELFlBQU0sY0FBYyxZQUFZLHlCQUF5QixTQUFTLE1BQU0sU0FBVUEsT0FBTSxNQUFNO0FBQzFGLGNBQU0sT0FBTyxnQkFBZ0JBLEtBQUk7QUFDakMsWUFBSSxRQUFRLE9BQU8sS0FBSyxRQUFRLFVBQVU7QUFLdEMsY0FBSSxLQUFLLFlBQVksUUFBUyxLQUFLLFFBQVEsS0FBSyxLQUFLLFNBQVU7QUFDM0Q7QUFBQSxVQUNKO0FBQ0EsZUFBSyxLQUFLLFdBQVcsSUFBSTtBQUFBLFFBQzdCLFdBQ1NvQixNQUFLLFFBQVEsaUJBQWlCLE1BQU0sTUFBTTtBQUUvQyxpQkFBTyxZQUFZLE1BQU1wQixPQUFNLElBQUk7QUFBQSxRQUN2QztBQUFBLE1BSUosQ0FBQztBQUFBLElBQ0w7QUFBQSxFQUNKLENBQUM7QUFDRCxFQUFBb0IsTUFBSyxhQUFhLGVBQWUsQ0FBQ25CLFlBQVc7QUFFekMsUUFBSUEsUUFBTyxXQUFXLEtBQUtBLFFBQU8sV0FBVyxFQUFFLGFBQWE7QUFDeEQscUJBQWVBLFFBQU8sV0FBVyxFQUFFLGFBQWEsQ0FBQyxzQkFBc0IsZUFBZSxDQUFDO0FBQUEsSUFDM0Y7QUFBQSxFQUNKLENBQUM7QUFDRCxFQUFBbUIsTUFBSyxhQUFhLHlCQUF5QixDQUFDbkIsU0FBUW1CLFVBQVM7QUFFekQsYUFBUyw0QkFBNEIsU0FBUztBQUMxQyxhQUFPLFNBQVUsR0FBRztBQUNoQixjQUFNLGFBQWEsZUFBZW5CLFNBQVEsT0FBTztBQUNqRCxtQkFBVyxRQUFRLENBQUMsY0FBYztBQUc5QixnQkFBTSx3QkFBd0JBLFFBQU8sdUJBQXVCO0FBQzVELGNBQUksdUJBQXVCO0FBQ3ZCLGtCQUFNLE1BQU0sSUFBSSxzQkFBc0IsU0FBUztBQUFBLGNBQzNDLFNBQVMsRUFBRTtBQUFBLGNBQ1gsUUFBUSxFQUFFO0FBQUEsWUFDZCxDQUFDO0FBQ0Qsc0JBQVUsT0FBTyxHQUFHO0FBQUEsVUFDeEI7QUFBQSxRQUNKLENBQUM7QUFBQSxNQUNMO0FBQUEsSUFDSjtBQUNBLFFBQUlBLFFBQU8sdUJBQXVCLEdBQUc7QUFDakMsTUFBQW1CLE1BQUssV0FBVyxrQ0FBa0MsQ0FBQyxJQUMvQyw0QkFBNEIsb0JBQW9CO0FBQ3BELE1BQUFBLE1BQUssV0FBVyx5QkFBeUIsQ0FBQyxJQUN0Qyw0QkFBNEIsa0JBQWtCO0FBQUEsSUFDdEQ7QUFBQSxFQUNKLENBQUM7QUFDRCxFQUFBQSxNQUFLLGFBQWEsa0JBQWtCLENBQUNuQixTQUFRbUIsT0FBTSxRQUFRO0FBQ3ZELHdCQUFvQm5CLFNBQVEsR0FBRztBQUFBLEVBQ25DLENBQUM7QUFDTDtBQUVBLFNBQVMsYUFBYW1CLE9BQU07QUFDeEIsRUFBQUEsTUFBSyxhQUFhLG9CQUFvQixDQUFDbkIsU0FBUW1CLE9BQU0sUUFBUTtBQUN6RCxVQUFNRyxrQ0FBaUMsT0FBTztBQUM5QyxVQUFNQyx3QkFBdUIsT0FBTztBQUNwQyxhQUFTLHVCQUF1QixLQUFLO0FBQ2pDLFVBQUksT0FBTyxJQUFJLGFBQWEsT0FBTyxVQUFVLFVBQVU7QUFDbkQsY0FBTSxZQUFZLElBQUksZUFBZSxJQUFJLFlBQVk7QUFDckQsZ0JBQVEsWUFBWSxZQUFZLE1BQU0sT0FBTyxLQUFLLFVBQVUsR0FBRztBQUFBLE1BQ25FO0FBQ0EsYUFBTyxNQUFNLElBQUksU0FBUyxJQUFJLE9BQU8sVUFBVSxTQUFTLEtBQUssR0FBRztBQUFBLElBQ3BFO0FBQ0EsVUFBTUMsY0FBYSxJQUFJO0FBQ3ZCLFVBQU0seUJBQXlCLENBQUM7QUFDaEMsVUFBTSw0Q0FBNEN4QixRQUFPd0IsWUFBVyw2Q0FBNkMsQ0FBQyxNQUFNO0FBQ3hILFVBQU0sZ0JBQWdCQSxZQUFXLFNBQVM7QUFDMUMsVUFBTSxhQUFhQSxZQUFXLE1BQU07QUFDcEMsVUFBTSxnQkFBZ0I7QUFDdEIsUUFBSSxtQkFBbUIsQ0FBQyxNQUFNO0FBQzFCLFVBQUksSUFBSSxrQkFBa0IsR0FBRztBQUN6QixjQUFNLFlBQVksS0FBSyxFQUFFO0FBQ3pCLFlBQUksV0FBVztBQUNYLGtCQUFRLE1BQU0sZ0NBQWdDLHFCQUFxQixRQUFRLFVBQVUsVUFBVSxXQUFXLFdBQVcsRUFBRSxLQUFLLE1BQU0sV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLFFBQVEsWUFBWSxXQUFXLHFCQUFxQixRQUFRLFVBQVUsUUFBUSxNQUFTO0FBQUEsUUFDelAsT0FDSztBQUNELGtCQUFRLE1BQU0sQ0FBQztBQUFBLFFBQ25CO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFDQSxRQUFJLHFCQUFxQixNQUFNO0FBQzNCLGFBQU8sdUJBQXVCLFFBQVE7QUFDbEMsY0FBTSx1QkFBdUIsdUJBQXVCLE1BQU07QUFDMUQsWUFBSTtBQUNBLCtCQUFxQixLQUFLLFdBQVcsTUFBTTtBQUN2QyxnQkFBSSxxQkFBcUIsZUFBZTtBQUNwQyxvQkFBTSxxQkFBcUI7QUFBQSxZQUMvQjtBQUNBLGtCQUFNO0FBQUEsVUFDVixDQUFDO0FBQUEsUUFDTCxTQUNPLE9BQU87QUFDVixtQ0FBeUIsS0FBSztBQUFBLFFBQ2xDO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFDQSxVQUFNLDZDQUE2Q0EsWUFBVyxrQ0FBa0M7QUFDaEcsYUFBUyx5QkFBeUIsR0FBRztBQUNqQyxVQUFJLGlCQUFpQixDQUFDO0FBQ3RCLFVBQUk7QUFDQSxjQUFNLFVBQVVMLE1BQUssMENBQTBDO0FBQy9ELFlBQUksT0FBTyxZQUFZLFlBQVk7QUFDL0Isa0JBQVEsS0FBSyxNQUFNLENBQUM7QUFBQSxRQUN4QjtBQUFBLE1BQ0osU0FDTyxLQUFLO0FBQUEsTUFBRTtBQUFBLElBQ2xCO0FBQ0EsYUFBUyxXQUFXLE9BQU87QUFDdkIsYUFBTyxTQUFTLE9BQU8sTUFBTSxTQUFTO0FBQUEsSUFDMUM7QUFDQSxhQUFTLGtCQUFrQixPQUFPO0FBQzlCLGFBQU87QUFBQSxJQUNYO0FBQ0EsYUFBUyxpQkFBaUIsV0FBVztBQUNqQyxhQUFPLGlCQUFpQixPQUFPLFNBQVM7QUFBQSxJQUM1QztBQUNBLFVBQU0sY0FBY0ssWUFBVyxPQUFPO0FBQ3RDLFVBQU0sY0FBY0EsWUFBVyxPQUFPO0FBQ3RDLFVBQU0sZ0JBQWdCQSxZQUFXLFNBQVM7QUFDMUMsVUFBTSwyQkFBMkJBLFlBQVcsb0JBQW9CO0FBQ2hFLFVBQU0sMkJBQTJCQSxZQUFXLG9CQUFvQjtBQUNoRSxVQUFNLFNBQVM7QUFDZixVQUFNLGFBQWE7QUFDbkIsVUFBTSxXQUFXO0FBQ2pCLFVBQU0sV0FBVztBQUNqQixVQUFNLG9CQUFvQjtBQUMxQixhQUFTLGFBQWEsU0FBUyxPQUFPO0FBQ2xDLGFBQU8sQ0FBQyxNQUFNO0FBQ1YsWUFBSTtBQUNBLHlCQUFlLFNBQVMsT0FBTyxDQUFDO0FBQUEsUUFDcEMsU0FDTyxLQUFLO0FBQ1IseUJBQWUsU0FBUyxPQUFPLEdBQUc7QUFBQSxRQUN0QztBQUFBLE1BRUo7QUFBQSxJQUNKO0FBQ0EsVUFBTSxPQUFPLFdBQVk7QUFDckIsVUFBSSxZQUFZO0FBQ2hCLGFBQU8sU0FBUyxRQUFRLGlCQUFpQjtBQUNyQyxlQUFPLFdBQVk7QUFDZixjQUFJLFdBQVc7QUFDWDtBQUFBLFVBQ0o7QUFDQSxzQkFBWTtBQUNaLDBCQUFnQixNQUFNLE1BQU0sU0FBUztBQUFBLFFBQ3pDO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFDQSxVQUFNLGFBQWE7QUFDbkIsVUFBTSw0QkFBNEJBLFlBQVcsa0JBQWtCO0FBRS9ELGFBQVMsZUFBZSxTQUFTLE9BQU8sT0FBTztBQUMzQyxZQUFNLGNBQWMsS0FBSztBQUN6QixVQUFJLFlBQVksT0FBTztBQUNuQixjQUFNLElBQUksVUFBVSxVQUFVO0FBQUEsTUFDbEM7QUFDQSxVQUFJLFFBQVEsV0FBVyxNQUFNLFlBQVk7QUFFckMsWUFBSSxPQUFPO0FBQ1gsWUFBSTtBQUNBLGNBQUksT0FBTyxVQUFVLFlBQVksT0FBTyxVQUFVLFlBQVk7QUFDMUQsbUJBQU8sU0FBUyxNQUFNO0FBQUEsVUFDMUI7QUFBQSxRQUNKLFNBQ08sS0FBSztBQUNSLHNCQUFZLE1BQU07QUFDZCwyQkFBZSxTQUFTLE9BQU8sR0FBRztBQUFBLFVBQ3RDLENBQUMsRUFBRTtBQUNILGlCQUFPO0FBQUEsUUFDWDtBQUVBLFlBQUksVUFBVSxZQUNWLGlCQUFpQixvQkFDakIsTUFBTSxlQUFlLFdBQVcsS0FDaEMsTUFBTSxlQUFlLFdBQVcsS0FDaEMsTUFBTSxXQUFXLE1BQU0sWUFBWTtBQUNuQywrQkFBcUIsS0FBSztBQUMxQix5QkFBZSxTQUFTLE1BQU0sV0FBVyxHQUFHLE1BQU0sV0FBVyxDQUFDO0FBQUEsUUFDbEUsV0FDUyxVQUFVLFlBQVksT0FBTyxTQUFTLFlBQVk7QUFDdkQsY0FBSTtBQUNBLGlCQUFLLEtBQUssT0FBTyxZQUFZLGFBQWEsU0FBUyxLQUFLLENBQUMsR0FBRyxZQUFZLGFBQWEsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUFBLFVBQ3pHLFNBQ08sS0FBSztBQUNSLHdCQUFZLE1BQU07QUFDZCw2QkFBZSxTQUFTLE9BQU8sR0FBRztBQUFBLFlBQ3RDLENBQUMsRUFBRTtBQUFBLFVBQ1A7QUFBQSxRQUNKLE9BQ0s7QUFDRCxrQkFBUSxXQUFXLElBQUk7QUFDdkIsZ0JBQU0sUUFBUSxRQUFRLFdBQVc7QUFDakMsa0JBQVEsV0FBVyxJQUFJO0FBQ3ZCLGNBQUksUUFBUSxhQUFhLE1BQU0sZUFBZTtBQUUxQyxnQkFBSSxVQUFVLFVBQVU7QUFHcEIsc0JBQVEsV0FBVyxJQUFJLFFBQVEsd0JBQXdCO0FBQ3ZELHNCQUFRLFdBQVcsSUFBSSxRQUFRLHdCQUF3QjtBQUFBLFlBQzNEO0FBQUEsVUFDSjtBQUdBLGNBQUksVUFBVSxZQUFZLGlCQUFpQixPQUFPO0FBRTlDLGtCQUFNLFFBQVFMLE1BQUssZUFDZkEsTUFBSyxZQUFZLFFBQ2pCQSxNQUFLLFlBQVksS0FBSyxhQUFhO0FBQ3ZDLGdCQUFJLE9BQU87QUFFUCxjQUFBSSxzQkFBcUIsT0FBTywyQkFBMkI7QUFBQSxnQkFDbkQsY0FBYztBQUFBLGdCQUNkLFlBQVk7QUFBQSxnQkFDWixVQUFVO0FBQUEsZ0JBQ1YsT0FBTztBQUFBLGNBQ1gsQ0FBQztBQUFBLFlBQ0w7QUFBQSxVQUNKO0FBQ0EsbUJBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxVQUFTO0FBQy9CLG9DQUF3QixTQUFTLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsVUFDbkY7QUFDQSxjQUFJLE1BQU0sVUFBVSxLQUFLLFNBQVMsVUFBVTtBQUN4QyxvQkFBUSxXQUFXLElBQUk7QUFDdkIsZ0JBQUksdUJBQXVCO0FBQzNCLGdCQUFJO0FBSUEsb0JBQU0sSUFBSSxNQUFNLDRCQUNaLHVCQUF1QixLQUFLLEtBQzNCLFNBQVMsTUFBTSxRQUFRLE9BQU8sTUFBTSxRQUFRLEdBQUc7QUFBQSxZQUN4RCxTQUNPLEtBQUs7QUFDUixxQ0FBdUI7QUFBQSxZQUMzQjtBQUNBLGdCQUFJLDJDQUEyQztBQUczQyxtQ0FBcUIsZ0JBQWdCO0FBQUEsWUFDekM7QUFDQSxpQ0FBcUIsWUFBWTtBQUNqQyxpQ0FBcUIsVUFBVTtBQUMvQixpQ0FBcUIsT0FBT0osTUFBSztBQUNqQyxpQ0FBcUIsT0FBT0EsTUFBSztBQUNqQyxtQ0FBdUIsS0FBSyxvQkFBb0I7QUFDaEQsZ0JBQUksa0JBQWtCO0FBQUEsVUFDMUI7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUVBLGFBQU87QUFBQSxJQUNYO0FBQ0EsVUFBTSw0QkFBNEJLLFlBQVcseUJBQXlCO0FBQ3RFLGFBQVMscUJBQXFCLFNBQVM7QUFDbkMsVUFBSSxRQUFRLFdBQVcsTUFBTSxtQkFBbUI7QUFNNUMsWUFBSTtBQUNBLGdCQUFNLFVBQVVMLE1BQUsseUJBQXlCO0FBQzlDLGNBQUksV0FBVyxPQUFPLFlBQVksWUFBWTtBQUMxQyxvQkFBUSxLQUFLLE1BQU0sRUFBRSxXQUFXLFFBQVEsV0FBVyxHQUFHLFFBQWlCLENBQUM7QUFBQSxVQUM1RTtBQUFBLFFBQ0osU0FDTyxLQUFLO0FBQUEsUUFBRTtBQUNkLGdCQUFRLFdBQVcsSUFBSTtBQUN2QixpQkFBUyxJQUFJLEdBQUcsSUFBSSx1QkFBdUIsUUFBUSxLQUFLO0FBQ3BELGNBQUksWUFBWSx1QkFBdUIsQ0FBQyxFQUFFLFNBQVM7QUFDL0MsbUNBQXVCLE9BQU8sR0FBRyxDQUFDO0FBQUEsVUFDdEM7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFDQSxhQUFTLHdCQUF3QixTQUFTLE1BQU0sY0FBYyxhQUFhLFlBQVk7QUFDbkYsMkJBQXFCLE9BQU87QUFDNUIsWUFBTSxlQUFlLFFBQVEsV0FBVztBQUN4QyxZQUFNLFdBQVcsZUFDWCxPQUFPLGdCQUFnQixhQUNuQixjQUNBLG9CQUNKLE9BQU8sZUFBZSxhQUNsQixhQUNBO0FBQ1YsV0FBSyxrQkFBa0IsUUFBUSxNQUFNO0FBQ2pDLFlBQUk7QUFDQSxnQkFBTSxxQkFBcUIsUUFBUSxXQUFXO0FBQzlDLGdCQUFNLG1CQUFtQixDQUFDLENBQUMsZ0JBQWdCLGtCQUFrQixhQUFhLGFBQWE7QUFDdkYsY0FBSSxrQkFBa0I7QUFFbEIseUJBQWEsd0JBQXdCLElBQUk7QUFDekMseUJBQWEsd0JBQXdCLElBQUk7QUFBQSxVQUM3QztBQUVBLGdCQUFNLFFBQVEsS0FBSyxJQUFJLFVBQVUsUUFBVyxvQkFBb0IsYUFBYSxvQkFBb0IsYUFBYSxvQkFDeEcsQ0FBQyxJQUNELENBQUMsa0JBQWtCLENBQUM7QUFDMUIseUJBQWUsY0FBYyxNQUFNLEtBQUs7QUFBQSxRQUM1QyxTQUNPLE9BQU87QUFFVix5QkFBZSxjQUFjLE9BQU8sS0FBSztBQUFBLFFBQzdDO0FBQUEsTUFDSixHQUFHLFlBQVk7QUFBQSxJQUNuQjtBQUNBLFVBQU0sK0JBQStCO0FBQ3JDLFVBQU0sT0FBTyxXQUFZO0FBQUEsSUFBRTtBQUMzQixVQUFNLGlCQUFpQm5CLFFBQU87QUFBQSxJQUM5QixNQUFNLGlCQUFpQjtBQUFBLE1BQ25CLE9BQU8sV0FBVztBQUNkLGVBQU87QUFBQSxNQUNYO0FBQUEsTUFDQSxPQUFPLFFBQVEsT0FBTztBQUNsQixZQUFJLGlCQUFpQixrQkFBa0I7QUFDbkMsaUJBQU87QUFBQSxRQUNYO0FBQ0EsZUFBTyxlQUFlLElBQUksS0FBSyxJQUFJLEdBQUcsVUFBVSxLQUFLO0FBQUEsTUFDekQ7QUFBQSxNQUNBLE9BQU8sT0FBTyxPQUFPO0FBQ2pCLGVBQU8sZUFBZSxJQUFJLEtBQUssSUFBSSxHQUFHLFVBQVUsS0FBSztBQUFBLE1BQ3pEO0FBQUEsTUFDQSxPQUFPLGdCQUFnQjtBQUNuQixjQUFNLFNBQVMsQ0FBQztBQUNoQixlQUFPLFVBQVUsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLFFBQVE7QUFDaEQsaUJBQU8sVUFBVTtBQUNqQixpQkFBTyxTQUFTO0FBQUEsUUFDcEIsQ0FBQztBQUNELGVBQU87QUFBQSxNQUNYO0FBQUEsTUFDQSxPQUFPLElBQUksUUFBUTtBQUNmLFlBQUksQ0FBQyxVQUFVLE9BQU8sT0FBTyxPQUFPLFFBQVEsTUFBTSxZQUFZO0FBQzFELGlCQUFPLFFBQVEsT0FBTyxJQUFJLGVBQWUsQ0FBQyxHQUFHLDRCQUE0QixDQUFDO0FBQUEsUUFDOUU7QUFDQSxjQUFNLFdBQVcsQ0FBQztBQUNsQixZQUFJLFFBQVE7QUFDWixZQUFJO0FBQ0EsbUJBQVMsS0FBSyxRQUFRO0FBQ2xCO0FBQ0EscUJBQVMsS0FBSyxpQkFBaUIsUUFBUSxDQUFDLENBQUM7QUFBQSxVQUM3QztBQUFBLFFBQ0osU0FDTyxLQUFLO0FBQ1IsaUJBQU8sUUFBUSxPQUFPLElBQUksZUFBZSxDQUFDLEdBQUcsNEJBQTRCLENBQUM7QUFBQSxRQUM5RTtBQUNBLFlBQUksVUFBVSxHQUFHO0FBQ2IsaUJBQU8sUUFBUSxPQUFPLElBQUksZUFBZSxDQUFDLEdBQUcsNEJBQTRCLENBQUM7QUFBQSxRQUM5RTtBQUNBLFlBQUksV0FBVztBQUNmLGNBQU0sU0FBUyxDQUFDO0FBQ2hCLGVBQU8sSUFBSSxpQkFBaUIsQ0FBQyxTQUFTLFdBQVc7QUFDN0MsbUJBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxRQUFRLEtBQUs7QUFDdEMscUJBQVMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxNQUFNO0FBQ3BCLGtCQUFJLFVBQVU7QUFDVjtBQUFBLGNBQ0o7QUFDQSx5QkFBVztBQUNYLHNCQUFRLENBQUM7QUFBQSxZQUNiLEdBQUcsQ0FBQyxRQUFRO0FBQ1IscUJBQU8sS0FBSyxHQUFHO0FBQ2Y7QUFDQSxrQkFBSSxVQUFVLEdBQUc7QUFDYiwyQkFBVztBQUNYLHVCQUFPLElBQUksZUFBZSxRQUFRLDRCQUE0QixDQUFDO0FBQUEsY0FDbkU7QUFBQSxZQUNKLENBQUM7QUFBQSxVQUNMO0FBQUEsUUFDSixDQUFDO0FBQUEsTUFDTDtBQUFBLE1BQ0EsT0FBTyxLQUFLLFFBQVE7QUFDaEIsWUFBSTtBQUNKLFlBQUk7QUFDSixZQUFJLFVBQVUsSUFBSSxLQUFLLENBQUMsS0FBSyxRQUFRO0FBQ2pDLG9CQUFVO0FBQ1YsbUJBQVM7QUFBQSxRQUNiLENBQUM7QUFDRCxpQkFBUyxVQUFVLE9BQU87QUFDdEIsa0JBQVEsS0FBSztBQUFBLFFBQ2pCO0FBQ0EsaUJBQVMsU0FBUyxPQUFPO0FBQ3JCLGlCQUFPLEtBQUs7QUFBQSxRQUNoQjtBQUNBLGlCQUFTLFNBQVMsUUFBUTtBQUN0QixjQUFJLENBQUMsV0FBVyxLQUFLLEdBQUc7QUFDcEIsb0JBQVEsS0FBSyxRQUFRLEtBQUs7QUFBQSxVQUM5QjtBQUNBLGdCQUFNLEtBQUssV0FBVyxRQUFRO0FBQUEsUUFDbEM7QUFDQSxlQUFPO0FBQUEsTUFDWDtBQUFBLE1BQ0EsT0FBTyxJQUFJLFFBQVE7QUFDZixlQUFPLGlCQUFpQixnQkFBZ0IsTUFBTTtBQUFBLE1BQ2xEO0FBQUEsTUFDQSxPQUFPLFdBQVcsUUFBUTtBQUN0QixjQUFNLElBQUksUUFBUSxLQUFLLHFCQUFxQixtQkFBbUIsT0FBTztBQUN0RSxlQUFPLEVBQUUsZ0JBQWdCLFFBQVE7QUFBQSxVQUM3QixjQUFjLENBQUMsV0FBVyxFQUFFLFFBQVEsYUFBYSxNQUFNO0FBQUEsVUFDdkQsZUFBZSxDQUFDLFNBQVMsRUFBRSxRQUFRLFlBQVksUUFBUSxJQUFJO0FBQUEsUUFDL0QsQ0FBQztBQUFBLE1BQ0w7QUFBQSxNQUNBLE9BQU8sZ0JBQWdCLFFBQVEsVUFBVTtBQUNyQyxZQUFJO0FBQ0osWUFBSTtBQUNKLFlBQUksVUFBVSxJQUFJLEtBQUssQ0FBQyxLQUFLLFFBQVE7QUFDakMsb0JBQVU7QUFDVixtQkFBUztBQUFBLFFBQ2IsQ0FBQztBQUVELFlBQUksa0JBQWtCO0FBQ3RCLFlBQUksYUFBYTtBQUNqQixjQUFNLGlCQUFpQixDQUFDO0FBQ3hCLGlCQUFTLFNBQVMsUUFBUTtBQUN0QixjQUFJLENBQUMsV0FBVyxLQUFLLEdBQUc7QUFDcEIsb0JBQVEsS0FBSyxRQUFRLEtBQUs7QUFBQSxVQUM5QjtBQUNBLGdCQUFNLGdCQUFnQjtBQUN0QixjQUFJO0FBQ0Esa0JBQU0sS0FBSyxDQUFDeUIsV0FBVTtBQUNsQiw2QkFBZSxhQUFhLElBQUksV0FBVyxTQUFTLGFBQWFBLE1BQUssSUFBSUE7QUFDMUU7QUFDQSxrQkFBSSxvQkFBb0IsR0FBRztBQUN2Qix3QkFBUSxjQUFjO0FBQUEsY0FDMUI7QUFBQSxZQUNKLEdBQUcsQ0FBQyxRQUFRO0FBQ1Isa0JBQUksQ0FBQyxVQUFVO0FBQ1gsdUJBQU8sR0FBRztBQUFBLGNBQ2QsT0FDSztBQUNELCtCQUFlLGFBQWEsSUFBSSxTQUFTLGNBQWMsR0FBRztBQUMxRDtBQUNBLG9CQUFJLG9CQUFvQixHQUFHO0FBQ3ZCLDBCQUFRLGNBQWM7QUFBQSxnQkFDMUI7QUFBQSxjQUNKO0FBQUEsWUFDSixDQUFDO0FBQUEsVUFDTCxTQUNPLFNBQVM7QUFDWixtQkFBTyxPQUFPO0FBQUEsVUFDbEI7QUFDQTtBQUNBO0FBQUEsUUFDSjtBQUVBLDJCQUFtQjtBQUNuQixZQUFJLG9CQUFvQixHQUFHO0FBQ3ZCLGtCQUFRLGNBQWM7QUFBQSxRQUMxQjtBQUNBLGVBQU87QUFBQSxNQUNYO0FBQUEsTUFDQSxZQUFZLFVBQVU7QUFDbEIsY0FBTSxVQUFVO0FBQ2hCLFlBQUksRUFBRSxtQkFBbUIsbUJBQW1CO0FBQ3hDLGdCQUFNLElBQUksTUFBTSxnQ0FBZ0M7QUFBQSxRQUNwRDtBQUNBLGdCQUFRLFdBQVcsSUFBSTtBQUN2QixnQkFBUSxXQUFXLElBQUksQ0FBQztBQUN4QixZQUFJO0FBQ0EsZ0JBQU0sY0FBYyxLQUFLO0FBQ3pCLHNCQUNJLFNBQVMsWUFBWSxhQUFhLFNBQVMsUUFBUSxDQUFDLEdBQUcsWUFBWSxhQUFhLFNBQVMsUUFBUSxDQUFDLENBQUM7QUFBQSxRQUMzRyxTQUNPLE9BQU87QUFDVix5QkFBZSxTQUFTLE9BQU8sS0FBSztBQUFBLFFBQ3hDO0FBQUEsTUFDSjtBQUFBLE1BQ0EsS0FBSyxPQUFPLFdBQVcsSUFBSTtBQUN2QixlQUFPO0FBQUEsTUFDWDtBQUFBLE1BQ0EsS0FBSyxPQUFPLE9BQU8sSUFBSTtBQUNuQixlQUFPO0FBQUEsTUFDWDtBQUFBLE1BQ0EsS0FBSyxhQUFhLFlBQVk7QUFTMUIsWUFBSSxJQUFJLEtBQUssY0FBYyxPQUFPLE9BQU87QUFDekMsWUFBSSxDQUFDLEtBQUssT0FBTyxNQUFNLFlBQVk7QUFDL0IsY0FBSSxLQUFLLGVBQWU7QUFBQSxRQUM1QjtBQUNBLGNBQU0sZUFBZSxJQUFJLEVBQUUsSUFBSTtBQUMvQixjQUFNLE9BQU9OLE1BQUs7QUFDbEIsWUFBSSxLQUFLLFdBQVcsS0FBSyxZQUFZO0FBQ2pDLGVBQUssV0FBVyxFQUFFLEtBQUssTUFBTSxjQUFjLGFBQWEsVUFBVTtBQUFBLFFBQ3RFLE9BQ0s7QUFDRCxrQ0FBd0IsTUFBTSxNQUFNLGNBQWMsYUFBYSxVQUFVO0FBQUEsUUFDN0U7QUFDQSxlQUFPO0FBQUEsTUFDWDtBQUFBLE1BQ0EsTUFBTSxZQUFZO0FBQ2QsZUFBTyxLQUFLLEtBQUssTUFBTSxVQUFVO0FBQUEsTUFDckM7QUFBQSxNQUNBLFFBQVEsV0FBVztBQUVmLFlBQUksSUFBSSxLQUFLLGNBQWMsT0FBTyxPQUFPO0FBQ3pDLFlBQUksQ0FBQyxLQUFLLE9BQU8sTUFBTSxZQUFZO0FBQy9CLGNBQUk7QUFBQSxRQUNSO0FBQ0EsY0FBTSxlQUFlLElBQUksRUFBRSxJQUFJO0FBQy9CLHFCQUFhLGFBQWEsSUFBSTtBQUM5QixjQUFNLE9BQU9BLE1BQUs7QUFDbEIsWUFBSSxLQUFLLFdBQVcsS0FBSyxZQUFZO0FBQ2pDLGVBQUssV0FBVyxFQUFFLEtBQUssTUFBTSxjQUFjLFdBQVcsU0FBUztBQUFBLFFBQ25FLE9BQ0s7QUFDRCxrQ0FBd0IsTUFBTSxNQUFNLGNBQWMsV0FBVyxTQUFTO0FBQUEsUUFDMUU7QUFDQSxlQUFPO0FBQUEsTUFDWDtBQUFBLElBQ0o7QUFHQSxxQkFBaUIsU0FBUyxJQUFJLGlCQUFpQjtBQUMvQyxxQkFBaUIsUUFBUSxJQUFJLGlCQUFpQjtBQUM5QyxxQkFBaUIsTUFBTSxJQUFJLGlCQUFpQjtBQUM1QyxxQkFBaUIsS0FBSyxJQUFJLGlCQUFpQjtBQUMzQyxVQUFNLGdCQUFpQm5CLFFBQU8sYUFBYSxJQUFJQSxRQUFPLFNBQVM7QUFDL0QsSUFBQUEsUUFBTyxTQUFTLElBQUk7QUFDcEIsVUFBTSxvQkFBb0J3QixZQUFXLGFBQWE7QUFDbEQsYUFBUyxVQUFVLE1BQU07QUFDckIsWUFBTSxRQUFRLEtBQUs7QUFDbkIsWUFBTSxPQUFPRixnQ0FBK0IsT0FBTyxNQUFNO0FBQ3pELFVBQUksU0FBUyxLQUFLLGFBQWEsU0FBUyxDQUFDLEtBQUssZUFBZTtBQUd6RDtBQUFBLE1BQ0o7QUFDQSxZQUFNLGVBQWUsTUFBTTtBQUUzQixZQUFNLFVBQVUsSUFBSTtBQUNwQixXQUFLLFVBQVUsT0FBTyxTQUFVLFdBQVcsVUFBVTtBQUNqRCxjQUFNLFVBQVUsSUFBSSxpQkFBaUIsQ0FBQyxTQUFTLFdBQVc7QUFDdEQsdUJBQWEsS0FBSyxNQUFNLFNBQVMsTUFBTTtBQUFBLFFBQzNDLENBQUM7QUFDRCxlQUFPLFFBQVEsS0FBSyxXQUFXLFFBQVE7QUFBQSxNQUMzQztBQUNBLFdBQUssaUJBQWlCLElBQUk7QUFBQSxJQUM5QjtBQUNBLFFBQUksWUFBWTtBQUNoQixhQUFTLFFBQVEsSUFBSTtBQUNqQixhQUFPLFNBQVV2QixPQUFNLE1BQU07QUFDekIsWUFBSSxnQkFBZ0IsR0FBRyxNQUFNQSxPQUFNLElBQUk7QUFDdkMsWUFBSSx5QkFBeUIsa0JBQWtCO0FBQzNDLGlCQUFPO0FBQUEsUUFDWDtBQUNBLFlBQUksT0FBTyxjQUFjO0FBQ3pCLFlBQUksQ0FBQyxLQUFLLGlCQUFpQixHQUFHO0FBQzFCLG9CQUFVLElBQUk7QUFBQSxRQUNsQjtBQUNBLGVBQU87QUFBQSxNQUNYO0FBQUEsSUFDSjtBQUNBLFFBQUksZUFBZTtBQUNmLGdCQUFVLGFBQWE7QUFDdkIsa0JBQVlDLFNBQVEsU0FBUyxDQUFDLGFBQWEsUUFBUSxRQUFRLENBQUM7QUFBQSxJQUNoRTtBQUVBLFlBQVFtQixNQUFLLFdBQVcsdUJBQXVCLENBQUMsSUFBSTtBQUNwRCxXQUFPO0FBQUEsRUFDWCxDQUFDO0FBQ0w7QUFFQSxTQUFTLGNBQWNBLE9BQU07QUFHekIsRUFBQUEsTUFBSyxhQUFhLFlBQVksQ0FBQ25CLFlBQVc7QUFFdEMsVUFBTSwyQkFBMkIsU0FBUyxVQUFVO0FBQ3BELFVBQU0sMkJBQTJCLFdBQVcsa0JBQWtCO0FBQzlELFVBQU0saUJBQWlCLFdBQVcsU0FBUztBQUMzQyxVQUFNLGVBQWUsV0FBVyxPQUFPO0FBQ3ZDLFVBQU0sc0JBQXNCLFNBQVMsV0FBVztBQUM1QyxVQUFJLE9BQU8sU0FBUyxZQUFZO0FBQzVCLGNBQU0sbUJBQW1CLEtBQUssd0JBQXdCO0FBQ3RELFlBQUksa0JBQWtCO0FBQ2xCLGNBQUksT0FBTyxxQkFBcUIsWUFBWTtBQUN4QyxtQkFBTyx5QkFBeUIsS0FBSyxnQkFBZ0I7QUFBQSxVQUN6RCxPQUNLO0FBQ0QsbUJBQU8sT0FBTyxVQUFVLFNBQVMsS0FBSyxnQkFBZ0I7QUFBQSxVQUMxRDtBQUFBLFFBQ0o7QUFDQSxZQUFJLFNBQVMsU0FBUztBQUNsQixnQkFBTSxnQkFBZ0JBLFFBQU8sY0FBYztBQUMzQyxjQUFJLGVBQWU7QUFDZixtQkFBTyx5QkFBeUIsS0FBSyxhQUFhO0FBQUEsVUFDdEQ7QUFBQSxRQUNKO0FBQ0EsWUFBSSxTQUFTLE9BQU87QUFDaEIsZ0JBQU0sY0FBY0EsUUFBTyxZQUFZO0FBQ3ZDLGNBQUksYUFBYTtBQUNiLG1CQUFPLHlCQUF5QixLQUFLLFdBQVc7QUFBQSxVQUNwRDtBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQ0EsYUFBTyx5QkFBeUIsS0FBSyxJQUFJO0FBQUEsSUFDN0M7QUFDQSx3QkFBb0Isd0JBQXdCLElBQUk7QUFDaEQsYUFBUyxVQUFVLFdBQVc7QUFFOUIsVUFBTSx5QkFBeUIsT0FBTyxVQUFVO0FBQ2hELFVBQU0sMkJBQTJCO0FBQ2pDLFdBQU8sVUFBVSxXQUFXLFdBQVk7QUFDcEMsVUFBSSxPQUFPLFlBQVksY0FBYyxnQkFBZ0IsU0FBUztBQUMxRCxlQUFPO0FBQUEsTUFDWDtBQUNBLGFBQU8sdUJBQXVCLEtBQUssSUFBSTtBQUFBLElBQzNDO0FBQUEsRUFDSixDQUFDO0FBQ0w7QUFFQSxTQUFTLGVBQWUsS0FBSyxRQUFRLFlBQVksUUFBUSxXQUFXO0FBQ2hFLFFBQU0sU0FBUyxLQUFLLFdBQVcsTUFBTTtBQUNyQyxNQUFJLE9BQU8sTUFBTSxHQUFHO0FBQ2hCO0FBQUEsRUFDSjtBQUNBLFFBQU0saUJBQWtCLE9BQU8sTUFBTSxJQUFJLE9BQU8sTUFBTTtBQUN0RCxTQUFPLE1BQU0sSUFBSSxTQUFVLE1BQU0sTUFBTSxTQUFTO0FBQzVDLFFBQUksUUFBUSxLQUFLLFdBQVc7QUFDeEIsZ0JBQVUsUUFBUSxTQUFVLFVBQVU7QUFDbEMsY0FBTSxTQUFTLEdBQUcsVUFBVSxJQUFJLE1BQU0sT0FBTztBQUM3QyxjQUFNLFlBQVksS0FBSztBQVN2QixZQUFJO0FBQ0EsY0FBSSxVQUFVLGVBQWUsUUFBUSxHQUFHO0FBQ3BDLGtCQUFNLGFBQWEsSUFBSSwrQkFBK0IsV0FBVyxRQUFRO0FBQ3pFLGdCQUFJLGNBQWMsV0FBVyxPQUFPO0FBQ2hDLHlCQUFXLFFBQVEsSUFBSSxvQkFBb0IsV0FBVyxPQUFPLE1BQU07QUFDbkUsa0JBQUksa0JBQWtCLEtBQUssV0FBVyxVQUFVLFVBQVU7QUFBQSxZQUM5RCxXQUNTLFVBQVUsUUFBUSxHQUFHO0FBQzFCLHdCQUFVLFFBQVEsSUFBSSxJQUFJLG9CQUFvQixVQUFVLFFBQVEsR0FBRyxNQUFNO0FBQUEsWUFDN0U7QUFBQSxVQUNKLFdBQ1MsVUFBVSxRQUFRLEdBQUc7QUFDMUIsc0JBQVUsUUFBUSxJQUFJLElBQUksb0JBQW9CLFVBQVUsUUFBUSxHQUFHLE1BQU07QUFBQSxVQUM3RTtBQUFBLFFBQ0osUUFDTTtBQUFBLFFBR047QUFBQSxNQUNKLENBQUM7QUFBQSxJQUNMO0FBQ0EsV0FBTyxlQUFlLEtBQUssUUFBUSxNQUFNLE1BQU0sT0FBTztBQUFBLEVBQzFEO0FBQ0EsTUFBSSxzQkFBc0IsT0FBTyxNQUFNLEdBQUcsY0FBYztBQUM1RDtBQUVBLFNBQVMsVUFBVW1CLE9BQU07QUFDckIsRUFBQUEsTUFBSyxhQUFhLFFBQVEsQ0FBQ25CLFNBQVFtQixPQUFNLFFBQVE7QUFHN0MsVUFBTSxhQUFhLGdCQUFnQm5CLE9BQU07QUFDekMsUUFBSSxvQkFBb0I7QUFDeEIsUUFBSSxjQUFjO0FBQ2xCLFFBQUksZ0JBQWdCO0FBQ3BCLFFBQUksaUJBQWlCO0FBTXJCLFVBQU0sNkJBQTZCbUIsTUFBSyxXQUFXLHFCQUFxQjtBQUN4RSxVQUFNLDBCQUEwQkEsTUFBSyxXQUFXLGtCQUFrQjtBQUNsRSxRQUFJbkIsUUFBTyx1QkFBdUIsR0FBRztBQUNqQyxNQUFBQSxRQUFPLDBCQUEwQixJQUFJQSxRQUFPLHVCQUF1QjtBQUFBLElBQ3ZFO0FBQ0EsUUFBSUEsUUFBTywwQkFBMEIsR0FBRztBQUNwQyxNQUFBbUIsTUFBSywwQkFBMEIsSUFBSUEsTUFBSyx1QkFBdUIsSUFDM0RuQixRQUFPLDBCQUEwQjtBQUFBLElBQ3pDO0FBQ0EsUUFBSSxzQkFBc0I7QUFDMUIsUUFBSSxtQkFBbUI7QUFDdkIsUUFBSSxhQUFhO0FBQ2pCLFFBQUksdUJBQXVCO0FBQzNCLFFBQUksaUNBQWlDO0FBQ3JDLFFBQUksZUFBZTtBQUNuQixRQUFJLGFBQWE7QUFDakIsUUFBSSxhQUFhO0FBQ2pCLFFBQUksc0JBQXNCO0FBQzFCLFFBQUksbUJBQW1CO0FBQ3ZCLFFBQUksd0JBQXdCO0FBQzVCLFFBQUksb0JBQW9CLE9BQU87QUFDL0IsUUFBSSxpQkFBaUI7QUFDckIsUUFBSSxtQkFBbUIsT0FBTztBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0o7QUFBQSxFQUNKLENBQUM7QUFDTDtBQUVBLFNBQVMsWUFBWW1CLE9BQU07QUFDdkIsZUFBYUEsS0FBSTtBQUNqQixnQkFBY0EsS0FBSTtBQUNsQixZQUFVQSxLQUFJO0FBQ2xCO0FBRUEsSUFBTSxTQUFTLFNBQVM7QUFDeEIsWUFBWSxNQUFNO0FBQ2xCLGFBQWEsTUFBTTsiLCJuYW1lcyI6WyJzZWxmIiwiZ2xvYmFsIiwiZGVsZWdhdGUiLCJwcm9wIiwiX2dsb2JhbCIsImV2ZW50IiwicGF0Y2hPcHRpb25zIiwicmV0dXJuVGFyZ2V0Iiwid2luZG93IiwiaGFuZGxlIiwiaGFuZGxlSWQiLCJpc1BlcmlvZGljIiwiaXNSZWZyZXNoYWJsZSIsImlzQnJvd3NlciIsImlzTWl4Iiwiem9uZVN5bWJvbEV2ZW50TmFtZXMiLCJUUlVFX1NUUiIsIkZBTFNFX1NUUiIsIlpPTkVfU1lNQk9MX1BSRUZJWCIsImludGVybmFsV2luZG93IiwiWm9uZSIsIm5hbWUiLCJsb2FkVGFza3MiLCJPYmplY3RHZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3REZWZpbmVQcm9wZXJ0eSIsIl9fc3ltYm9sX18iLCJ2YWx1ZSJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMF19