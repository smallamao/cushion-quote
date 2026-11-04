"use client";

import { useEffect, useState } from "react";

/**
 * 只有觸控、沒有滑鼠＝軟體鍵盤，按不出 Shift+Enter。
 *
 * 刻意不用 useIsMobile（那是看視窗寬度）：桌機把視窗縮窄不該變成手機行為，
 * 平板寬度夠寬卻照樣是軟體鍵盤。要判斷的是鍵盤，不是螢幕大小。
 */
const TOUCH_DEVICE = "(hover: none) and (pointer: coarse)";

export function useTouchDevice(): boolean {
  const [touchDevice, setTouchDevice] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(TOUCH_DEVICE);
    setTouchDevice(mql.matches);

    function handleChange(e: MediaQueryListEvent) {
      setTouchDevice(e.matches);
    }

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return touchDevice;
}
