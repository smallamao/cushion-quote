"use client";

import { useCallback, useState } from "react";

import type { BusinessCardData } from "@/lib/gemini-client";

interface RecognitionState {
  status: "idle" | "uploading" | "done" | "error";
  data: BusinessCardData | null;
  imageUrl: string;
  error: string;
}

const INITIAL_STATE: RecognitionState = {
  status: "idle",
  data: null,
  imageUrl: "",
  error: "",
};

export function useBusinessCardRecognition() {
  const [state, setState] = useState<RecognitionState>(INITIAL_STATE);

  const recognize = useCallback(async (file: File) => {
    setState({ status: "uploading", data: null, imageUrl: "", error: "" });

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/business-card/recognize", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorPayload = (await response.json()) as { error?: string };
        throw new Error(errorPayload.error ?? "辨識失敗");
      }

      const result = (await response.json()) as {
        ok: boolean;
        data: BusinessCardData;
        imageUrl: string;
      };

      setState({
        status: "done",
        data: result.data,
        imageUrl: result.imageUrl,
        error: "",
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "辨識失敗";
      setState({ status: "error", data: null, imageUrl: "", error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, recognize, reset };
}
