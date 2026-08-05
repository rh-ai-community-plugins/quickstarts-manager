import http from 'http';

export class HttpsProxyAgent extends http.Agent {
  proxy: string;
  constructor(proxy: string) {
    super();
    this.proxy = proxy;
  }
}
