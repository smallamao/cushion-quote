import "server-only";

import { createHash } from "node:crypto";

export interface GivemeAuthFields {
  timeStamp: string;
  uncode: string;
  idno: string;
  sign: string;
}

export function buildGivemeSign(timeStamp: string, idno: string, password: string): string {
  return createHash("md5").update(`${timeStamp}${idno}${password}`).digest("hex").toUpperCase();
}

export function createGivemeAuthFields(params: {
  timeStamp?: string;
  uncode: string;
  idno: string;
  password: string;
}): GivemeAuthFields {
  const timeStamp = params.timeStamp ?? Date.now().toString();
  return {
    timeStamp,
    uncode: params.uncode,
    idno: params.idno,
    sign: buildGivemeSign(timeStamp, params.idno, params.password),
  };
}
