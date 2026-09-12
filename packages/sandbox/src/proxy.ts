import http from 'http';
import https from 'https';
import { TrafficCapture } from './runner';

export class ProxyServer {
  private server: http.Server;
  private captures: TrafficCapture[] = [];
  private port: number;

  constructor(port: number = 8888) {
    this.port = port;
    this.server = this.createServer();
  }

  private createServer(): http.Server {
    return http.createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '';
    const method = req.method || 'GET';

    // Capture the request
    const capture: TrafficCapture = {
      timestamp: new Date(),
      method,
      url,
      headers: req.headers as Record<string, string>,
    };

    // Forward the request
    const targetUrl = new URL(url);
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method,
      headers: req.headers,
    };

    const proxyReq = client.request(options, (proxyRes) => {
      // Capture the response
      capture.response = {
        status: proxyRes.statusCode || 0,
        headers: proxyRes.headers as Record<string, string>,
      };

      this.captures.push(capture);

      // Forward the response
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      console.error('Proxy error:', error);
      res.writeHead(502);
      res.end('Bad Gateway');
    });

    // Forward request body
    req.pipe(proxyReq);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`Proxy server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Proxy server stopped');
        resolve();
      });
    });
  }

  getCaptures(): TrafficCapture[] {
    return [...this.captures];
  }

  clearCaptures(): void {
    this.captures = [];
  }

  getPort(): number {
    return this.port;
  }
}
