export interface QuickstartRouteInfo {
  name: string;
  url: string;
}

export interface QuickstartStatusResponse {
  release: {
    name: string;
    namespace: string;
    status: string;
    chart: string;
    appVersion: string;
  };
  routes: QuickstartRouteInfo[];
}
