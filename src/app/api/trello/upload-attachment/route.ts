import { NextResponse } from "next/server";

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

export async function POST(request: Request) {
  const formData = await request.formData();
  const cardId = formData.get("cardId");
  const file = formData.get("file");

  if (!cardId || typeof cardId !== "string") {
    return NextResponse.json({ error: "missing cardId" }, { status: 400 });
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  const trelloForm = new FormData();
  trelloForm.append("file", file);

  const url = `https://api.trello.com/1/cards/${cardId}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { method: "POST", body: trelloForm });
  const data = await res.json() as unknown;
  return NextResponse.json(data, { status: res.status });
}
