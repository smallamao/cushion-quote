"use client";

import { useCallback, useState } from "react";

import type { BusinessCardData } from "@/lib/gemini-client";

interface RecognitionState {
  status: "idle" | "uploading" | "done" | "error";
  data: BusinessCardData | null;
  imageUrls: string[];
  error: string;
}

const INITIAL_STATE: RecognitionState = {
  status: "idle",
  data: null,
  imageUrls: [],
  error: "",
};

export function useBusinessCardRecognition() {
  const [state, setState] = useState<RecognitionState>(INITIAL_STATE);

  const recognize = useCallback(async (files: File[]) => {
    setState({ status: "uploading", data: null, imageUrls: [], error: "" });

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("images", file);
      }

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
        imageUrls: string[];
      };

      setState({
        status: "done",
        data: result.data,
        imageUrls: result.imageUrls,
        error: "",
      });

      return { data: result.data, imageUrls: result.imageUrls };
    } catch (err) {
      const message = err instanceof Error ? err.message : "辨識失敗";
      setState({ status: "error", data: null, imageUrls: [], error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, recognize, reset };
}
