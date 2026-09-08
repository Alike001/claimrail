export interface SignatureOrigin {
  readonly domain: string;
  readonly uri: string;
}

export function signatureOrigin(request: Request, pathname: string): SignatureOrigin {
  const requestUrl = new URL(request.url);
  if (requestUrl.protocol !== "https:" && requestUrl.hostname !== "localhost") {
    throw new Error("wallet authorization requires HTTPS");
  }
  return {
    domain: requestUrl.host,
    uri: new URL(pathname, requestUrl.origin).toString(),
  };
}
