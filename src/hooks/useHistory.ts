"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseHistoryReturn<T> {
  state: T;
  setState: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initialState: T, maxSize = 50): UseHistoryReturn<T> {
  const [state, setInternalState] = useState<T>(initialState);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const initialStateRef = useRef(initialState);

  useEffect(() => {
    if (Object.is(initialStateRef.current, initialState)) return;

    initialStateRef.current = initialState;
    pastRef.current = [];
    futureRef.current = [];
    setInternalState(initialState);
  }, [initialState]);

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    setInternalState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      pastRef.current = [...pastRef.current.slice(-(maxSize - 1)), prev];
      futureRef.current = [];
      return resolved;
    });
  }, [maxSize]);

  const undo = useCallback(() => {
    setInternalState((current) => {
      if (pastRef.current.length === 0) return current;
      const previous = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setInternalState((current) => {
      if (futureRef.current.length === 0) return current;
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, current];
      return next;
    });
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
