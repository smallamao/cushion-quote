import { describe, expect, it } from "vitest";

import { getTrelloAttachmentImageUrls, type TrelloAttachment } from "@/lib/trello-helpers";

function makeAttachment(overrides: Partial<TrelloAttachment>): TrelloAttachment {
  return {
    id: "att",
    name: "photo.jpg",
    url: "https://example.com/original.jpg",
    mimeType: "image/jpeg",
    bytes: 123,
    date: "2026-01-01T00:00:00.000Z",
    isUpload: true,
    previews: [],
    ...overrides,
  };
}

describe("getTrelloAttachmentImageUrls", () => {
  it("selects the newest usable image attachment instead of the last attachment", () => {
    const olderImage = makeAttachment({
      id: "older-image",
      url: "https://example.com/older-original.jpg",
      previews: [{ id: "p1", url: "https://example.com/older-thumb.jpg", width: 100, height: 100, scaled: true }],
    });
    const newestFile = makeAttachment({
      id: "newest-file",
      name: "invoice.pdf",
      url: "https://example.com/invoice.pdf",
      mimeType: "application/pdf",
      previews: [],
    });

    expect(getTrelloAttachmentImageUrls([olderImage, newestFile], "thumbnail")).toEqual([
      "https://example.com/older-thumb.jpg",
      "https://example.com/older-original.jpg",
    ]);
  });

  it("orders thumbnail candidates from small to large and removes duplicates", () => {
    const attachment = makeAttachment({
      previews: [
        { id: "p1", url: "https://example.com/p1.jpg", width: 80, height: 80, scaled: true },
        { id: "p2", url: "https://example.com/p2.jpg", width: 240, height: 240, scaled: true },
        { id: "p3", url: "https://example.com/p3.jpg", width: 480, height: 480, scaled: true },
      ],
      url: "https://example.com/p3.jpg",
    });

    expect(getTrelloAttachmentImageUrls([attachment], "thumbnail")).toEqual([
      "https://example.com/p1.jpg",
      "https://example.com/p2.jpg",
      "https://example.com/p3.jpg",
    ]);
  });

  it("orders full-size candidates from large to small and falls back to the original url", () => {
    const attachment = makeAttachment({
      previews: [
        { id: "p1", url: "https://example.com/p1.jpg", width: 80, height: 80, scaled: true },
        { id: "p2", url: "https://example.com/p2.jpg", width: 240, height: 240, scaled: true },
        { id: "p3", url: "https://example.com/p3.jpg", width: 480, height: 480, scaled: true },
      ],
      url: "https://example.com/original.jpg",
    });

    expect(getTrelloAttachmentImageUrls([attachment], "full")).toEqual([
      "https://example.com/p3.jpg",
      "https://example.com/p2.jpg",
      "https://example.com/p1.jpg",
      "https://example.com/original.jpg",
    ]);
  });

  it("accepts attachments with previews even when mimeType is not image/*", () => {
    const attachment = makeAttachment({
      id: "preview-only",
      mimeType: "application/octet-stream",
      previews: [{ id: "p1", url: "https://example.com/p1.jpg", width: 120, height: 120, scaled: true }],
    });

    expect(getTrelloAttachmentImageUrls([attachment], "thumbnail")).toEqual([
      "https://example.com/p1.jpg",
      "https://example.com/original.jpg",
    ]);
  });

  it("returns no candidates when the card has no usable image attachments", () => {
    const pdfAttachment = makeAttachment({
      id: "pdf",
      name: "invoice.pdf",
      url: "https://example.com/invoice.pdf",
      mimeType: "application/pdf",
      previews: [],
    });

    expect(getTrelloAttachmentImageUrls([pdfAttachment], "full")).toEqual([]);
  });
});
